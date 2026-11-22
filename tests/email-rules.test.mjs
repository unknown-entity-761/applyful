// Email import (version 5): recognising job emails without AI. Sample emails are
// written like the real ones portals and recruiters send.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJobEmail, kindOf, signatureOf, ownText } from '../app/js/email/rules.js';

const email = (from, subject, text, extra = {}) => ({
  id: 'm1', threadId: 't1', date: '2026-11-20T09:00:00.000Z', to: ['alex.jobs@gmail.com'],
  from, subject, text, ...extra,
});

test('a Workday confirmation: company, title, job number and portal', () => {
  const found = readJobEmail(email(
    { name: 'Contoso Careers', email: 'contoso@myworkday.com' },
    'Thank you for applying to Contoso',
    `Dear Alex,

Thank you for your application for the Data Analyst position (Job ID: R-10442). We have received your application and our team will review it.

If you have not heard from us within four weeks, please consider your application unsuccessful on this occasion... we receive a high number of applications.

Kind regards,
Contoso Talent Acquisition`,
  ));
  assert.equal(found.kind, 'confirmation', 'a line about not hearing back isn’t a rejection');
  assert.equal(found.company, 'Contoso');
  assert.equal(found.title, 'Data Analyst');
  assert.equal(found.jobId, 'R-10442');
  assert.equal(found.portal, 'Workday');
  assert.equal(found.person, false);
});

test('“if you are unsuccessful” in a confirmation is not a rejection; a real rejection is', () => {
  assert.equal(kindOf('Application received', 'Thanks for applying. Unfortunately we are unable to respond to every applicant individually.'), 'confirmation');
  assert.equal(kindOf('Your application', 'Thank you for applying. Unfortunately, we have decided to move forward with other candidates.'), 'rejection');
  assert.equal(kindOf('Update on your application', 'After careful consideration, we regret to inform you that you have not been successful.'), 'rejection');
  assert.equal(kindOf('Northwind - Graduate Analyst', 'We will not be progressing your application further.'), 'rejection');
});

test('a Greenhouse rejection names the company from the words, not the portal', () => {
  const found = readJobEmail(email(
    { name: 'Greenhouse', email: 'no-reply@us.greenhouse-mail.io' },
    'Your application to Fabrikam',
    `Hi Alex,

Thank you for your interest in the Product Analyst role at Fabrikam. Unfortunately, we won't be moving forward with your application at this time.

Best,
The Fabrikam Recruiting Team`,
  ));
  assert.equal(found.kind, 'rejection');
  assert.equal(found.company, 'Fabrikam');
  assert.equal(found.title, 'Product Analyst');
  assert.equal(found.portal, 'Greenhouse');
});

test('a recruiter’s interview invite: a person, with their title and phone from the signature', () => {
  const found = readJobEmail(email(
    { name: 'Priya Natarajan', email: 'priya.natarajan@tailspintoys.com' },
    'Re: Business Analyst application',
    `Hi Alex,

Thanks for applying. I'd love to invite you to a phone interview next week. Could you share a few times that suit?

Kind regards,
Priya Natarajan
Senior Talent Acquisition Partner
Tailspin Toys
+61 2 9876 5432

On Mon, 17 Nov 2026 at 10:02, Alex <alex.jobs@gmail.com> wrote:
> Thank you for your time`,
  ));
  assert.equal(found.kind, 'interview');
  assert.equal(found.company, 'Tailspin Toys', 'from the signature, not the recruiter’s name');
  assert.equal(found.title, 'Business Analyst');
  assert.equal(found.person, true);
  assert.deepEqual(found.contact, {
    name: 'Priya Natarajan', title: 'Senior Talent Acquisition Partner', email: 'priya.natarajan@tailspintoys.com', phone: '+61 2 9876 5432',
  });
});

test('assessment invites, including a “video interview” that is really an assessment', () => {
  assert.equal(kindOf('Your HackerRank assessment for Woodgrove', 'Please complete the coding assessment within 5 days.'), 'assessment');
  assert.equal(kindOf('Next step: video interview', 'You are invited to complete a one-way video interview on HireVue.'), 'assessment');
  assert.equal(kindOf('Next steps', 'We would like to invite you to complete our online assessment.'), 'assessment');
});

test('an offer', () => {
  assert.equal(kindOf('Congratulations!', 'We are delighted to offer you the position of Analyst. Your letter of offer is attached.'), 'offer');
});

test('job alerts and newsletters are left alone', () => {
  assert.equal(kindOf('12 new jobs matching Data Analyst', 'Jobs you may be interested in. Unsubscribe from these alerts.'), '');
  assert.equal(kindOf('Verify your email', 'Please verify your email to create your candidate account.'), '');
});

test('the email’s own words stop where a quoted reply starts', () => {
  assert.equal(ownText('Thanks!\n\nOn Mon, 1 Dec 2026 at 09:00, Jo <jo@x.com> wrote:\n> old text'), 'Thanks!\n');
  assert.equal(ownText('Hello\n-----Original Message-----\nold'), 'Hello');
});

test('a signature with no sign-off still finds a phone number', () => {
  const sig = signatureOf('Let me know.\n\nJordan Lee | Recruiter\nM: 0412 345 678', 'Jordan Lee');
  assert.equal(sig.phone, '0412 345 678');
  assert.equal(sig.name, 'Jordan Lee');
});
