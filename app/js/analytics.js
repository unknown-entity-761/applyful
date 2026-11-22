// Analytics, to improve your experience of the app: which screens and features are
// used, and where people get stuck. Only with consent: nothing is recorded until
// someone taps "Accept analytics" on the cookie banner, or switches on Analytics
// cookies in Settings. Both choices can be changed at any time.
//
// What's stored on the device:
//   foliofy_consent  a cookie remembering the choice (needed to respect it)
//   foliofy_id       an analytics cookie with a random id for this device, set only
//                    after accepting, kept for 13 months, removed when switched off
// What's sent (to the events table in our Supabase database, Sydney): the event name,
// the screen (with ids removed, e.g. /a/:id), simple non-personal details, the device
// id, the app version, phone or computer layout, and whether someone is signed in.
//
// Rules for anyone adding track() calls (they match the privacy policy):
//   - Only an event name and simple, non-personal details,
//     e.g. track('application_added', { portal: 'Workday' }).
//   - Never application content, notes, company names, job titles, emails, phone
//     numbers, profile details, CV / LinkedIn files, or CV check scores and suggestions.
//   - Never the account id, name or email.

import { getPref, setPref } from './prefs.js';
import { makeId } from './model.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, APP_VERSION } from './config.js';

const CONSENT_KEY = 'jt-usage-consent'; // 'yes' | 'no' | '' (not asked yet)
const CONSENT_COOKIE = 'foliofy_consent';
const ID_COOKIE = 'foliofy_id';
const ID_DAYS = 395; // about 13 months
const CONSENT_DAYS = 365;

// ---- Cookies (first-party, only for this app's address) ----

const cookiePath = () => (typeof location === 'undefined' ? '/' : location.pathname.replace(/[^/]*$/, '') || '/');

function readCookie(name) {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

function writeCookie(name, value, days) {
  if (typeof document === 'undefined') return;
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  const expires = days > 0 ? `; Max-Age=${Math.round(days * 86400)}` : '; Max-Age=0';
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=${cookiePath()}; SameSite=Lax${expires}${secure}`;
}

// ---- Consent ----

/** 'yes', 'no', or '' when the person hasn't chosen yet (the banner shows). */
export function consentChoice() {
  const value = readCookie(CONSENT_COOKIE) || getPref(CONSENT_KEY, '');
  return value === 'yes' || value === 'no' ? value : '';
}

export function hasUsageConsent() {
  return consentChoice() === 'yes';
}

export function setUsageConsent(on) {
  const value = on ? 'yes' : 'no';
  setPref(CONSENT_KEY, value);
  writeCookie(CONSENT_COOKIE, value, CONSENT_DAYS);
  // Switching off removes the analytics cookie, so a later yes starts as a new device.
  if (!on) {
    writeCookie(ID_COOKIE, '', 0);
    setPref('jt-usage-device-id', '');
  }
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('foliofy:consent-changed', { detail: { analytics: on } }));
  }
}

function deviceId() {
  let id = readCookie(ID_COOKIE);
  if (!id) id = makeId();
  writeCookie(ID_COOKIE, id, ID_DAYS); // renewed on use, so it lasts 13 months from the last visit
  return id;
}

// ---- Recording ----

/** The screen without ids or other details: '#/a/123/edit' → '/a/:id/edit'. */
export function screenName(path) {
  const text = String(path || '/').replace(/^#/, '');
  if (/[=&]/.test(text)) return '/email-link'; // sign-in links carry tokens: never send them
  return text
    .split('?')[0]
    .replace(/^\/a\/[^/]+/, '/a/:id')
    .replace(/^\/legal\/([a-z]+).*$/, '/legal/$1')
    .slice(0, 80);
}

/** Keeps only short, simple values: no text someone typed can slip through. */
function cleanDetails(details) {
  const clean = {};
  for (const [key, value] of Object.entries(details ?? {}).slice(0, 10)) {
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) clean[key.slice(0, 30)] = value;
    else if (typeof value === 'string') clean[key.slice(0, 30)] = value.slice(0, 40);
  }
  return clean;
}

let signedIn = () => false;
/** Lets the app say whether someone is signed in, without this file knowing who. */
export function setSignedInCheck(check) {
  signedIn = check;
}

/** Records a usage event, only if the person accepted analytics. Never throws. */
export function track(event, details = {}, page = typeof location === 'undefined' ? '' : location.hash) {
  if (!hasUsageConsent() || typeof fetch !== 'function') return;
  const row = {
    event: String(event).slice(0, 60),
    page: screenName(page),
    details: cleanDetails(details),
    device_id: deviceId(),
    app_version: APP_VERSION,
    layout: typeof window !== 'undefined' && window.matchMedia?.('(min-width: 960px)').matches ? 'computer' : 'phone',
    signed_in: Boolean(signedIn()),
  };
  fetch(`${SUPABASE_URL}/rest/v1/events`, {
    method: 'POST',
    keepalive: true,
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  }).catch(() => {}); // offline or blocked: analytics is never worth an error
}

let lastPage = '';
/** One page view per screen change (not per redraw). */
export function trackPage(path) {
  const page = screenName(path);
  if (page === lastPage) return;
  lastPage = page;
  track('page_view', {}, page);
}
