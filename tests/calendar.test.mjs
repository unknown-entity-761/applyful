// "Add to calendar" for follow-up dates.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { followUpIcs, googleCalendarUrl, icsFileName } from '../app/js/calendar.js';
import { normalize } from '../app/js/model.js';

const app = normalize({
  id: 'abc-123',
  company: 'Acme, Inc; Sydney',
  title: 'Data Analyst',
  portal: 'Workday',
  postingUrl: 'https://acme.wd5.myworkdayjobs.com/en-US/careers/job/Sydney/Data-Analyst_R12345?source=LinkedIn&utm=very-long-tracking-value',
  followUpOn: '2026-12-31',
});

test('the calendar file is an all-day event on the follow-up date, with a 9 am reminder', () => {
  const ics = followUpIcs(app, new Date('2026-11-22T06:30:00Z'));
  const lines = ics.split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.ok(lines.includes('DTSTART;VALUE=DATE:20261231'));
  assert.ok(lines.includes('DTEND;VALUE=DATE:20270101'), 'ends the next day, across the new year');
  assert.ok(lines.includes('TRIGGER;RELATED=START:PT9H'));
  assert.ok(lines.includes('UID:followup-abc-123@foliofy.app'));
  assert.ok(lines.includes('DTSTAMP:20261122T063000Z'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('commas, semicolons and line breaks are escaped, and long lines are folded', () => {
  const ics = followUpIcs(app);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.match(unfolded, /SUMMARY:Follow up: Data Analyst at Acme\\, Inc\\; Sydney\r\n/);
  assert.match(unfolded, /DESCRIPTION:Follow up on your application .*\\nPortal: Workday\\n/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line}`);
});

test('no follow-up date, no event', () => {
  const noDate = { ...app, followUpOn: '' };
  assert.equal(followUpIcs(noDate), '');
  assert.equal(googleCalendarUrl(noDate), '');
});

test('the Google Calendar link fills in the event', () => {
  const url = new URL(googleCalendarUrl(app));
  assert.equal(url.origin, 'https://calendar.google.com');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('dates'), '20261231/20270101');
  assert.equal(url.searchParams.get('text'), 'Follow up: Data Analyst at Acme, Inc; Sydney');
  assert.match(url.searchParams.get('details'), /Job posting: https:\/\/acme\.wd5/);
});

test('the file name is safe', () => {
  assert.equal(icsFileName(app), 'follow-up-acme-inc-sydney.ics');
  assert.equal(icsFileName({ company: '株式会社' }), 'follow-up-application.ics');
});
