// Accounts (version 4): sign up, log in, stay logged in, reset a password, sign out.
// Signing in is optional; without an account the app works as before.
//
// Talks to Supabase's sign-in service directly with fetch, so the app needs no extra
// library. The session (two tokens and who you are) is kept on this device, so you
// stay logged in until you sign out. The password itself is never stored here.
//
// Email links (confirming an address, resetting a password) come back to the app as
// #access_token=...&type=... in the address; handleAuthRedirect() picks those up.
//
// Without an account: if you agree to keep a copy online, the app quietly starts a
// guest session (Supabase's anonymous sign-in). Your data then syncs to the server
// like an account's, but only this browser holds the key to it. Creating an account
// or logging in replaces the guest session, and the guest's online copy is deleted
// (this device's data moves into the account instead).

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { getPref, setPref } from './prefs.js';

const SESSION_KEY = 'jt-session';
const PENDING_CONSENTS_KEY = 'jt-pending-consents';
const ONLINE_COPY_KEY = 'jt-online-copy'; // '' not asked yet, 'on', or 'off'
const GUESTS_TO_REMOVE_KEY = 'jt-guests-to-remove';
export const MIN_PASSWORD_LENGTH = 8;
export const MIN_AGE = 16;
// Which versions of the terms and privacy policy people agree to. Bump when they change.
export const LEGAL_VERSION = 'draft-2026-11';

let session = readStoredSession();

function readStoredSession() {
  try {
    return JSON.parse(getPref(SESSION_KEY, 'null')) || null;
  } catch {
    return null;
  }
}

// Another tab signed in, out, or refreshed the session: use its copy.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== SESSION_KEY) return;
    const before = session?.user?.id ?? '';
    session = readStoredSession();
    if (before !== (session?.user?.id ?? '')) notify();
  });
}

export class AuthError extends Error {
  constructor(code, detail = '') {
    super(authMessage(code, detail));
    this.name = 'AuthError';
    this.code = code;
  }
}

/** Plain-language messages for what Supabase sends back. */
export function authMessage(code, detail = '') {
  const messages = {
    invalid_credentials: 'That email and password don’t match. Check them, or reset your password.',
    email_not_confirmed: 'Confirm your email first: open the link we sent you.',
    user_already_exists: 'There’s already an account with that email. Log in instead.',
    email_exists: 'There’s already an account with that email. Log in instead.',
    weak_password: `Use a longer password: at least ${MIN_PASSWORD_LENGTH} characters.`,
    over_email_send_rate_limit: 'Too many emails have been sent just now. Try again in an hour.',
    over_request_rate_limit: 'Too many tries. Wait a few minutes, then try again.',
    email_address_invalid: 'Check this email address.',
    validation_failed: 'Check the email address and password.',
    same_password: 'That’s your current password. Choose a new one.',
    session_expired: 'You’ve been logged out. Log in again.',
    network: 'Couldn’t reach Applyful’s server. Check your connection and try again.',
  };
  return messages[code] ?? (detail ? `Something went wrong: ${detail}` : 'Something went wrong. Please try again.');
}

async function call(path, { method = 'GET', body, token } = {}) {
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new AuthError('network');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data.error_code || data.code || (response.status === 429 ? 'over_request_rate_limit' : String(response.status));
    const error = new AuthError(typeof code === 'string' ? code : String(code), data.msg || data.error_description || data.message || '');
    error.status = response.status;
    throw error;
  }
  return data;
}

const sessionFrom = (data) => ({
  accessToken: data.access_token,
  refreshToken: data.refresh_token,
  expiresAt: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
  user: { id: data.user?.id ?? '', email: data.user?.email ?? '' },
  guest: Boolean(data.user?.is_anonymous),
});

function keep(data) {
  const previous = session;
  session = sessionFrom(data);
  setPref(SESSION_KEY, JSON.stringify(session));
  const from = previous?.user?.id ?? '';
  if (from !== session.user.id) sessionChanged(from, session.user.id);
  // Logged in (or confirmed a new account) on top of a guest session: the guest's
  // online copy isn't needed any more. This device's data goes into the account.
  if (previous?.guest && previous.user.id !== session.user.id) removeGuest(previous);
  // With an account, the online copy question no longer applies. If you sign out
  // later, it's asked again rather than quietly starting a new copy of your data.
  if (!session.guest && onlineCopyChoice() === 'on') setPref(ONLINE_COPY_KEY, '');
  notify();
  return session;
}

function forget(reason = 'signed-out') {
  const from = session?.user?.id ?? '';
  session = null;
  setPref(SESSION_KEY, '');
  if (from) sessionChanged(from, '');
  notify(reason);
}

