// Writes the offline file list and cache name into app/sw.js, so nobody has to
// keep them up to date by hand.
//
//   npm run build-sw
//
// GitHub runs this before every publish (.github/workflows/pages.yml), so the live
// site is always right even if it wasn't run here. The cache name is made from the
// files' contents: any change gives a new name, which is how phones learn there's a
// new version (and the app then offers "Reload").

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const APP_DIR = fileURLToPath(new URL('../app/', import.meta.url));
const SW_PATH = path.join(APP_DIR, 'sw.js');

/**
 * Files the service worker should keep for offline use, as './path' strings.
 * Left out: sw.js itself, licence notes, and the OCR engine (vendor/tesseract),
 * which is large and only downloaded when someone reads a scanned CV.
 */
export const isOfflineFile = (relativePath) =>
  relativePath !== 'sw.js' &&
  !relativePath.startsWith('vendor/tesseract/') &&
  !/(^|\/)(LICENSE|VERSION)(\.\w+)?$/.test(relativePath) &&
  !relativePath.endsWith('.md');

export async function listAppFiles(dir = APP_DIR) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .filter(isOfflineFile)
    .sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
  return ['./', ...files.map((file) => `./${file}`)];
}

/** A short name that changes whenever any of the files change. */
export function cacheName(files) {
  const hash = createHash('sha256');
  for (const { path: filePath, bytes } of files) hash.update(filePath).update('\0').update(bytes).update('\0');
  return `applyful-${hash.digest('hex').slice(0, 12)}`;
}

const CACHE_LINE = /^const CACHE = '[^']*';/m;
const FILE_LIST = /^const APP_FILES = \[[\s\S]*?^\];/m;

/** sw.js with its CACHE and APP_FILES replaced. */
export function renderServiceWorker(source, files, cache) {
  if (!CACHE_LINE.test(source) || !FILE_LIST.test(source)) throw new Error('sw.js needs its CACHE line and APP_FILES list');
  const list = `const APP_FILES = [\n${files.map((file) => `  '${file}',`).join('\n')}\n];`;
  return source.replace(CACHE_LINE, () => `const CACHE = '${cache}';`).replace(FILE_LIST, () => list);
}

export async function buildServiceWorker() {
  const files = await listAppFiles();
  const contents = await Promise.all(
    files.filter((file) => file !== './').map(async (file) => ({ path: file, bytes: await readFile(path.join(APP_DIR, file)) })),
  );
  const cache = cacheName(contents);
  const source = await readFile(SW_PATH, 'utf8');
  const updated = renderServiceWorker(source, files, cache);
  if (updated !== source) await writeFile(SW_PATH, updated);
  return { cache, files, changed: updated !== source };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { cache, files, changed } = await buildServiceWorker();
  console.log(`${changed ? 'Updated' : 'Already up to date:'} app/sw.js, ${files.length} offline files, cache ${cache}`);
}
