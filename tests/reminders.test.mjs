// Reminders (version 4, notifications): what's due, when it's sent, and never twice.
// The same rules run in the app (Home nudges) and in the send-reminders job.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remindersFor, needsNudge, normalizeNotify, localParts, inQuietHours, sendingMinute, isSendingTime } from '../app/js/reminders.js';

const app = (id, fields = {}) => ({
  id, company: `Company ${id}`, title: 'Analyst', status: 'applied', followUpOn: '',
  statusHistory: [{ status: 'applied', at: '2026-11-01T00:00:00.000Z' }], createdAt: '2026-11-01T00:00:00.000Z', ...fields,
});

// 9:05 am in Sydney on 23 Nov 2026 (UTC+11).
const nineInSydney = new Date('2026-11-22T22:05:00Z');
const sydney = { now: nineInSydney, timeZone: 'Australia/Sydney' };

test('local time and date come from the device’s time zone', () => {
  assert.deepEqual(localParts(nineInSydney, 'Australia/Sydney'), { date: '2026-11-23', minutes: 9 * 60 + 5 });
  assert.deepEqual(localParts(nineInSydney, 'Europe/London'), { date: '2026-11-22', minutes: 22 * 60 + 5 });
  assert.equal(localParts(nineInSydney, 'Not/AZone').date, '2026-11-22', 'an unknown zone falls back to UTC');
});

test('a follow-up due today is sent at the reminder time, once', () => {
  const apps = [app('a', { followUpOn: '2026-11-23' }), app('b', { followUpOn: '2026-11-24' }), app('c', { followUpOn: '2026-11-23', status: 'rejected' })];
  const items = remindersFor(apps, { nudges: false }, sydney);
  assert.deepEqual(items.map((i) => [i.kind, i.appId]), [['follow-up', 'a']]);
  assert.equal(items[0].title, 'Follow up with Company a');
  assert.equal(items[0].url, '#/a/a');

  assert.equal(remindersFor(apps, { nudges: false }, { ...sydney, sent: new Set([items[0].key]) }).length, 0, 'not sent twice');
  assert.equal(remindersFor(apps, { time: '17:30' }, sydney).length, 0, 'nothing before its time');
});

test('a no-reply nudge after the chosen weeks, with Mark as Ghosted', () => {
  const quiet = app('q', { statusHistory: [{ status: 'applied', at: '2026-10-20T00:00:00.000Z' }] }); // over 4 weeks
  const recent = app('r', { statusHistory: [{ status: 'applied', at: '2026-11-15T00:00:00.000Z' }] });
  assert.equal(needsNudge(quiet, nineInSydney, 3), true);
  assert.equal(needsNudge(recent, nineInSydney, 3), false);
  assert.equal(needsNudge({ ...quiet, status: 'interview' }, nineInSydney, 3), false, 'only applications still at Applied');

  const [nudge] = remindersFor([quiet, recent], { followUps: false }, sydney);
  assert.equal(nudge.kind, 'nudge');
  assert.match(nudge.body, /no reply for 4 weeks/);
  assert.deepEqual(nudge.actions, [{ action: 'ghost', title: 'Mark as Ghosted' }]);
  assert.equal(nudge.ghostUrl, '#/a/q/ghosted');
  assert.equal(remindersFor([quiet], { nudgeWeeks: 6, followUps: false }, sydney).length, 0, 'you choose the number of weeks');
  assert.equal(remindersFor([quiet], { nudges: false }, sydney).length, 0, 'and can switch nudges off');
});

test('quiet hours: a reminder time inside them waits until they end', () => {
  const settings = normalizeNotify({ time: '06:00', quietStart: '22:00', quietEnd: '07:30' });
  assert.equal(inQuietHours(6 * 60, settings), true);
  assert.equal(inQuietHours(12 * 60, settings), false);
  assert.equal(sendingMinute(settings), 7 * 60 + 30);
  assert.equal(isSendingTime(7 * 60 + 35, settings), true);
  assert.equal(isSendingTime(6 * 60 + 5, settings), false);
});

test('more than two of a kind become one summary', () => {
  const due = ['a', 'b', 'c'].map((id) => app(id, { followUpOn: '2026-11-23' }));
  const [summary] = remindersFor(due, { nudges: false }, sydney);
  assert.equal(summary.title, '3 follow-ups are due today');
  assert.equal(summary.keys.length, 3, 'each one is still marked as sent');
});

test('settings are cleaned: unknown values fall back to the defaults', () => {
  assert.deepEqual(normalizeNotify({ nudgeWeeks: 5, time: '25:00', followUps: false }), {
    followUps: false, nudges: true, nudgeWeeks: 3, time: '09:00', quietStart: '22:00', quietEnd: '07:00',
  });
});
