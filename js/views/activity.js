// Activity tab: every status change across all applications, newest first.
// Each day is a dropdown showing how many changes happened that day; tap it to
// see them. In version 2, email updates will appear here as well.

import { html, raw, icon, createScreen, mount, todayISO, addDays, toISODate, formatDate, plural } from '../ui.js';
import { listApplications } from '../store.js';
import { statusInfo } from '../model.js';
import { tabBar } from './components.js';

const MAX_ITEMS = 300;

// Which days are open. null = not touched yet, so only the most recent day is open.
// Kept while the app is open, so coming back from an application keeps your place.
let openDays = null;

export async function renderActivity(ctx) {
  const apps = await listApplications();

  const events = [];
  for (const app of apps) {
    app.statusHistory.forEach((entry, i) => events.push({ app, status: entry.status, at: entry.at, first: i === 0 }));
  }
  events.sort((a, b) => b.at.localeCompare(a.at));

  // Group by the day each change happened, in local time.
  const groups = [];
  for (const event of events.slice(0, MAX_ITEMS)) {
    const day = toISODate(new Date(event.at));
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(event);
    else groups.push({ day, items: [event] });
  }

  if (openDays === null && groups.length > 0) openDays = new Set([groups[0].day]);

  const today = todayISO();
  const yesterday = addDays(today, -1);
  const dayLabel = (day) => (day === today ? 'Today' : day === yesterday ? 'Yesterday' : formatDate(day));

  const screen = createScreen(html`
    <header class="topbar topbar-large">
      <h1 class="topbar-title" tabindex="-1">Activity</h1>
    </header>
    <main class="content">
      ${groups.length === 0
        ? html`
          <div class="empty">
            <div class="empty-icon">${icon('bell')}</div>
            <h2>No activity yet</h2>
            <p>When you add an application or change its status, it shows up here.</p>
          </div>`
        : html`
          <div class="day-groups">
            ${groups.map((group) => html`
              <details class="day-group" data-day="${group.day}" ${openDays?.has(group.day) && raw('open')}>
                <summary class="day-summary">
                  <span class="day-label">${dayLabel(group.day)}</span>
                  <span class="day-count">${plural(group.items.length, 'change')}</span>
                  <span class="day-chevron">${icon('chevronDown')}</span>
                </summary>
                <ul class="activity">${group.items.map(activityItem)}</ul>
              </details>`)}
          </div>`}
    </main>
    ${tabBar('activity')}
  `);

  // Remember which days are open or closed.
  for (const details of screen.querySelectorAll('.day-group')) {
    details.addEventListener('toggle', () => {
      openDays ??= new Set();
      if (details.open) openDays.add(details.dataset.day);
      else openDays.delete(details.dataset.day);
    });
  }

  mount(screen, ctx);
}

function activityItem(event) {
  const status = statusInfo(event.status);
  const time = new Date(event.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return html`
    <li>
      <a class="activity-item status-${status.id}" href="#/a/${encodeURIComponent(event.app.id)}">
        <span class="activity-dot" aria-hidden="true"></span>
        <span class="activity-body">
          <span><strong>${event.app.company}</strong> ${event.first ? 'added as' : 'moved to'} <span class="activity-status">${status.label}</span></span>
          <span class="activity-meta">${event.app.title} · ${time}</span>
        </span>
      </a>
    </li>`;
}
