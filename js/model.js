// The data model: what an application looks like, the fixed lists
// (statuses, portals), validation, and small calculations the screens use.
// No storage or screen code lives here.

import { todayISO, isISODate, daysBetween, relativeDays, plural, safeHttpUrl } from './ui.js';

/** Bump this when the shape of a saved application changes. Backups record it. */
export const SCHEMA_VERSION = 1;

/** Statuses in pipeline order. `open` = still in play, so follow-ups count. */
export const STATUSES = [
  { id: 'saved', label: 'Saved', open: true },
  { id: 'applied', label: 'Applied', open: true },
  { id: 'assessment', label: 'Assessment', open: true },
  { id: 'interview', label: 'Interview', open: true },
  { id: 'offer', label: 'Offer', open: true },
  { id: 'rejected', label: 'Rejected', open: false },
  { id: 'ghosted', label: 'Ghosted', open: false },
];

export const PORTALS = [
  'Workday',
  'SuccessFactors',
  'Greenhouse',
  'Lever',
  'iCIMS',
  'Taleo',
  'LinkedIn Easy Apply',
  'Company website',
  'Other',
];

export const DEFAULT_STATUS = 'applied';

const STATUS_MAP = new Map(STATUSES.map((status) => [status.id, status]));

export function statusInfo(id) {
  return STATUS_MAP.get(id) ?? STATUS_MAP.get(DEFAULT_STATUS);
}

export function makeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // randomUUID only works on https pages; getRandomValues works everywhere.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * A new, empty application.
 *
 * Shape of every saved application:
 *   id            unique id
 *   company       "Acme Corp" (required)
 *   title         "Data Analyst" (required)
 *   portal        "Workday", "SuccessFactors", ... or ''
 *   loginEmail    email used to sign up to that portal, or ''
 *   postingUrl    https link to the job ad or portal, or ''
 *   appliedOn     'YYYY-MM-DD' or ''
 *   status        one of STATUSES ids
 *   followUpOn    'YYYY-MM-DD' or ''
 *   notes         free text
 *   statusHistory [{ status, at }] oldest first, at = ISO timestamp
 *   createdAt     ISO timestamp
 *   updatedAt     ISO timestamp (set by the store on every save)
 */
export function blankApplication() {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    company: '',
    title: '',
    portal: '',
    loginEmail: '',
    postingUrl: '',
    appliedOn: todayISO(),
    status: DEFAULT_STATUS,
    followUpOn: '',
    notes: '',
    statusHistory: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Adds https:// when someone types or pastes a link without it. */
export function normalizeUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
}

const isTimestamp = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));

