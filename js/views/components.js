// Pieces shared by several screens: the floating tab bar, the header for sub-pages,
// an application card, and the empty state.

import { html, raw, icon, relativeDays } from '../ui.js';
import { statusInfo, isFollowUpDue, followUpText } from '../model.js';
import { back } from '../router.js';

const TABS = [
  { id: 'home', href: '#/', label: 'Home', icon: 'home' },
  { id: 'applications', href: '#/applications', label: 'Jobs', icon: 'jobs' },
  { id: 'add', href: '#/new', label: 'Add', icon: 'plus', extra: ' application' },
  { id: 'activity', href: '#/activity', label: 'Activity', icon: 'bell' },
  { id: 'profile', href: '#/profile', label: 'Profile', icon: 'user' },
];

/** The floating tab bar. `active` is the id of the current tab. */
export function tabBar(active) {
  return html`
    <nav class="tabbar" aria-label="Main">
      ${TABS.map((tab) => html`
        <a class="tab ${tab.id === 'add' ? 'tab-add' : ''}" href="${tab.href}" ${tab.id === active && raw('aria-current="page"')}>
          <span class="tab-icon">${icon(tab.icon)}</span>
          <span class="tab-label">${tab.label}${tab.extra && html`<span class="visually-hidden">${tab.extra}</span>`}</span>
        </a>`)}
    </nav>`;
}

/** Header for pages opened from a tab: back arrow, centered title, optional item on the right. */
export function subHeader(title, right = null) {
  return html`
    <header class="topbar">
      <button type="button" class="icon-btn" data-action="back" aria-label="Back">${icon('back')}</button>
      <h1 class="topbar-title" tabindex="-1">${title}</h1>
      ${right || html`<span aria-hidden="true"></span>`}
    </header>`;
}

/** Makes the sub-page back arrow work. `fallback` is used if the page was opened directly. */
export function wireBack(screen, fallback) {
  screen.querySelector('[data-action="back"]')?.addEventListener('click', () => back(fallback));
}

/** One application in a list: company, job title, portal, date, follow-up badge and status. */
export function appCard(app, today) {
  const status = statusInfo(app.status);
  const applied = app.status === 'saved' ? 'Not applied yet' : app.appliedOn && `Applied ${relativeDays(app.appliedOn, today)}`;
  const meta = [app.portal, applied].filter(Boolean).join(' · ');

  return html`
    <li>
      <a class="card" href="#/a/${encodeURIComponent(app.id)}">
        <span class="card-body">
          <span class="card-company">${app.company}</span>
          <span class="card-title">${app.title}</span>
          ${meta && html`<span class="card-meta">${meta}</span>`}
          ${isFollowUpDue(app, today) && html`<span class="card-due">${icon('clock')} ${followUpText(app, today)}</span>`}
        </span>
        <span class="pill status-${status.id}">${status.label}</span>
      </a>
    </li>`;
}

export function emptyState() {
  return html`
    <div class="empty">
      <div class="empty-icon">${icon('briefcase')}</div>
      <h2>No applications yet</h2>
      <p>Add the jobs you apply for, and keep every portal, login email and follow-up in one place.</p>
      <a class="btn primary" href="#/new">Add your first application</a>
    </div>`;
}
