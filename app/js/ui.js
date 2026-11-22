// Shared helpers used by every screen: safe HTML templates, icons,
// date maths, link checks, showing a screen, and the toast message.

// ---- Safe HTML ----

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

class SafeHtml {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

/** Marks a string as trusted HTML so html`` inserts it as-is. Never pass user input. */
export function raw(value) {
  return new SafeHtml(String(value));
}

/**
 * Builds HTML from a template. Every ${value} is escaped, except nested
 * html`` results, raw() values and arrays of those. false, null and
 * undefined render as nothing. Write `${count > 0 && html`...`}`, never
 * `${count && ...}`, or a 0 gets printed.
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) {
    out += toHtml(values[i]) + strings[i + 1];
  }
  return new SafeHtml(out);
}

function toHtml(value) {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(toHtml).join('');
  if (value === false || value === null || value === undefined) return '';
  return escapeHtml(value);
}

/** 'true' / 'false' for attributes like aria-pressed. */
export function bool(value) {
  return value ? 'true' : 'false';
}

// ---- Icons (simple 24x24 line icons) ----

const ICON_PATHS = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a1 1 0 0 1 1-1h9"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  sort: '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  mapPin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  smartphone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  // Tab bar icons. Parts with class="fill" are filled in on the active tab.
  home: '<path class="fill" d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  jobs: '<rect class="fill" x="3" y="7" width="18" height="13" rx="3"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
  bell: '<path class="fill" d="M6 9a6 6 0 0 1 12 0c0 4.5 1.5 6.5 2.5 7.5h-17C4.5 15.5 6 13.5 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  user: '<circle class="fill" cx="12" cy="8" r="4"/><path class="fill" d="M4 21a8 8 0 0 1 16 0z"/>',
  letter: '<path class="fill" d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M15 3v4h4M8.5 12h7M8.5 16h5"/>',
};

export function icon(name) {
  return raw(
    `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
      `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name] ?? ''}</svg>`,
  );
}

// ---- Dates ----
// Dates are stored as local 'YYYY-MM-DD' strings, so they sort and compare as plain text.

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isISODate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && toISODate(parseISODate(value)) === value;
}

export function addDays(iso, days) {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Whole days from `fromIso` to `toIso` (positive when toIso is later). */
export function daysBetween(fromIso, toIso) {
  return Math.round((parseISODate(toIso) - parseISODate(fromIso)) / 86_400_000);
}

export function formatDate(iso) {
  return parseISODate(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "today", "yesterday", "3 days ago", "tomorrow", "in 5 days". */
export function relativeDays(iso, today = todayISO()) {
  const diff = daysBetween(iso, today);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff === -1) return 'tomorrow';
  return diff > 0 ? `${diff} days ago` : `in ${-diff} days`;
}

/** 'YYYY-MM' to "May 2023". */
export function formatMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

// ---- Links ----

/** Returns the link if it is a normal web address, otherwise null (blocks javascript: links etc). */
export function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ---- Screens ----

export function createScreen(template) {
  const screen = document.createElement('div');
  screen.className = 'screen';
  screen.innerHTML = String(template);
  return screen;
}

/**
 * Shows a screen, unless the person has already moved on to another one
 * while it was loading (ctx.active is false then).
 */
export function mount(screen, ctx, scrollY = 0) {
  if (!ctx.active) return false;
  document.getElementById('view').replaceChildren(screen);
  screen.querySelector('h1')?.focus({ preventScroll: true });
  window.scrollTo(0, scrollY);
  return true;
}

export function notFoundScreen() {
  return createScreen(html`
    <header class="topbar">
      <a class="icon-btn" href="#/" aria-label="All applications">${icon('back')}</a>
      <h1 class="topbar-title" tabindex="-1">Not found</h1>
      <span aria-hidden="true"></span>
    </header>
    <main class="content">
      <div class="empty">
        <h2>This application isn’t here</h2>
        <p>It may have been deleted.</p>
        <a class="btn primary" href="#/">Go to all applications</a>
      </div>
    </main>
  `);
}

// ---- Toast (the short message at the bottom of the screen) ----

let toastTimer = 0;

export function showToast(message, { actionLabel = '', onAction = null, duration = 3500 } = {}) {
  const toast = document.getElementById('toast');
  toast.replaceChildren();

  const text = document.createElement('span');
  text.textContent = message;
  toast.append(text);

  if (actionLabel && onAction) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.textContent = actionLabel;
    button.addEventListener('click', () => {
      hideToast();
      onAction();
    });
    toast.append(button);
  }

  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, actionLabel ? Math.max(duration, 6000) : duration);
}

export function hideToast() {
  const toast = document.getElementById('toast');
  toast.classList.remove('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.replaceChildren(), 250);
}
