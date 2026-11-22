// Service worker: keeps a copy of the app's files so it opens even with no signal.
// Strategy: try the network first (so updates show up right away), and fall back
// to the saved copy when offline. Your data isn't here; it lives in IndexedDB.
//
// CACHE and APP_FILES are written by tools/build-sw.mjs (npm run build-sw), which
// GitHub also runs before every publish. Don't edit them by hand. The cache name
// changes whenever a file changes, so phones pick up each new version.

const CACHE = 'foliofy-710d83bea73f';

const APP_FILES = [
  './',
  './index.html',
  './css/styles.css',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  './js/analytics.js',
  './js/app.js',
  './js/backup.js',
  './js/calendar.js',
  './js/config.js',
  './js/content/legal.js',
  './js/cv/extract.js',
  './js/cv/ocr.js',
  './js/cv/parse.js',
  './js/cv/rules.js',
  './js/cv/text.js',
  './js/cv/zip.js',
  './js/install.js',
  './js/model.js',
  './js/prefs.js',
  './js/profile.js',
  './js/router.js',
  './js/store.js',
  './js/theme.js',
  './js/ui.js',
  './js/views/activity.js',
  './js/views/applications.js',
  './js/views/components.js',
  './js/views/cv-check.js',
  './js/views/detail.js',
  './js/views/fields.js',
  './js/views/form.js',
  './js/views/home.js',
  './js/views/legal.js',
  './js/views/profile-edit.js',
  './js/views/profile-import.js',
  './js/views/profile.js',
  './js/views/settings-pages.js',
  './js/views/settings.js',
  './js/views/shell.js',
  './js/views/welcome.js',
  './manifest.webmanifest',
  './vendor/pdfjs/pdf.min.mjs',
  './vendor/pdfjs/pdf.worker.min.mjs',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }),
  );
});
