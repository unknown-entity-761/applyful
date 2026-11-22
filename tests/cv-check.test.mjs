// The on-device CV check: its score, what to fix and what's strong.
// If you change a rule on purpose, update the expected results here to match.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCv } from '../app/js/cv/extract.js';
import { checkCv, scoreCv, scoreLabel, CHECK_COUNT } from '../app/js/cv/rules.js';
import { loadFixture, wordCv, TYPED_PROFILE } from './helpers.mjs';

const read = async (name) => extractCv(name.endsWith('.docx') ? wordCv() : await loadFixture(name), { name });
const ids = (items) => items.map((item) => item.id);

test('a strong CV scores well and matches LinkedIn and the profile', async () => {
  const linkedin = await read('linkedin.pdf');
  const result = checkCv(await read('cv-good.pdf'), { profile: TYPED_PROFILE, linkedin });
  assert.equal(result.checks, CHECK_COUNT);
  assert.equal(CHECK_COUNT, 13);
  assert.deepEqual(ids(result.fixes), ['too-short', 'missing-skills']);
  assert.deepEqual(ids(result.strengths), ['layout', 'contact', 'headings', 'numbers', 'duties', 'dates', 'spelling', 'matches', 'target-roles']);
  assert.deepEqual(scoreCv(result.fixes), { score: 84, label: 'Good' });
  assert.deepEqual(result.stats, { pages: 1, words: 194, points: 7, pointsWithNumbers: 6 });
});

test('a weak CV gets the most important fixes first', async () => {
  const result = checkCv(await read('cv-weak.pdf'));
  assert.deepEqual(ids(result.fixes), [
    'columns', 'no-email', 'numbers',
    'too-short', 'duties', 'date-order', 'spelling',
    'first-person', 'date-styles', 'cliches', 'references-line',
  ]);
  assert.deepEqual(result.fixes.map((fix) => fix.severity).slice(0, 3), ['high', 'high', 'high']);
  assert.deepEqual(scoreCv(result.fixes), { score: 24, label: 'Needs work' });
  const spelling = result.fixes.find((fix) => fix.id === 'spelling');
  assert.equal(spelling.title, 'Fix 4 spelling mistakes');
  assert.ok(spelling.quotes.length > 0, 'quotes the lines it is about');
});

test('a Word CV: tables and contact details in the header', async () => {
  const result = checkCv(await read('cv.docx'));
  assert.deepEqual(ids(result.fixes), ['tables', 'contact-in-header', 'too-short', 'duties', 'no-linkedin']);
  assert.deepEqual(scoreCv(result.fixes), { score: 59, label: 'Fair' });
});

test('ignoring a suggestion raises the score', async () => {
  const { fixes } = checkCv(await read('cv-weak.pdf'));
  const before = scoreCv(fixes).score;
  const after = scoreCv(fixes, ['columns']).score;
  assert.ok(after > before);
  assert.equal(scoreCv([]).score, 100);
});

test('score labels', () => {
  assert.equal(scoreLabel(90), 'Strong');
  assert.equal(scoreLabel(70), 'Good');
  assert.equal(scoreLabel(50), 'Fair');
  assert.equal(scoreLabel(49), 'Needs work');
});
