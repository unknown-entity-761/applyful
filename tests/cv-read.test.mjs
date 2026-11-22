// Reading CV files: PDFs, Word files, scanned PDFs, and files the app can't read.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCv, hasReadableText, readErrorMessage } from '../app/js/cv/extract.js';
import { isLinkedInExport } from '../app/js/cv/parse.js';
import { loadFixture, wordCv, toArrayBuffer } from './helpers.mjs';

test('reads a one-column PDF CV', async () => {
  const doc = await extractCv(await loadFixture('cv-good.pdf'), { name: 'cv-good.pdf' });
  assert.equal(doc.format, 'pdf');
  assert.equal(doc.pages, 1);
  assert.equal(doc.lines[0].text, 'Alex Morgan');
  assert.equal(doc.layout.columns, false);
  assert.ok(doc.lines.some((line) => line.text === 'Mar 2022 – Present'), 'keeps each line of text');
  assert.ok(hasReadableText(doc));
});

test('notices a two-column PDF layout', async () => {
  const doc = await extractCv(await loadFixture('cv-weak.pdf'), { name: 'cv-weak.pdf' });
  assert.equal(doc.layout.columns, true);
});

test('reads a Word CV, including its table and page header', async () => {
  const doc = await extractCv(wordCv(), { name: 'cv.docx' });
  assert.equal(doc.format, 'docx');
  assert.equal(doc.layout.tables, 1);
  assert.match(doc.layout.headerText, /sam\.rivera@example\.com/);
  assert.ok(doc.lines.some((line) => line.bullet && line.text.startsWith('Grew net revenue')));
});

test('a scanned PDF has no text to read, so OCR is offered', async () => {
  const doc = await extractCv(await loadFixture('cv-scanned.pdf'), { name: 'cv-scanned.pdf' });
  assert.equal(hasReadableText(doc), false);
});

test('recognises a LinkedIn "Save to PDF" export', async () => {
  const linkedin = await extractCv(await loadFixture('linkedin.pdf'), { name: 'linkedin.pdf' });
  const cv = await extractCv(await loadFixture('cv-good.pdf'), { name: 'cv-good.pdf' });
  assert.equal(isLinkedInExport(linkedin), true);
  assert.equal(isLinkedInExport(cv), false);
});

test('explains files it cannot read', async () => {
  const cases = [
    ['old-word', [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]],
    ['unsupported', [...new TextEncoder().encode('hello there')]],
    ['damaged', [...new TextEncoder().encode('%PDF-1.4 nonsense')]],
  ];
  for (const [code, bytes] of cases) {
    await assert.rejects(extractCv(toArrayBuffer(bytes), { name: 'file' }), { name: 'CvReadError', code });
    assert.ok(readErrorMessage(code).length > 20, `has a message for ${code}`);
  }
});
