// The files the app needs: every file it loads must exist, and everything except
// the OCR engine must be kept for offline use. A missing file here would break the
// live app, so GitHub runs these tests before publishing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { APP_DIR, listAppFiles, cacheName, renderServiceWorker } from '../tools/build-sw.mjs';

const exists = (file) => access(path.join(APP_DIR, file)).then(() => true, () => false);

test('the offline list has the app files, and leaves out the OCR engine and sw.js', async () => {
  const files = await listAppFiles();
  assert.deepEqual(files.slice(0, 2), ['./', './index.html']);
  for (const needed of ['./css/styles.css', './js/app.js', './js/cv/rules.js', './manifest.webmanifest', './icons/icon-192.png', './vendor/pdfjs/pdf.min.mjs']) {
    assert.ok(files.includes(needed), `${needed} is kept offline`);
  }
  assert.ok(!files.some((file) => file.includes('tesseract')), 'the OCR engine is only downloaded when needed');
  assert.ok(!files.includes('./sw.js'));
  assert.ok(!files.some((file) => /LICENSE|VERSION/.test(file)));
  for (const file of files.slice(1)) assert.ok(await exists(file), `${file} exists`);
});

test('every file the app imports exists, and is kept offline unless it is the OCR engine', async () => {
  const files = new Set(await listAppFiles());
  const scripts = [...files].filter((file) => file.endsWith('.js') && file.startsWith('./js/'));
  const importPattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
  let checked = 0;
  for (const script of scripts) {
    const source = await readFile(path.join(APP_DIR, script), 'utf8');
    for (const [, specifier] of source.matchAll(importPattern)) {
      const target = `./${path.posix.normalize(path.posix.join(path.posix.dirname(script.slice(2)), specifier))}`;
      assert.ok(await exists(target), `${script} imports ${specifier}, which is missing`);
      if (!target.includes('/vendor/tesseract/')) assert.ok(files.has(target), `${target} (imported by ${script}) is not in the offline list`);
      checked += 1;
    }
  }
  assert.ok(checked > 50, `found the imports (${checked})`);
});

test('every script in the app has valid syntax', async () => {
  // Most screens only run in a browser, so the other tests never load them. This
  // catches a typo in any of them before it reaches the live site.
  const { execFileSync } = await import('node:child_process');
  const scripts = (await listAppFiles()).filter((file) => file.startsWith('./js/') && file.endsWith('.js'));
  assert.ok(scripts.length > 30);
  for (const script of scripts) {
    try {
      execFileSync(process.execPath, ['--check', path.join(APP_DIR, script)], { stdio: 'pipe' });
    } catch (error) {
      assert.fail(`${script} has a syntax error:\n${String(error.stderr).split('\n').slice(0, 5).join('\n')}`);
    }
  }
});

test('the page links only to files that exist', async () => {
  const page = await readFile(path.join(APP_DIR, 'index.html'), 'utf8');
  const links = [...page.matchAll(/\b(?:href|src)="(\.?\/?[^"#:]+)"/g)].map(([, link]) => link.replace(/^\.?\//, ''));
  assert.ok(links.length >= 4);
  for (const link of links) assert.ok(await exists(link), `index.html links to ${link}, which is missing`);
});

test('the cache name changes whenever a file changes', () => {
  const files = [{ path: './a.js', bytes: Buffer.from('one') }, { path: './b.js', bytes: Buffer.from('two') }];
  const changed = [files[0], { path: './b.js', bytes: Buffer.from('two!') }];
  assert.match(cacheName(files), /^applyful-[0-9a-f]{12}$/);
  assert.equal(cacheName(files), cacheName(files));
  assert.notEqual(cacheName(files), cacheName(changed));
});

test('sw.js gets the new list and cache name, and nothing else changes', async () => {
  const source = await readFile(path.join(APP_DIR, 'sw.js'), 'utf8');
  const updated = renderServiceWorker(source, ['./', './index.html', './js/new-file.js'], 'applyful-test');
  assert.match(updated, /^const CACHE = 'applyful-test';$/m);
  assert.match(updated, /const APP_FILES = \[\n {2}'\.\/',\n {2}'\.\/index\.html',\n {2}'\.\/js\/new-file\.js',\n\];/);
  const rest = (text) => text.replace(/^const CACHE = .*$/m, '').replace(/^const APP_FILES = \[[\s\S]*?^\];/m, '');
  assert.equal(rest(updated), rest(source));
  assert.throws(() => renderServiceWorker('nothing to update', [], 'x'));
});
