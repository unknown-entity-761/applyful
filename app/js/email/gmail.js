// Gmail, read-only (version 5, email import). Everything happens on this device: the
// app asks Google for permission in Google's own window, then reads emails straight
// from Gmail. No email reaches Foliofy's server; only what's saved on applications
// does (and that syncs like anything else you type).
//
// - Google's sign-in library is loaded only when someone opens the Gmail screens.
// - The access Google gives lasts about an hour and is kept in memory only, never
//   saved, so it's gone when the app closes. Checking again later asks Google again
//   (usually one tap, with no password, after the first time).
// - The scope is gmail.readonly: the app can't send, delete, label or change email.
//
// Needs a Google Cloud OAuth client ID in config.js (GOOGLE_CLIENT_ID). Until then
// the Gmail screens say it isn't set up yet.

import { GOOGLE_CLIENT_ID } from '../config.js';
import { getPref, setPref } from '../prefs.js';

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const LIBRARY = 'https://accounts.google.com/gsi/client';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const ADDRESS_KEY = 'jt-gmail-address';

let token = '';
let tokenExpiresAt = 0;
let tokenClient = null;
let waiting = null; // { resolve, reject } while Google's window is open
let loading = null;

export class GmailError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GmailError';
    this.code = code;
  }
}

const MESSAGES = {
  'not-set-up': 'Gmail isn’t set up for this app yet.',
  offline: 'Couldn’t reach Google. Check your connection and try again.',
  'not-granted': 'Gmail wasn’t connected: Foliofy needs permission to read your email. Nothing was changed.',
  closed: 'Gmail wasn’t connected: the Google window was closed.',
  'not-ready': 'Google’s sign-in is still loading. Try again in a moment.',
  expired: 'Your Gmail connection ran out. Tap Check Gmail again.',
  failed: 'Gmail didn’t answer just now. Try again in a minute.',
};
const fail = (code) => new GmailError(code, MESSAGES[code]);

/** True when this copy of the app has a Google client ID (see config.js). */
export const gmailAvailable = () => Boolean(GOOGLE_CLIENT_ID);

/** The Gmail address connected on this device, or ''. */
export const gmailAddress = () => getPref(ADDRESS_KEY, '');

/** True while Google's permission from this session is still good. */
export const hasGmailAccess = () => Boolean(token) && Date.now() < tokenExpiresAt - 60_000;

function loadLibrary() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = LIBRARY;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(fail('offline'));
    };
    document.head.append(script);
  });
  return loading;
}

/** Loads Google's sign-in library ahead of time, so a tap can open its window at once. */
export async function prepareGmail() {
  if (!gmailAvailable()) return false;
  if (tokenClient) return true;
  await loadLibrary();
  tokenClient = globalThis.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPE,
    callback: (response) => {
      const done = waiting;
      waiting = null;
      if (!done) return;
      if (response.error || !globalThis.google.accounts.oauth2.hasGrantedAllScopes(response, SCOPE)) {
        done.reject(fail('not-granted'));
        return;
      }
      token = response.access_token;
      tokenExpiresAt = Date.now() + Number(response.expires_in || 3600) * 1000;
      done.resolve(token);
    },
    error_callback: () => {
      const done = waiting;
      waiting = null;
      done?.reject(fail('closed'));
    },
  });
  return true;
}

/**
 * Asks Google for read-only access. Call it straight from a tap: browsers block the
 * Google window otherwise. Resolves once access is granted.
 */
export function requestGmailAccess({ firstTime = false } = {}) {
  if (!gmailAvailable()) return Promise.reject(fail('not-set-up'));
  if (hasGmailAccess()) return Promise.resolve(token);
  if (!tokenClient) return Promise.reject(fail('not-ready'));
  return new Promise((resolve, reject) => {
    waiting = { resolve, reject };
    const hint = gmailAddress();
    tokenClient.requestAccessToken({ prompt: firstTime || !hint ? 'consent' : '', ...(hint ? { login_hint: hint } : {}) });
  });
}

async function api(path) {
  if (!hasGmailAccess()) throw fail('expired');
  let response;
  try {
    response = await fetch(`${API}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw fail('offline');
  }
  if (response.status === 401) {
    token = '';
    throw fail('expired');
  }
  if (!response.ok) throw fail('failed');
  return response.json();
}

/** Remembers which Gmail address is connected (shown in Settings). */
export async function rememberGmailAddress() {
  const profile = await api('profile');
  setPref(ADDRESS_KEY, String(profile.emailAddress ?? ''));
  return gmailAddress();
}

/** Message ids matching a Gmail search, newest first, at most `max`. */
export async function findMessages(query, max = 150) {
  const ids = [];
  let page = '';
  while (ids.length < max) {
    const data = await api(`messages?q=${encodeURIComponent(query)}&maxResults=${Math.min(100, max - ids.length)}${page ? `&pageToken=${page}` : ''}`);
    for (const message of data.messages ?? []) ids.push(message.id);
    page = data.nextPageToken;
    if (!page) break;
  }
  return ids;
}

/** One email, as rules.js reads it. */
export async function readMessage(id) {
  return toEmail(await api(`messages/${encodeURIComponent(id)}?format=full`));
}

/** Stops using Gmail on this device and asks Google to withdraw the permission. */
export function disconnectGmail() {
  if (token && globalThis.google?.accounts?.oauth2?.revoke) globalThis.google.accounts.oauth2.revoke(token, () => {});
  token = '';
  tokenExpiresAt = 0;
  setPref(ADDRESS_KEY, '');
}

/** A link that opens the email's conversation in Gmail, in the right account. */
export function gmailLink(threadId) {
  const account = gmailAddress();
  return `https://mail.google.com/mail/u/${account ? `?authuser=${encodeURIComponent(account)}` : '0/'}#all/${encodeURIComponent(threadId)}`;
}

// ---- Gmail's format → { id, threadId, date, from, to, subject, text } ----

export function toEmail(message) {
  const headers = new Map((message.payload?.headers ?? []).map((h) => [String(h.name).toLowerCase(), String(h.value ?? '')]));
  return {
    id: message.id,
    threadId: message.threadId,
    date: new Date(Number(message.internalDate) || Date.parse(headers.get('date') || '') || Date.now()).toISOString(),
    from: parseAddress(headers.get('from') ?? ''),
    to: (headers.get('to') ?? '').split(',').map((part) => parseAddress(part).email).filter(Boolean),
    subject: headers.get('subject') ?? '',
    text: bodyText(message.payload),
  };
}

export function parseAddress(text) {
  const value = String(text ?? '').trim();
  const angled = value.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (angled) return { name: angled[1].replace(/^["']|["']$/g, '').trim(), email: angled[2].trim().toLowerCase() };
  return { name: '', email: value.toLowerCase() };
}

function decode(data) {
  const binary = atob(String(data).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

/** The plain text of an email (or its HTML, made plain). */
export function bodyText(payload) {
  const plain = [];
  const html = [];
  const walk = (part) => {
    if (!part) return;
    if (part.body?.data && part.mimeType === 'text/plain') plain.push(decode(part.body.data));
    else if (part.body?.data && part.mimeType === 'text/html') html.push(decode(part.body.data));
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);
  if (plain.length) return plain.join('\n');
  return html.map(htmlToText).join('\n');
}

export function htmlToText(markup) {
  return String(markup)
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, '’')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}
