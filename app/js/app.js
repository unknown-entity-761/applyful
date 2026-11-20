// Starts the app: applies light/dark mode, opens storage, registers the screens,
// and turns on offline mode.

import * as store from './store.js';
import { route, start, navigate } from './router.js';
import { showToast } from './ui.js';
import { applyTheme } from './theme.js';
import { renderHome } from './views/home.js';
import { renderApplications } from './views/applications.js';
import { renderActivity } from './views/activity.js';
import { renderProfile } from './views/profile.js';
import { renderProfileEdit } from './views/profile-edit.js';
import { renderCvCheck } from './views/cv-check.js';
import { renderForm } from './views/form.js';
import { renderDetail } from './views/detail.js';
import { renderSettings } from './views/settings.js';
import { renderNotifications, renderData, renderInstall } from './views/settings-pages.js';
import { renderLegal } from './views/legal.js';
import './install.js';

async function boot() {
  applyTheme();

  const mode = await store.init();
  if (mode === 'memory') {
    const banner = document.getElementById('banner');
    banner.textContent =
      'This browser is blocking storage, so anything you add is lost when you close the page. Use a normal (not private) window.';
    banner.hidden = false;
  }

  // Tabs
  route('/', (_, ctx) => renderHome(ctx));
  route('/applications', (_, ctx) => renderApplications(ctx));
  route('/activity', (_, ctx) => renderActivity(ctx));
  route('/profile', (_, ctx) => renderProfile(ctx));
  // Pages opened from the tabs
  route('/new', (_, ctx) => renderForm({}, ctx));
  route('/a/:id', (params, ctx) => renderDetail(params, ctx));
  route('/a/:id/edit', (params, ctx) => renderForm(params, ctx));
  route('/profile/edit', (_, ctx) => renderProfileEdit(ctx));
  route('/cv-check', (_, ctx) => renderCvCheck(ctx));
  // Settings (the ☰ button on Profile)
  route('/settings', (_, ctx) => renderSettings(ctx));
  route('/settings/notifications', (_, ctx) => renderNotifications(ctx));
  route('/settings/data', (_, ctx) => renderData(ctx));
  route('/settings/install', (_, ctx) => renderInstall(ctx));
  route('/legal/:page', (params, ctx) => renderLegal(params, ctx));
  start(() => navigate('/', { replace: true }));

  registerServiceWorker();
}

function registerServiceWorker() {
  // Service workers only run on https pages (and localhost while developing).
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.register('./sw.js').catch((error) => {
    console.warn('Offline mode is unavailable:', error);
  });
}

window.addEventListener('unhandledrejection', (event) => {
  console.error(event.reason);
  showToast('Something went wrong. Please try again.');
});

boot().catch((error) => {
  console.error(error);
  document.getElementById('view').textContent = 'The app couldn’t start. Reload the page to try again.';
});
