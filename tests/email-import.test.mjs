// Email import (version 5): what emails do to applications. No Gmail here: the
// emails are written like real ones and handed straight to the planner.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const saved = new Map();
globalThis.localStorage = {
  getItem: (key) => (saved.has(key) ? saved.get(key) : null),
  setItem: (key, value) => saved.set(key, String(value)),
  removeItem: (key) => saved.delete(key),
};

const store = await import('../app/js/store.js');
const { normalize } = await import('../app/js/model.js');
const { planEmails, movesForward, emailUpdates, emailsToReview, undoUpdate, linkReviewed, addReviewed } = await import('../app/js/email/import.js');
const { toEmail, htmlToText, parseAddress } = await import('../app/js/email/gmail.js');

const warn = console.warn;
console.warn = () => {};
await store.init();
console.warn = warn;

const ME = 'alex.jobs@gmail.com';
let n = 0;
const email = (from, subject, text, { threadId = `t${++n}`, date = `2026-11-${String(10 + n).padStart(2, '0')}T09:00:00.000Z` } = {}) => ({
  id: `m${n}`, threadId, date, to: [ME], from, subject, text,
});

const confirmation = (company, title, threadId) => email(
  { name: `${company} Careers`, email: `${company.toLowerCase()}@myworkday.com` },
  `Thank you for applying to ${company}`,
  `Thank you for your application for the ${title} position. We have received your application.`,
  { threadId },
);

beforeEach(async () => {
  saved.clear();
  await store.clearStore(store.STORES.applications);
});

test('a confirmation adds the application, with the email you applied with', () => {
  const plan = planEmails([confirmation('Contoso', 'Data Analyst', 'thread-a')], [], { myAddress: ME });
  const [app] = plan.apps.values();
  assert.equal(app.company, 'Contoso');
  assert.equal(app.title, 'Data Analyst');
  assert.equal(app.status, 'applied');
  assert.equal(app.loginEmail, ME, 'the PRD’s first question: which email did I use?');
  assert.equal(app.portal, 'Workday');
  assert.deepEqual(app.emailThreads, ['thread-a']);
  assert.deepEqual(plan.updates.map((u) => u.action), ['added']);
});

test('later emails in the same conversation move it on; the date is the email’s', () => {
  const emails = [
    confirmation('Contoso', 'Data Analyst', 'thread-a'),
    email({ name: 'Contoso Careers', email: 'contoso@myworkday.com' }, 'Re: Thank you for applying to Contoso', 'Please complete the online assessment within 5 days.', { threadId: 'thread-a' }),
    email({ name: 'Contoso Careers', email: 'contoso@myworkday.com' }, 'Update on your application', 'We regret to inform you that we will not be progressing your application.', { threadId: 'thread-a' }),
  ];
  const plan = planEmails(emails, [], { myAddress: ME });
  const [app] = plan.apps.values();
  assert.equal(app.status, 'rejected');
  assert.deepEqual(app.statusHistory.map((h) => h.status), ['applied', 'assessment', 'rejected']);
  assert.equal(app.statusHistory[2].at, emails[2].date);
  assert.deepEqual(plan.updates.map((u) => u.action), ['added', 'status', 'status']);
});

test('an email never moves an application backwards', () => {
  assert.equal(movesForward('interview', 'assessment'), false);
  assert.equal(movesForward('offer', 'interview'), false);
  assert.equal(movesForward('interview', 'rejected'), true);
  assert.equal(movesForward('ghosted', 'interview'), true, 'they came back');
  assert.equal(movesForward('rejected', 'interview'), false);
});

test('matching: job number, then exact title at the company, then the only active one at that company', () => {
  const apps = [
    normalize({ id: 'x', company: 'Tailspin Toys', title: 'Business Analyst', status: 'applied', jobId: 'R-555' }),
    normalize({ id: 'y', company: 'Tailspin Toys', title: 'Data Engineer', status: 'applied' }),
    normalize({ id: 'z', company: 'Northwind', title: 'Graduate Analyst', status: 'applied' }),
  ];
  const byJob = planEmails([email({ name: 'Tailspin Toys Careers', email: 'careers@tailspintoys.com' }, 'Interview invitation', 'We would like to invite you to an interview for job ID R-555.')], apps);
  assert.equal(byJob.apps.get('x')?.status, 'interview');

  const byCompany = planEmails([email({ name: 'Northwind Careers', email: 'jobs@northwind.com' }, 'Next steps', 'We would like to invite you to an interview.')], apps);
  assert.equal(byCompany.apps.get('z')?.status, 'interview');

  const unsure = planEmails([email({ name: 'Tailspin Toys Careers', email: 'careers@tailspintoys.com' }, 'Next steps', 'We would like to invite you to an interview.')], apps);
  assert.equal(unsure.apps.size, 0, 'two Tailspin Toys applications: the app doesn’t guess');
  assert.equal(unsure.review.length, 1);
  assert.deepEqual(unsure.review[0].candidates.sort(), ['x', 'y']);
});

