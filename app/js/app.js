// Starts the app: applies light/dark mode, opens storage, registers the screens,
// and turns on offline mode.

import * as store from './store.js';
import { route, start, navigate, refresh, onRoute } from './router.js';
import { showToast } from './ui.js';
import { applyTheme } from './theme.js';
import { APP_NAME } from './config.js';
import { renderHome } from './views/home.js';
import { renderApplications, renderJobsStart } from './views/applications.js';
import { initShell, isWide } from './views/shell.js';
import { renderActivity } from './views/activity.js';
import { renderProfile } from './views/profile.js';
import { renderProfileEdit } from './views/profile-edit.js';
import { renderCvCheck } from './views/cv-check.js';
import { renderProfileImport } from './views/profile-import.js';
import { renderForm } from './views/form.js';
import { renderDetail } from './views/detail.js';
import { renderSettings } from './views/settings.js';
import { renderNotifications, renderData, renderInstall } from './views/settings-pages.js';
import { renderLegal } from './views/legal.js';
import { renderWelcome } from './views/welcome.js';
import { needsSetup } from './profile.js';
import { handleAuthRedirect, currentUser } from './auth.js';
import { startSync } from './sync.js';
import { trackPage, setSignedInCheck } from './analytics.js';
import { showConsentBanner } from './views/consent.js';
import { renderAccount, renderSignUp, renderLogIn, renderReset, renderNewPassword } from './views/account.js';
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

  initShell();

  // Tabs
  route('/', (_, ctx) => renderHome(ctx));
  route('/applications', (_, ctx) => (isWide() ? renderJobsStart(ctx) : renderApplications(ctx)));
  route('/activity', (_, ctx) => renderActivity(ctx));
  route('/profile', (_, ctx) => renderProfile(ctx));
  // Pages opened from the tabs
  route('/new', (_, ctx) => renderForm({}, ctx));
  route('/a/:id', (params, ctx) => renderDetail(params, ctx));
  route('/a/:id/edit', (params, ctx) => renderForm(params, ctx));
  route('/profile/edit', (_, ctx) => renderProfileEdit(ctx));
  route('/profile/import/:source', (params, ctx) => renderProfileImport(params, ctx));
  route('/cv-check', (_, ctx) => renderCvCheck(ctx));
  // Settings (the ☰ button on Profile)
  route('/settings', (_, ctx) => renderSettings(ctx));
  route('/settings/notifications', (_, ctx) => renderNotifications(ctx));
  route('/settings/data', (_, ctx) => renderData(ctx));
  route('/settings/install', (_, ctx) => renderInstall(ctx));
  route('/legal/:page', (params, ctx) => renderLegal(params, ctx));
  // Account (optional sign-in)
  route('/account', (_, ctx) => renderAccount(ctx));
  route('/account/sign-up', (_, ctx) => renderSignUp(ctx));
  route('/account/log-in', (_, ctx) => renderLogIn(ctx));
  route('/account/reset', (_, ctx) => renderReset(ctx));
  route('/account/new-password', (_, ctx) => renderNewPassword(ctx));
  // First-time setup
  route('/welcome', (_, ctx) => renderWelcome(ctx));
  route('/welcome/cv', (_, ctx) => renderProfileImport({ source: 'cv' }, ctx, { setup: true }));
  route('/welcome/form', (_, ctx) => renderProfileEdit(ctx, null, { setup: true }));

  // Analytics (only after someone accepts it on the cookie banner): one page view per screen.
  setSignedInCheck(() => Boolean(currentUser()));
  onRoute((path) => trackPage(path));

  // An email link (confirming an address, or resetting a password) opens the app with
  // sign-in details in the address: take them, then show the right screen.
  const fromEmail = await handleAuthRedirect();
  if (fromEmail) history.replaceState(null, '', fromEmail.error ? '#/account' : afterEmailLink(fromEmail));

  // The first time the app opens on a device with nothing saved, start with setup.
  const opening = location.hash.replace(/^#/, '') || '/';
  if (opening === '/' && (await needsSetup((await store.listApplications()).length))) {
    history.replaceState(null, '', '#/welcome');
  }
  start(async () => {
    // An email link opened in a tab where the app was already running.
    const fromLink = await handleAuthRedirect();
    if (fromLink) {
      navigate(fromLink.error ? '/account' : afterEmailLink(fromLink).slice(1), { replace: true });
      reportEmailLink(fromLink);
      return;
    }
    navigate('/', { replace: true });
  });
  if (fromEmail) reportEmailLink(fromEmail);
  showConsentBanner();

  // Signed in: keep this device and the account in step. Changes from other devices
  // redraw the screen, unless you're in the middle of typing into a form.
  startSync({
    onRemoteChanges: () => {
      const path = location.hash.replace(/^#/, '');
      const editing = /^\/(new|a\/[^/]+\/edit|profile\/edit|welcome|account)/.test(path);
      if (!editing) refresh();
    },
  });

  registerServiceWorker();
}

// Phones keep apps open in the background for days, so the app also looks for a
// new version whenever it comes back on screen, at most this often.
const UPDATE_CHECK_MS = 15 * 60 * 1000;

const afterEmailLink = (result) => (result.type === 'recovery' ? '#/account/new-password' : '#/account');

function reportEmailLink(result) {
  if (result.error) showToast(result.error, { duration: 8000 });
  else if (result.type === 'recovery') showToast('Choose a new password');
  else showToast(`Email confirmed. You’re signed in as ${currentUser()?.email ?? 'your account'}.`, { duration: 6000 });
}

function registerServiceWorker() {
  // Service workers only run on https pages (and localhost while developing).
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  // The first install on this device isn't an update; only later versions are.
  let hasVersion = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hasVersion) offerReload();
    hasVersion = true;
  });

  navigator.serviceWorker
    .register('./sw.js')
    .then((registration) => {
      let lastCheck = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || Date.now() - lastCheck < UPDATE_CHECK_MS) return;
        lastCheck = Date.now();
        registration.update().catch(() => {}); // offline: try again next time
      });
    })
    .catch((error) => {
      console.warn('Offline mode is unavailable:', error);
    });
}

/** A new version has been downloaded. The screen still runs the old one until it reloads. */
function offerReload() {
  // If it arrived while the app was in the background, wait until it's on screen again.
  if (document.visibilityState === 'hidden') {
    document.addEventListener('visibilitychange', offerReload, { once: true });
    return;
  }
  showToast(`A new version of ${APP_NAME} is ready.`, {
    actionLabel: 'Reload',
    onAction: () => window.location.reload(),
    duration: 30_000,
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
