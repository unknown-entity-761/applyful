// Service worker: keeps a copy of the app's files so it opens even with no signal.
// Strategy: try the network first (so updates show up right away), and fall back
// to the saved copy when offline. Your data isn't here; it lives in IndexedDB.

const CACHE = 'job-tracker-v5';

const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/analytics.js',
  './js/config.js',
  './js/router.js',
  './js/store.js',
  './js/model.js',
  './js/ui.js',
  './js/prefs.js',
  './js/profile.js',
  './js/theme.js',
  './js/backup.js',
  './js/install.js',
  './js/content/legal.js',
  './js/cv/extract.js',
  './js/cv/rules.js',
  './js/cv/zip.js',
  './vendor/pdfjs/pdf.min.mjs',
  './vendor/pdfjs/pdf.worker.min.mjs',
  './js/views/components.js',
  './js/views/cv-check.js',
  './js/views/fields.js',
  './js/views/home.js',
  './js/views/applications.js',
  './js/views/activity.js',
  './js/views/profile.js',
  './js/views/profile-edit.js',
  './js/views/form.js',
  './js/views/detail.js',
  './js/views/settings.js',
  './js/views/settings-pages.js',
  './js/views/legal.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
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