test('a recruiter is saved as a contact once, and updated when they write again', () => {
  const apps = [normalize({ id: 'x', company: 'Tailspin Toys', title: 'Business Analyst', status: 'applied', emailThreads: ['thread-r'] })];
  const recruiter = { name: 'Priya Natarajan', email: 'priya.natarajan@tailspintoys.com' };
  const first = email(recruiter, 'Re: Business Analyst application', 'Hi Alex, quick question about your availability.\n\nKind regards,\nPriya Natarajan\nTalent Acquisition Partner', { threadId: 'thread-r' });
  const second = email(recruiter, 'Re: Business Analyst application', 'Thanks!\n\nRegards,\nPriya Natarajan\nSenior Talent Acquisition Partner\n+61 2 9876 5432', { threadId: 'thread-r' });
  const plan = planEmails([first, second], apps);
  const app = plan.apps.get('x');
  assert.equal(app.contacts.length, 1);
  assert.deepEqual(
    { ...app.contacts[0] },
    { name: 'Priya Natarajan', title: 'Senior Talent Acquisition Partner', email: 'priya.natarajan@tailspintoys.com', phone: '+61 2 9876 5432', firstAt: first.date, lastAt: second.date },
  );
  assert.deepEqual(plan.updates.map((u) => u.action), ['contact'], 'one update for a new contact, not one per email');
});

test('job alerts and your own emails are left alone', () => {
  const plan = planEmails([
    email({ name: 'SEEK', email: 'jobmail@s.seek.com.au' }, '12 new jobs matching Data Analyst', 'Jobs you may be interested in.'),
    email({ name: 'Alex', email: ME }, 'Re: Interview', 'Thanks, Tuesday works.'),
  ], [], { myAddress: ME });
  assert.equal(plan.apps.size + plan.updates.length + plan.review.length, 0);
});

test('undo puts the status back, and removes an added application', async () => {
  const app = await store.saveApplication(normalize({ id: 'x', company: 'Contoso', title: 'Data Analyst', status: 'applied', statusHistory: [{ status: 'applied', at: '2026-11-01T00:00:00.000Z' }], emailThreads: ['thread-a'] }));
  const plan = planEmails([email({ name: 'Contoso Careers', email: 'contoso@myworkday.com' }, 'Interview invitation', 'We would like to invite you to an interview.', { threadId: 'thread-a' })], [app]);
  for (const changed of plan.apps.values()) await store.saveApplication(changed);
  saved.set('jt-email-updates', JSON.stringify(plan.updates));
  assert.equal((await store.getApplication('x')).status, 'interview');

  assert.equal(await undoUpdate(plan.updates[0].id), 'Status put back');
  const back = await store.getApplication('x');
  assert.equal(back.status, 'applied');
  assert.equal(back.statusHistory.length, 1);
  assert.equal(emailUpdates()[0].undone, true);

  const added = planEmails([confirmation('Fabrikam', 'Product Analyst', 'thread-f')], []);
  for (const changed of added.apps.values()) await store.saveApplication(changed);
  saved.set('jt-email-updates', JSON.stringify(added.updates));
  assert.equal(await undoUpdate(added.updates[0].id), 'Application removed');
  assert.equal((await store.listApplications()).some((a) => a.company === 'Fabrikam'), false);
});

test('needs a look: link it to the right application, or add it as a new one', async () => {
  await store.saveApplication(normalize({ id: 'x', company: 'Tailspin Toys', title: 'Business Analyst', status: 'applied' }));
  await store.saveApplication(normalize({ id: 'y', company: 'Tailspin Toys', title: 'Data Engineer', status: 'applied' }));
  const plan = planEmails([email({ name: 'Tailspin Toys Careers', email: 'careers@tailspintoys.com' }, 'Next steps', 'We would like to invite you to an interview.', { threadId: 'thread-t' })], await store.listApplications());
  saved.set('jt-email-review', JSON.stringify(plan.review));

  await linkReviewed(plan.review[0].id, 'y');
  const linked = await store.getApplication('y');
  assert.equal(linked.status, 'interview');
  assert.deepEqual(linked.emailThreads, ['thread-t'], 'later emails in that conversation now match it');
  assert.equal(emailsToReview().length, 0);

  const unknown = planEmails([email({ name: 'Recruitment', email: 'noreply@jobs.example.org' }, 'Your interview', 'We would like to invite you to an interview.')], []);
  saved.set('jt-email-review', JSON.stringify(unknown.review));
  const created = await addReviewed(unknown.review[0].id, { company: 'Example Org', title: 'Policy Officer' });
  assert.equal(created.status, 'interview');
  assert.deepEqual(created.statusHistory.map((h) => h.status), ['applied', 'interview']);
});

test('Gmail’s format is read into plain emails', () => {
  const b64 = (text) => Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  const message = {
    id: 'abc', threadId: 'thr', internalDate: String(Date.parse('2026-11-20T09:00:00Z')),
    payload: {
      mimeType: 'multipart/alternative',
      headers: [{ name: 'From', value: '"Contoso Careers" <contoso@myworkday.com>' }, { name: 'To', value: 'Alex <alex.jobs@gmail.com>' }, { name: 'Subject', value: 'Thank you for applying' }],
      parts: [{ mimeType: 'text/html', body: { data: b64('<p>Thank you for applying &amp; good luck</p>') } }],
    },
  };
  const read = toEmail(message);
  assert.deepEqual(read.from, { name: 'Contoso Careers', email: 'contoso@myworkday.com' });
  assert.deepEqual(read.to, ['alex.jobs@gmail.com']);
  assert.equal(read.date, '2026-11-20T09:00:00.000Z');
  assert.match(read.text, /Thank you for applying & good luck/);
  assert.equal(htmlToText('<style>x</style>a<br>b'), 'a\nb');
  assert.deepEqual(parseAddress('jo@x.com'), { name: '', email: 'jo@x.com' });
});
