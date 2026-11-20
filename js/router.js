// A tiny router: maps the part of the address after # to a screen.
// '#/a/123' runs the handler registered for '/a/:id' with { id: '123' }.
// Hash addresses work on any simple web host with no server setup.

const routes = [];
let notFound = () => {};
let currentCtx = null;

export function route(pattern, handler) {
  const keys = [];
  const source = pattern.replace(/:([a-zA-Z]+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  });
  routes.push({ regex: new RegExp(`^${source}$`), keys, handler });
}

function dispatch() {
  const path = location.hash.replace(/^#/, '') || '/';

  // Tell the previous screen it is no longer showing, so a slow load can't overwrite this one.
  if (currentCtx) currentCtx.active = false;
  const ctx = { active: true };
  currentCtx = ctx;

  for (const { regex, keys, handler } of routes) {
    const match = regex.exec(path);
    if (match) {
      const params = Object.fromEntries(keys.map((key, i) => [key, decodeURIComponent(match[i + 1])]));
      handler(params, ctx);
      return;
    }
  }
  notFound(ctx);
}

/** Goes to a path. With replace: true it swaps the current history entry instead of adding one. */
export function navigate(path, { replace = false } = {}) {
  const depth = history.state?.depth ?? 0;
  if (replace) history.replaceState({ depth }, '', `#${path}`);
  else history.pushState({ depth: depth + 1 }, '', `#${path}`);
  dispatch();
}

/** Goes back one screen, or to `fallback` if the app was opened directly on this screen. */
export function back(fallback = '/') {
  if ((history.state?.depth ?? 0) > 0) history.back();
  else navigate(fallback, { replace: true });
}

/** Re-renders the current screen (after data changed underneath it). */
export function refresh() {
  dispatch();
}

export function start(onNotFound) {
  notFound = onNotFound;
  window.addEventListener('popstate', () => dispatch());

  // In-app links (href="#/...") go through navigate() so "back" always knows where it is.
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#/"]');
    if (!link || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(link.getAttribute('href').slice(1));
  });

  if (!history.state) history.replaceState({ depth: 0 }, '', location.hash || '#/');
  dispatch();
}
