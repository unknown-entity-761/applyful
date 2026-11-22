// The computer layout (version 4): on wide screens the app shows a side menu instead
// of the bottom tab bar, and on Jobs the applications list stays on the left with
// an application's details on the right. Phones are unchanged.
//
// The side menu and list pane live outside #view (see index.html), so they stay put
// while screens change. CSS shows them only on wide screens.

import { html, icon } from '../ui.js';
import { APP_NAME } from '../config.js';
import { onRoute, refresh } from '../router.js';
import { renderApplications } from './applications.js';

const WIDE = window.matchMedia('(min-width: 960px)');

const LINKS = [
  { id: 'home', href: '#/', label: 'Home', icon: 'home' },
  { id: 'applications', href: '#/applications', label: 'Jobs', icon: 'jobs' },
  { id: 'add', href: '#/new', label: 'Add application', icon: 'plus' },
  { id: 'activity', href: '#/activity', label: 'Activity', icon: 'bell' },
  { id: 'profile', href: '#/profile', label: 'Profile', icon: 'user' },
];

export const isWide = () => WIDE.matches;

/** Which part of the app a screen belongs to, for the side menu. */
export function sectionOf(path) {
  if (path === '/applications' || path.startsWith('/a/')) return 'applications';
  if (path === '/new') return 'add';
  if (path === '/activity') return 'activity';
  if (path.startsWith('/profile') || path === '/cv-check') return 'profile';
  if (path.startsWith('/settings') || path.startsWith('/legal/') || path.startsWith('/account')) return 'settings';
  return 'home';
}

/** On wide screens, Jobs and an application's details show the list beside them. */
export const showsListPane = (path) => sectionOf(path) === 'applications';

let currentPath = '/';

export function initShell() {
  const nav = document.getElementById('sidenav');
  nav.innerHTML = String(html`
    <a class="sidenav-brand" href="#/">${APP_NAME}<span class="preview-tag">Preview</span></a>
    <ul class="sidenav-list">
      ${LINKS.map((link) => html`
        <li>
          <a class="sidenav-link ${link.id === 'add' ? 'sidenav-add' : ''}" href="${link.href}" data-section="${link.id}">
            ${icon(link.icon)}<span>${link.label}</span>
          </a>
        </li>`)}
    </ul>
    <a class="sidenav-link sidenav-settings" href="#/settings" data-section="settings">${icon('settings')}<span>Settings</span></a>
  `);

  onRoute((path) => {
    currentPath = path;
    update();
  });

  // Data changed (saved, deleted, restored): keep the list beside the details current.
  let pending = 0;
  window.addEventListener('foliofy:data-changed', () => {
    if (!document.body.classList.contains('split')) return;
    clearTimeout(pending);
    pending = setTimeout(renderPane, 50);
  });

  // Crossing the width line swaps between the phone and computer layouts.
  WIDE.addEventListener('change', () => refresh());
}

function update() {
  const section = sectionOf(currentPath);
  for (const link of document.querySelectorAll('#sidenav [data-section]')) {
    if (link.dataset.section === section) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const split = isWide() && showsListPane(currentPath);
  document.body.classList.toggle('split', split);
  if (split) renderPane();
  else document.getElementById('list-pane').replaceChildren();
}

async function renderPane() {
  const path = currentPath;
  const selectedId = path.startsWith('/a/') ? decodeURIComponent(path.split('/')[2] ?? '') : '';
  const screen = await renderApplications({ active: true }, { pane: true });
  if (path === currentPath && document.body.classList.contains('split')) mountPane(screen, selectedId);
}

/** Puts the applications list into the left pane, keeping its scroll position. */
function mountPane(screen, selectedId) {
  const pane = document.getElementById('list-pane');
  const scrollTop = pane.scrollTop;
  pane.replaceChildren(screen);
  pane.scrollTop = scrollTop;
  const selectedHref = `#/a/${encodeURIComponent(selectedId)}`;
  [...pane.querySelectorAll('a.card')].find((card) => card.getAttribute('href') === selectedHref)?.setAttribute('aria-current', 'page');
}

