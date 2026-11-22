// CV and LinkedIn files: only real PDFs open in the browser; other types download.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeDocType, isRealPdf } from '../app/js/profile.js';

test('only the three CV file types are kept; anything else becomes a download', () => {
  assert.equal(safeDocType('application/pdf', 'cv.pdf'), 'application/pdf');
  assert.equal(safeDocType('', 'cv.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(safeDocType('text/html;x=pdf', 'cv.pdf'), 'application/pdf', 'a disguised type is ignored');
  assert.equal(safeDocType('text/html', 'page.html'), 'application/octet-stream');
});

test('a file only counts as a PDF if it starts like one', () => {
  const pdf = new TextEncoder().encode('%PDF-1.7 ...').buffer;
  const html = new TextEncoder().encode('<script>alert(1)</script>').buffer;
  assert.equal(isRealPdf({ type: 'application/pdf', data: pdf }), true);
  assert.equal(isRealPdf({ type: 'application/pdf', data: html }), false);
  assert.equal(isRealPdf({ type: 'text/html', data: pdf }), false);
});
