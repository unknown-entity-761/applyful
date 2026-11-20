// Applications tab: every application, with search, status filters and sorting.

import { html, raw, bool, icon, createScreen, mount, todayISO, plural } from '../ui.js';
import { listApplications } from '../store.js';
import { STATUSES, SORTS, DEFAULT_SORT, isOpen, isSortId, matchesQuery, sortApplications } from '../model.js';
import { getPref, setPref } from '../prefs.js';
import { navigate } from '../router.js';
import { tabBar, appCard, emptyState } from './components.js';

const SORT_KEY = 'jt-sort';

// Remembered between visits, so search, filter and scroll position are still
// there when you come back from an application.
const state = { query: '', filter: 'all', scrollY: 0 };

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Active' },
  ...STATUSES.map(({ id, label }) => ({ id, label })),
];

/** Opens this tab with a filter already chosen (used by the Home counts). */
export function openApplications({ filter = 'all' } = {}) {
  state.filter = FILTERS.some((f) => f.id === filter) ? filter : 'all';
  state.query = '';
  state.scrollY = 0;
  navigate('/applications');
}

function currentSort() {
  const saved = getPref(SORT_KEY, DEFAULT_SORT);
  return isSortId(saved) ? saved : DEFAULT_SORT;
}

export async function renderApplications(ctx) {
  const apps = await listApplications();
  let sortId = currentSort();

  const screen = createScreen(html`
    <header class="topbar topbar-large">
      <h1 class="topbar-title" tabindex="-1">Applications</h1>
    </header>
    <main class="content">
      ${apps.length === 0 ? emptyState() : html`
        <label class="search">
          ${icon('search')}
          <span class="visually-hidden">Search applications</span>
          <input type="search" value="${state.query}" placeholder="Search company or job title"
                 autocomplete="off" enterkeyhint="search">
        </label>
        <div class="chips" role="group" aria-label="Filter by status">
          ${FILTERS.map((f) => html`
            <button type="button" class="chip" data-filter="${f.id}" aria-pressed="${bool(state.filter === f.id)}">${f.label}</button>`)}
        </div>
        <div class="list-toolbar">
          <p class="list-count" aria-live="polite"></p>
          <label class="sort">
            ${icon('sort')}
            <span class="visually-hidden">Sort by</span>
            <select>
              ${SORTS.map((s) => html`<option value="${s.id}" ${s.id === sortId && raw('selected')}>${s.label}</option>`)}
            </select>
          </label>
        </div>
        <div class="list-area"></div>`}
    </main>
    ${tabBar('applications')}
  `);

  const area = screen.querySelector('.list-area');
  if (area) {
    const search = screen.querySelector('input[type="search"]');
    const count = screen.querySelector('.list-count');
    const update = () => renderList(area, count, apps, sortId);

    search.addEventListener('input', () => {
      state.query = search.value;
      update();
    });
    search.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') search.blur(); // closes the phone keyboard
    });

    screen.querySelector('.sort select').addEventListener('change', (event) => {
      sortId = event.target.value;
      setPref(SORT_KEY, sortId);
      update();
    });

    screen.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-filter]');
      if (chip) {
        state.filter = chip.dataset.filter;
        for (const button of screen.querySelectorAll('[data-filter]')) {
          button.setAttribute('aria-pressed', bool(button.dataset.filter === state.filter));
        }
        update();
        return;
      }
      if (event.target.closest('[data-action="show-all"]')) {
        state.query = '';
        state.filter = 'all';
        search.value = '';
        for (const button of screen.querySelectorAll('[data-filter]')) {
          button.setAttribute('aria-pressed', bool(button.dataset.filter === 'all'));
        }
        update();
      }
      if (event.target.closest('a')) state.scrollY = window.scrollY; // remember the place before opening one
    });

    update();
    screen.querySelector('.chip[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  mount(screen, ctx, state.scrollY);
}

function passesFilter(app) {
  if (state.filter === 'all') return true;
  if (state.filter === 'open') return isOpen(app);
  return app.status === state.filter;
}

function renderList(area, countEl, apps, sortId) {
  const today = todayISO();
  const visible = sortApplications(
    apps.filter((app) => passesFilter(app) && matchesQuery(app, state.query)),
    sortId,
  );

  countEl.textContent = visible.length === apps.length ? plural(apps.length, 'application') : `${visible.length} of ${apps.length}`;

  area.innerHTML = String(visible.length > 0
    ? html`<ul class="cards">${visible.map((app) => appCard(app, today))}</ul>`
    : html`
      <p class="no-results">No applications match.<br>
        <button type="button" class="link-btn" data-action="show-all">Show all applications</button>
      </p>`);
}