// ---- Telling sync.js about changes (it imports this file, so not the other way round) ----

const sessionListeners = [];

/**
 * Calls fn({ from, to }) (user ids, '' for none) whenever this device starts syncing as
 * someone else: signing in or out, a guest starting or ending, an account replacing a guest.
 */
export function onSessionChange(fn) {
  sessionListeners.push(fn);
}

function sessionChanged(from, to) {
  for (const fn of sessionListeners) {
    try {
      fn({ from, to });
    } catch (error) {
      console.error(error);
    }
  }
}

let beforeSignOut = async () => {};

/** push.js removes this device's notifications before the session goes. */
export function setBeforeSignOut(fn) {
  beforeSignOut = fn;
}

let waitForSync = async () => {};

/** sync.js says how to wait for a sync that's running, so a guest isn't deleted mid-upload. */
export function setSyncWaiter(fn) {
  waitForSync = fn;
}

function onlineCopyChanged() {
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('applyful:online-copy-changed', { detail: { choice: onlineCopyChoice() } }));
  }
}

/**
 * reason: 'signed-in', 'signed-out', 'expired' (an account's session was refused: log
 * in again), 'guest-ended' (a guest session was refused, for example deleted after a
 * year unused), or 'copy-off' (the online copy was turned off).
 */
function notify(reason = session ? 'signed-in' : 'signed-out') {
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('applyful:auth-changed', {
      detail: { signedIn: Boolean(currentUser()), online: Boolean(session), guest: Boolean(session?.guest), reason },
    }));
  }
}

/** Runs `work` while no other tab is changing the session. */
function oneTabAtATime(work) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) return navigator.locks.request('applyful-session', work);
  return work();
}

/** Where email links should bring people back to: this app's own address. */
export function appAddress() {
  return typeof location === 'undefined' ? '' : `${location.origin}${location.pathname}`;
}

/** The signed-in person ({ id, email }), or null. A guest session isn't an account, so it's null too. */
export function currentUser() {
  return session && !session.guest ? session.user : null;
}

/** Whoever this device syncs as: { id, email, guest }, an account or a guest; or null. */
export function onlineUser() {
  return session ? { ...session.user, guest: Boolean(session.guest) } : null;
}

// ---- The online copy, without an account ----

/**
 * Where this device's data is kept besides the device itself, for the wording on screens:
 * 'account', 'online-copy' (a guest session) or 'device' (only here). It's what's true
 * now: an online copy that's switched on but couldn't start yet doesn't count.
 */
export function dataHome() {
  if (currentUser()) return 'account';
  if (session?.guest) return 'online-copy';
  return 'device';
}

/** How far a deletion reaches, for confirmation messages: "Delete X <this>?" */
export function deletionReach() {
  return {
    account: 'from your account and every device you’re signed in on',
    'online-copy': 'from this device and its online copy',
    device: 'from this device',
  }[dataHome()];
}

/** '' (not asked yet), 'on' or 'off'. */
export function onlineCopyChoice() {
  const choice = getPref(ONLINE_COPY_KEY, '');
  return choice === 'on' || choice === 'off' ? choice : '';
}

let guestStarting = null;
let guestsUnavailable = false;
let guestRetryAt = 0; // after the server said "too many" or had a problem: wait before trying again
const GUEST_RETRY_MS = 10 * 60 * 1000;

/**
 * Starts a guest session, so this device's data has an online copy. Only when there's
 * no session, the copy is switched on, and this browser can keep the session (in a
 * private window it couldn't, and every visit would start a new guest). Resolves to
 * the session, or null.
 */
export function startGuest() {
  if (session || onlineCopyChoice() !== 'on' || guestsUnavailable || Date.now() < guestRetryAt || !canKeepSession()) return Promise.resolve(session);
  guestStarting ??= oneTabAtATime(async () => {
    const stored = readStoredSession();
    if (stored) {
      // Another tab started one (or signed in) a moment ago: use it.
      session = stored;
      notify();
      return session;
    }
    let data;
    try {
      data = await call('signup', { method: 'POST', body: { data: {} } });
    } catch (error) {
      // Guest sessions aren't switched on in Supabase (yet): try again next time the app opens.
      if (error.code === 'anonymous_provider_disabled' || error.status === 422) guestsUnavailable = true;
      // Too many tries, or a problem on the server: not again for a while. (Offline: when back online.)
      else if (error.code !== 'network') guestRetryAt = Date.now() + GUEST_RETRY_MS;
      return null;
    }
    if (!data.access_token) return null;
    const existing = session ?? readStoredSession();
    if (existing || onlineCopyChoice() !== 'on') {
      // Signed in (here or in another tab), or turned the copy off, while it was
      // starting: not needed after all.
      removeGuest(sessionFrom(data));
      if (existing && !session) {
        session = existing;
        notify();
      }
      return session;
    }
    return keep(data);
  }).finally(() => {
    guestStarting = null;
  });
  return guestStarting;
}

