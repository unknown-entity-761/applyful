// Home: a welcome, the counts, and the follow-ups that are due. Nothing else,
// so it stays calm. The full list lives on the Applications tab.

import { html, icon, createScreen, mount, todayISO, formatDate, plural, showToast } from '../ui.js';
import { listApplications } from '../store.js';
import { statusInfo, isOpen, isFollowUpDue, countByStatus } from '../model.js';
import { APP_NAME } from '../config.js';
import { getProfile, saveProfile, isNamePromptDismissed, dismissNamePrompt, MAX_NAME_LENGTH } from '../profile.js';
import { tabBar, appCard, emptyState } from './components.js';
import { openApplications } from './applications.js';

const STAT_TILES = ['applied', 'interview', 'offer'];

export async function renderHome(ctx) {
  const [apps, profile] = await Promise.all([listApplications(), getProfile()]);
  const today = todayISO();
  const { firstName } = profile;
  const counts = countByStatus(apps);
  const activeCount = apps.filter(isOpen).length;

  const due = apps
    .filter((app) => isFollowUpDue(app, today))
    .sort((a, b) => a.followUpOn.localeCompare(b.followUpOn) || a.company.localeCompare(b.company));
  const next = apps
    .filter((app) => isOpen(app) && app.followUpOn > today)
    .sort((a, b) => a.followUpOn.localeCompare(b.followUpOn))[0];

  // The name comes from your profile, so once it's saved (here or on the Profile tab)
  // every visit opens with "Welcome back, <name>". In version 2, signing in fills it in.
  const greeting = firstName ? `${apps.length > 0 ? 'Welcome back' : 'Welcome'}, ${firstName}` : 'Welcome';
  const askForName = !firstName && !isNamePromptDismissed();

  const screen = createScreen(html`
    <header class="topbar topbar-large">
      <div class="welcome">
        <p class="welcome-app">${APP_NAME}</p>
        <h1 class="topbar-title" tabindex="-1">${greeting}</h1>
        ${!firstName && !askForName && html`<a class="welcome-link" href="#/profile/edit">Add your name</a>`}
      </div>
    </header>
    <main class="content">
      ${askForName && html`
        <form class="panel name-card" data-form="name">
          <label class="name-card-title" for="first-name">What should we call you?</label>
          <div class="inline-input">
            <input id="first-name" name="firstName" type="text" autocomplete="given-name" autocapitalize="words"
                   maxlength="${MAX_NAME_LENGTH}" placeholder="Your first name" enterkeyhint="done">
            <button type="submit" class="btn primary small">Save</button>
          </div>
          <button type="button" class="link-btn quiet" data-action="dismiss-name">Not now</button>
        </form>`}

      ${apps.length === 0 ? emptyState() : html`
        <section class="group" aria-labelledby="overview-heading">
          <h2 class="group-title" id="overview-heading">Overview</h2>
          <div class="stats">
            ${STAT_TILES.map((id) => html`
              <button type="button" class="stat" data-filter="${id}" aria-label="${counts[id]} ${statusInfo(id).label}, show them">
                <span class="stat-value">${counts[id]}</span>
                <span class="stat-label">${statusInfo(id).label}</span>
              </button>`)}
          </div>
          <button type="button" class="summary-link" data-filter="all">
            <span><strong>${activeCount}</strong> active of ${plural(apps.length, 'application')}</span>
            <span class="summary-cta">View all ${icon('chevron')}</span>
          </button>
        </section>

        <section class="group ${due.length > 0 ? 'group-due' : ''}" aria-labelledby="followup-heading">
          <h2 class="group-title" id="followup-heading">${icon('clock')} Follow up${due.length > 0 ? ` (${due.length})` : ''}</h2>
          ${due.length > 0
            ? html`<ul class="cards">${due.map((app) => appCard(app, today))}</ul>`
            : html`
              <div class="panel calm">
                <p><strong>You’re all caught up.</strong></p>
                <p class="muted">${next
                  ? `Next follow-up: ${next.company}, ${formatDate(next.followUpOn)}.`
                  : 'Give an application a follow-up date and it shows up here when it’s due.'}</p>
              </div>`}
        </section>`}
    </main>
    ${tabBar('home')}
  `);

  screen.addEventListener('click', (event) => {
    const tile = event.target.closest('[data-filter]');
    if (tile) {
      openApplications({ filter: tile.dataset.filter });
      return;
    }
    if (event.target.closest('[data-action="dismiss-name"]')) {
      dismissNamePrompt();
      renderHome(ctx);
    }
  });

  screen.querySelector('[data-form="name"]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = event.target.elements.firstName.value.trim();
    if (!name) {
      event.target.elements.firstName.focus();
      return;
    }
    await saveProfile({ ...profile, firstName: name });
    showToast(`Nice to meet you, ${name}`);
    renderHome(ctx);
  });

  mount(screen, ctx);
}
