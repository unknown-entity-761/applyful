// Applications: cleaning what's typed in, required fields, status history,
// follow-ups and sorting.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, validate, withStatus, isFollowUpDue, sortApplications, countByStatus } from '../app/js/model.js';

test('cleans what was typed in', () => {
  const app = normalize({ company: '  Acme  ', title: 'Analyst', status: 'nonsense', postingUrl: 'jobs.acme.com/1', appliedOn: '21/11/2026' });
  assert.equal(app.company, 'Acme');
  assert.equal(app.status, 'applied', 'an unknown status becomes Applied');
  assert.equal(app.postingUrl, 'https://jobs.acme.com/1', 'https:// is added');
  assert.equal(app.appliedOn, '', 'dates must be YYYY-MM-DD');
  assert.ok(app.id, 'gets an id');
});

test('company and job title are required; links must be web links', () => {
  assert.deepEqual(Object.keys(validate(normalize({}))), ['company', 'title']);
  assert.deepEqual(validate(normalize({ company: 'Acme', title: 'Analyst' })), {});
  const unsafe = validate(normalize({ company: 'Acme', title: 'Analyst', postingUrl: 'javascript:alert(1)', loginEmail: 'not-an-email' }));
  assert.ok(unsafe.postingUrl && unsafe.loginEmail);
});

test('changing the status records it in the history', () => {
  const app = normalize({ company: 'Acme', title: 'Analyst', status: 'applied' });
  const moved = withStatus(app, 'interview');
  assert.equal(moved.status, 'interview');
  assert.deepEqual(moved.statusHistory.map((entry) => entry.status), ['interview']);
  assert.equal(withStatus(moved, 'interview'), moved, 'the same status changes nothing');
});

test('follow-ups are due on the day, and not for closed applications', () => {
  const app = normalize({ company: 'Acme', title: 'Analyst', followUpOn: '2026-11-20' });
  assert.equal(isFollowUpDue(app, '2026-11-19'), false);
  assert.equal(isFollowUpDue(app, '2026-11-20'), true);
  assert.equal(isFollowUpDue({ ...app, status: 'rejected' }, '2026-11-25'), false);
});

test('sorting and counting', () => {
  const apps = [
    normalize({ company: 'beta', title: 'B', appliedOn: '2026-03-01', status: 'interview' }),
    normalize({ company: 'Alpha', title: 'A', appliedOn: '2026-01-02' }),
    normalize({ company: 'Gamma', title: 'C', appliedOn: '2025-12-30', status: 'offer' }),
  ];
  assert.deepEqual(sortApplications(apps).map((a) => a.company), ['beta', 'Alpha', 'Gamma'], 'newest applied first');
  assert.deepEqual(sortApplications(apps, 'applied-asc').map((a) => a.company), ['Gamma', 'Alpha', 'beta']);
  assert.deepEqual(sortApplications(apps, 'company-asc').map((a) => a.company), ['Alpha', 'beta', 'Gamma'], 'A to Z ignores capitals');
  const counts = countByStatus(apps);
  assert.deepEqual([counts.applied, counts.interview, counts.offer], [1, 1, 1]);
});