/** Turns the online copy on (starting a guest session) or off (deleting the guest's online copy). */
/**
 * Turns the online copy on (starting a guest session; resolves to the session or null)
 * or off (deleting the guest's online copy; resolves to true once it's deleted, or false
 * if that has to wait until the app is back online).
 */
export async function setOnlineCopy(on) {
  setPref(ONLINE_COPY_KEY, on ? 'on' : 'off');
  onlineCopyChanged();
  if (on) {
    guestsUnavailable = false;
    guestRetryAt = 0;
    return startGuest();
  }
  if (!session?.guest) return true;
  const guest = session;
  forget('copy-off');
  return removeGuest(guest);
}

function canKeepSession() {
  try {
    localStorage.setItem('jt-check', '1');
    localStorage.removeItem('jt-check');
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes a guest's online copy: its files, then the guest itself (which removes its
 * rows). Remembered until it works, so being offline doesn't leave it behind.
 */
async function removeGuest(guest) {
  const pending = guestsToRemove().filter((g) => g.user.id !== guest.user.id);
  saveGuestsToRemove([...pending, guest]);
  // A sync still uploading to it would leave files behind with no one to delete them.
  await waitForSync().catch(() => {});
  try {
    let token = guest.accessToken;
    if (guest.expiresAt - 60 <= Date.now() / 1000) {
      const data = await call('token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: guest.refreshToken } });
      token = data.access_token;
      // The old refresh token can't be used twice, so keep the new one in case the rest fails.
      saveGuestsToRemove([...pending, sessionFrom(data)]);
    }
    const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    // Its earlier CVs (CV history) are files in a folder of their own.
    const folder = `${guest.user.id}/cv-versions`;
    const listed = await fetch(`${SUPABASE_URL}/storage/v1/object/list/documents`, { method: 'POST', headers, body: JSON.stringify({ prefix: folder, limit: 100 }) });
    const earlierCvs = listed.ok ? (await listed.json()).map((file) => `${folder}/${file.name}`) : [];
    const files = await fetch(`${SUPABASE_URL}/storage/v1/object/documents`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ prefixes: [`${guest.user.id}/cv`, `${guest.user.id}/linkedin`, ...earlierCvs] }),
    });
    if (!files.ok && files.status !== 404 && files.status !== 400) return false;
    const account = await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_my_account`, { method: 'POST', headers, body: '{}' });
    if (!account.ok) return false;
  } catch (error) {
    // Offline: try again later. A refused guest session is already gone (or will be
    // deleted after a year unused), so there's nothing more to do for it.
    if (error instanceof AuthError && error.code !== 'network' && !(error.status >= 500) && error.status !== 429) {
      saveGuestsToRemove(pending);
    }
    return false;
  }
  saveGuestsToRemove(guestsToRemove().filter((g) => g.user.id !== guest.user.id));
  setPref(`jt-sync-${guest.user.id}`, '');
  return true;
}

function guestsToRemove() {
  try {
    const list = JSON.parse(getPref(GUESTS_TO_REMOVE_KEY, '[]'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveGuestsToRemove(list) {
  setPref(GUESTS_TO_REMOVE_KEY, list.length ? JSON.stringify(list) : '');
}

/** Tries again to delete guest copies that couldn't be deleted at the time (offline). */
export async function finishRemovingGuests() {
  for (const guest of guestsToRemove()) await removeGuest(guest);
}

/**
 * Creates an account. Supabase emails a link to confirm the address; the account
 * can't be used until it's opened. What was agreed to is kept for the first log-in,
 * when it's recorded online.
 */
export async function signUp(email, password, { emailsOk = false } = {}) {
  const agreedAt = new Date().toISOString();
  const consents = { email: email.trim().toLowerCase(), terms: LEGAL_VERSION, privacy: LEGAL_VERSION, emails: Boolean(emailsOk), minAge: MIN_AGE, agreedAt };
  const data = await call(`signup?redirect_to=${encodeURIComponent(appAddress())}`, {
    method: 'POST',
    body: { email, password, data: { consents } },
  });
  setPref(PENDING_CONSENTS_KEY, JSON.stringify(consents));
  // With email confirmation on, there's no session yet. (If it's ever switched off, there is.)
  if (data.access_token) keep(data);
  return { needsConfirmation: !data.access_token };
}

export function resendConfirmation(email) {
  return call(`resend?redirect_to=${encodeURIComponent(appAddress())}`, { method: 'POST', body: { type: 'signup', email } });
}

export async function logIn(email, password) {
  const data = await call('token?grant_type=password', { method: 'POST', body: { email, password } });
  const user = keep(data).user; // kept before the await: a cancelled first sync may sign out meanwhile
  await recordPendingConsents();
  return user;
}

export function sendPasswordReset(email) {
  return call(`recover?redirect_to=${encodeURIComponent(appAddress())}`, { method: 'POST', body: { email } });
}

export async function setNewPassword(password) {
  const token = await accessToken();
  if (!token) throw new AuthError('session_expired');
  await call('user', { method: 'PUT', body: { password }, token });
}

export async function signOut() {
  await beforeSignOut().catch(() => {});
  const token = session?.accessToken;
  forget();
  // scope=local: only this device. Other devices you're signed in on stay signed in.
  if (token) await call('logout?scope=local', { method: 'POST', token }).catch(() => {}); // already signed out here either way
}

/**
 * A valid access token for talking to the database, refreshing it when it's about to
 * run out. Null when signed out, or when the session can no longer be refreshed.
 */
export async function accessToken() {
  if (!session) return null;
  if (session.expiresAt - 60 > Date.now() / 1000) return session.accessToken;
  // One tab refreshes at a time; the others then use its new session.
  const refresh = async () => {
    const latest = readStoredSession() ?? session;
    if (latest && latest.expiresAt - 60 > Date.now() / 1000) {
      session = latest;
      return session.accessToken;
    }
    if (!latest) return null; // signed out in another tab meanwhile
    // Signed in, out or as someone else while the refresh was on its way: that newer
    // session stands, and this answer is thrown away.
    const stillCurrent = () => (readStoredSession() ?? session)?.refreshToken === latest.refreshToken;
    try {
      const data = await call('token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: latest.refreshToken } });
      if (!stillCurrent()) return null;
      keep(data);
      return session.accessToken;
    } catch (error) {
      // Offline, busy or a server hiccup: keep the session and try again later.
      // Only a refused session means logging in again (or, for a guest, starting a new one).
      const temporary = error.code === 'network' || error.code === 'over_request_rate_limit' || error.status === 429 || error.status >= 500;
      if (!temporary && stillCurrent()) forget(latest.guest ? 'guest-ended' : 'expired');
      return null;
    }
  };
  return oneTabAtATime(refresh);
}

/**
 * Handles the address an email link opens: #access_token=...&type=signup|recovery,
 * or #error=...&error_description=.... Returns { type } or { error }, or null if
 * the address isn't from an email link.
 */
export async function handleAuthRedirect(hash = typeof location === 'undefined' ? '' : location.hash) {
  const text = hash.replace(/^#/, '');
  if (!/(^|&)(access_token|error)=/.test(text)) return null;
  const params = new URLSearchParams(text);
  if (params.get('error')) {
    const code = params.get('error_code') || params.get('error');
    return { error: code === 'otp_expired' ? 'That link has expired or was already used. Ask for a new one.' : authMessage(code, params.get('error_description') || '') };
  }
  const accessTokenFromLink = params.get('access_token');
  let user;
  try {
    user = await call('user', { token: accessTokenFromLink });
  } catch (error) {
    return { error: error.message };
  }
  keep({
    access_token: accessTokenFromLink,
    refresh_token: params.get('refresh_token'),
    expires_in: params.get('expires_in'),
    user,
  });
  await recordPendingConsents();
  return { type: params.get('type') || 'signup' };
}

/** Records what someone agreed to at sign-up in the consents table, once they're signed in. */
export async function recordPendingConsents() {
  let consents;
  try {
    consents = JSON.parse(getPref(PENDING_CONSENTS_KEY, 'null'));
  } catch {
    consents = null;
  }
  if (!consents) return false;
  // Only for the account they were given for (not another account logged in on this device).
  if (consents.email && consents.email !== String(session?.user?.email ?? '').toLowerCase()) return false;
  const token = await accessToken();
  if (!token) return false;
  const rows = [
    { document: 'terms', version: consents.terms, agreed: true },
    { document: 'privacy', version: consents.privacy, agreed: true },
    { document: 'emails', version: consents.terms, agreed: Boolean(consents.emails) },
  ];
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/consents`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (!response.ok) return false; // kept for next time
  } catch {
    return false;
  }
  setPref(PENDING_CONSENTS_KEY, '');
  return true;
}
