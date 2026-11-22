// Settings, opened from the ☰ button on Profile: general, notifications,
// data and privacy, and the legal pages.

import { html, raw, icon, createScreen, mount, showToast } from '../ui.js';
import { THEMES, getThemeChoice, setThemeChoice } from '../theme.js';
import { hasUsageConsent, setUsageConsent } from '../analytics.js';
import { isInstalled } from '../install.js';
import { APP_NAME, APP_VERSION } from '../config.js';
import { currentUser } from '../auth.js';
import { gmailAddress } from '../email/gmail.js';
import { subHeader, wireBack } from './components.js';

export async function renderSettings(ctx) {
  const themeChoice = getThemeChoice();
  const user = currentUser();

  const screen = createScreen(html`
    ${subHeader('Settings')}
    <main class="content">
      <section class="settings-group" aria-labelledby="set-account">
        <h2 class="group-title" id="set-account">Account</h2>
        <ul class="menu">
          ${menuRow('#/account', 'user', user ? user.email : 'Sign in or create an account', user ? 'Signed in' : 'Optional')}
        </ul>
      </section>

      <section class="settings-group" aria-labelledby="set-general">
        <h2 class="group-title" id="set-general">General</h2>
        <div class="panel">
          <p class="setting-label" id="appearance-label">${icon('sun')} Appearance</p>
          <div class="segmented" role="radiogroup" aria-labelledby="appearance-label">
            ${THEMES.map((theme) => html`
              <label class="segment">
                <input type="radio" name="theme" value="${theme.id}" ${theme.id === themeChoice && raw('checked')}>
                <span>${theme.label}</span>
              </label>`)}
          </div>
        </div>
        <ul class="menu">
          ${menuRow('#/settings/install', 'smartphone', 'Add to home screen', isInstalled() ? 'Installed' : '')}
        </ul>
      </section>

      <section class="settings-group" aria-labelledby="set-email">
        <h2 class="group-title" id="set-email">Email</h2>
        <ul class="menu">
          ${menuRow('#/settings/email', 'mail', 'Gmail', gmailAddress() ? 'Connected' : 'Not connected')}
        </ul>
      </section>

      <section class="settings-group" aria-labelledby="set-notifications">
        <h2 class="group-title" id="set-notifications">Notifications</h2>
        <ul class="menu">
          ${menuRow('#/settings/notifications', 'bell', 'Notification settings')}
        </ul>
      </section>

      <section class="settings-group" aria-labelledby="set-data">
        <h2 class="group-title" id="set-data">Data and privacy</h2>
        <div class="panel">
          <label class="switch-row">
            <span class="switch-text">
              <span class="switch-title">Analytics cookies</span>
              <span class="switch-desc">Help us improve your experience by sharing how you use the app: which screens and features, anonymously. Never your applications, profile or files.</span>
            </span>
            <input type="checkbox" class="switch" role="switch" data-setting="usage" ${hasUsageConsent() && raw('checked')}>
          </label>
        </div>
        <ul class="menu">
          ${menuRow('#/settings/data', 'database', 'Backup, restore and storage')}
          ${menuRow('#/legal/privacy', 'shield', 'Privacy policy')}
          ${menuRow('#/legal/data', 'info', 'Data we collect and keep')}
          ${menuRow('#/legal/cookies', 'info', 'Cookie policy')}
        </ul>
      </section>

      <section class="settings-group" aria-labelledby="set-about">
        <h2 class="group-title" id="set-about">About</h2>
        <ul class="menu">
          ${menuRow('#/legal/coming', 'chart', 'What’s coming', 'Preview')}
          ${menuRow('#/legal/pds', 'file', 'Product disclosure statement')}
          ${menuRow('#/legal/terms', 'file', 'Terms of use')}
          ${menuRow('#/legal/help', 'help', 'Help and feedback')}
        </ul>
      </section>

      <p class="about muted">${APP_NAME} · version ${APP_VERSION}</p>
    </main>
  `);

  wireBack(screen, '/profile');
  screen.querySelector('.segmented').addEventListener('change', (event) => {
    if (event.target.name === 'theme') setThemeChoice(event.target.value);
  });

  screen.querySelector('[data-setting="usage"]').addEventListener('change', (event) => {
    setUsageConsent(event.target.checked);
    showToast(event.target.checked ? 'Analytics cookies on. Thanks for helping improve Applyful.' : 'Analytics cookies off');
  });

  mount(screen, ctx);
}

function menuRow(href, iconName, label, detail = '') {
  return html`
    <li>
      <a class="menu-row" href="${href}">
        <span class="menu-icon">${icon(iconName)}</span>
        <span class="menu-label">${label}</span>
        ${detail && html`<span class="menu-detail">${detail}</span>`}
        ${icon('chevron')}
      </a>
    </li>`;
}
