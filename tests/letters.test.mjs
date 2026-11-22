// Cover letters (version 6): the template, search, prompts and backups.

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../app/js/store.js';
import { normalize } from '../app/js/model.js';
import { letterTemplate, unfilledPrompts, searchLetters, normalizeLetter, saveLetter, listLetters, lettersFor, letterFileName, letterHtml } from '../app/js/letters.js';
import { buildBackup, importBackup } from '../app/js/backup.js';

before(async () => {
  const warn = console.warn;
  console.warn = () => {};
  await store.init();
  console.warn = warn;
});

beforeEach(async () => {
  await store.clearStore(store.STORES.letters);
});

const profile = {
  firstName: 'Alex', lastName: 'Chen', email: 'alex@example.com', phone: '0400 000 000',
  experience: [{ title: 'Analyst', company: 'Northwind', current: true }],
  skills: ['SQL', 'Python', 'Power BI'],
};

test('the template uses the profile and the job, and leaves the rest in [brackets]', () => {
  const body = letterTemplate(profile, { company: 'Contoso', title: 'Data Analyst' });
  assert.match(body, /apply for the Data Analyst role at Contoso/);
  assert.match(body, /current role as Analyst at Northwind/);
  assert.match(body, /SQL, Python, Power BI/);
  assert.match(body, /Alex Chen\nalex@example.com · 0400 000 000$/);
  assert.ok(unfilledPrompts(body).length >= 3, 'nothing is made up: the rest is for you to write');

  const bare = letterTemplate({}, {});
  assert.match(bare, /\[job title\] role at \[company\]/);
  assert.match(bare, /\[your name\]/);
});

test('search finds letters by company, job title, linked application or words', () => {
  const apps = new Map([['x', normalize({ id: 'x', company: 'Tailspin Toys', title: 'Business Analyst' })]]);
  const letters = [
    normalizeLetter({ id: '1', company: 'Contoso', jobTitle: 'Data Analyst', body: 'I love dashboards.' }),
    normalizeLetter({ id: '2', company: '', jobTitle: '', body: 'Generic letter.', appIds: ['x'] }),
  ];
  assert.deepEqual(searchLetters(letters, 'contoso', apps).map((l) => l.id), ['1']);
  assert.deepEqual(searchLetters(letters, 'tailspin', apps).map((l) => l.id), ['2'], 'through the linked application');
  assert.deepEqual(searchLetters(letters, 'dashboards', apps).map((l) => l.id), ['1']);
  assert.equal(searchLetters(letters, '', apps).length, 2);
  assert.deepEqual(lettersFor('x', letters).map((l) => l.id), ['2']);
});

test('letters are newest first, and safe to print or download', async () => {
  await saveLetter({ id: 'old', company: 'A', body: 'One' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await saveLetter({ id: 'new', company: 'B', body: 'Two <script>alert(1)</script>' });
  assert.deepEqual((await listLetters()).map((l) => l.id), ['new', 'old']);
  const html = letterHtml((await listLetters())[0]);
  assert.ok(!html.includes('<script>alert'), 'what you typed is shown as text');
  assert.equal(letterFileName({ company: 'Contoso & Co', jobTitle: 'Data Analyst' }, 'doc'), 'Cover-letter-Contoso-Co-Data-Analyst.doc');
});

test('backups carry cover letters, and restoring twice adds nothing', async () => {
  await saveLetter({ id: 'l1', company: 'Contoso', jobTitle: 'Data Analyst', body: 'Dear Hiring Manager', appIds: ['a1'] });
  const backup = JSON.parse(JSON.stringify(await buildBackup()));
  assert.equal(backup.letters.length, 1);
  await store.clearStore(store.STORES.letters);
  const file = new File([JSON.stringify(backup)], 'b.json', { type: 'application/json' });
  assert.equal((await importBackup(file)).lettersRestored, 1);
  assert.equal((await listLetters())[0].body, 'Dear Hiring Manager');
  assert.equal((await importBackup(file)).lettersRestored, 0);
});