/** Cleans form input or imported data into a well-formed application. */
export function normalize(input) {
  const text = (value, max) => String(value ?? '').trim().slice(0, max);
  const date = (value) => (isISODate(value) ? value : '');
  const now = new Date().toISOString();

  return {
    id: typeof input.id === 'string' && input.id ? input.id.slice(0, 64) : makeId(),
    company: text(input.company, 120),
    title: text(input.title, 160),
    portal: text(input.portal, 60),
    loginEmail: text(input.loginEmail, 254),
    postingUrl: normalizeUrl(text(input.postingUrl, 2000)),
    appliedOn: date(input.appliedOn),
    status: STATUS_MAP.has(input.status) ? input.status : DEFAULT_STATUS,
    followUpOn: date(input.followUpOn),
    notes: String(input.notes ?? '').replace(/\s+$/, '').slice(0, 5000),
    statusHistory: Array.isArray(input.statusHistory)
      ? input.statusHistory
          .filter((entry) => entry && STATUS_MAP.has(entry.status) && isTimestamp(entry.at))
          .map((entry) => ({ status: entry.status, at: entry.at }))
      : [],
    createdAt: isTimestamp(input.createdAt) ? input.createdAt : now,
    updatedAt: isTimestamp(input.updatedAt) ? input.updatedAt : now,
  };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns { fieldName: message } for anything that needs fixing. Empty object = valid. */
export function validate(app) {
  const errors = {};
  if (!app.company) errors.company = 'Add the company name.';
  if (!app.title) errors.title = 'Add the job title.';
  if (app.loginEmail && !EMAIL_PATTERN.test(app.loginEmail)) errors.loginEmail = 'Check this email address.';
  if (app.postingUrl && !safeHttpUrl(app.postingUrl)) errors.postingUrl = 'Use a web link, like https://jobs.example.com/123';
  return errors;
}

/** A copy with the new status, recording the change in its history. */
export function withStatus(app, status) {
  if (!STATUS_MAP.has(status) || app.status === status) return app;
  return {
    ...app,
    status,
    statusHistory: [...app.statusHistory, { status, at: new Date().toISOString() }],
  };
}

export function isOpen(app) {
  return statusInfo(app.status).open;
}

export function isFollowUpDue(app, today = todayISO()) {
  return Boolean(app.followUpOn) && isOpen(app) && app.followUpOn <= today;
}

/** "Follow up today", "Follow-up 2 days overdue", "Follow up in 3 days". */
export function followUpText(app, today = todayISO()) {
  if (!app.followUpOn) return '';
  const diff = daysBetween(app.followUpOn, today);
  if (diff === 0) return 'Follow up today';
  if (diff > 0) return `Follow-up ${plural(diff, 'day')} overdue`;
  return `Follow up ${relativeDays(app.followUpOn, today)}`;
}

// ---- Sorting ----

export const SORTS = [
  { id: 'applied-desc', label: 'Date applied: newest' },
  { id: 'applied-asc', label: 'Date applied: oldest' },
  { id: 'company-asc', label: 'Company: A to Z' },
  { id: 'company-desc', label: 'Company: Z to A' },
  { id: 'title-asc', label: 'Job title: A to Z' },
  { id: 'status', label: 'Status' },
  { id: 'followup-asc', label: 'Follow-up: soonest' },
  { id: 'updated-desc', label: 'Recently updated' },
];

export const DEFAULT_SORT = 'applied-desc';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const STATUS_ORDER = new Map(STATUSES.map((status, i) => [status.id, i]));

// Applications with no date applied use the day they were added.
const appliedKey = (app) => app.appliedOn || app.createdAt.slice(0, 10);
const newestFirst = (a, b) => appliedKey(b).localeCompare(appliedKey(a)) || b.createdAt.localeCompare(a.createdAt);
const byCompany = (a, b) => collator.compare(a.company, b.company) || collator.compare(a.title, b.title);
const hasFollowUp = (app) => (app.followUpOn ? 0 : 1);

const COMPARE = {
  'applied-desc': newestFirst,
  'applied-asc': (a, b) => newestFirst(b, a),
  'company-asc': byCompany,
  'company-desc': (a, b) => byCompany(b, a),
  'title-asc': (a, b) => collator.compare(a.title, b.title) || byCompany(a, b),
  status: (a, b) => STATUS_ORDER.get(a.status) - STATUS_ORDER.get(b.status) || newestFirst(a, b),
  'followup-asc': (a, b) => hasFollowUp(a) - hasFollowUp(b) || a.followUpOn.localeCompare(b.followUpOn) || newestFirst(a, b),
  'updated-desc': (a, b) => b.updatedAt.localeCompare(a.updatedAt),
};

export function isSortId(id) {
  return Object.prototype.hasOwnProperty.call(COMPARE, id);
}

/** A sorted copy. Unknown sort ids fall back to newest applied first. */
export function sortApplications(apps, sortId = DEFAULT_SORT) {
  return [...apps].sort(COMPARE[sortId] ?? COMPARE[DEFAULT_SORT]);
}

export function matchesQuery(app, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return app.company.toLowerCase().includes(q) || app.title.toLowerCase().includes(q);
}

export function countByStatus(apps) {
  const counts = Object.fromEntries(STATUSES.map((status) => [status.id, 0]));
  for (const app of apps) counts[app.status] += 1;
  return counts;
}

/** Unique values of one field, most recently used first. Used for typing suggestions. */
export function recentValues(apps, field) {
  const seen = new Set();
  const newestFirst = [...apps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const app of newestFirst) {
    if (app[field]) seen.add(app[field]);
  }
  return [...seen];
}
