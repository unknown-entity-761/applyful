// Accounts (version 4): sign up, log in, stay logged in, reset a password, sign out.
// Signing in is optional; without an account the app works as before.
//
// Talks to Supabase's sign-in service directly with fetch, so the app needs no extra
// library. The session (two tokens and who you are) is kept on this device, so you
// stay logged in until you sign out. The password itself is never stored here.
//
// Email links (confirming an address, resetting a password) come back to the app as
// #access_token=...&type=... in the address; handleAuthRedirect() picks those up.

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { getPref, setPref } from './prefs.js';

const SESSION_KEY = 'jt-session';
const PENDING_CONSENTS_KEY = 'jt-pending-consents';
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
    const wasSignedIn = Boolean(session);
    session = readStoredSession();
    if (wasSignedIn !== Boolean(session)) notify();
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
    network: 'Couldn’t reach Foliofy’s server. Check your connection and try again.',
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

function keep(data) {
  session = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
    user: { id: data.user?.id ?? '', email: data.user?.email ?? '' },
  };
  setPref(SESSION_KEY, JSON.stringify(session));
  notify();
  return session;
}

function forget(reason = 'signed-out') {
  session = null;
  setPref(SESSION_KEY, '');
  notify(reason);
}

/** reason: 'signed-in', 'signed-out', or 'expired' (the session was refused: log in again). */
function notify(reason = session ? 'signed-in' : 'signed-out') {
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('foliofy:auth-changed', { detail: { signedIn: Boolean(session), reason } }));
  }
}

/** Where email links should bring people back to: this app's own address. */
export function appAddress() {
  return typeof location === 'undefined' ? '' : `${location.origin}${location.pathname}`;
}

/** The signed-in person ({ id, email }), or null. */
export function currentUser() {
  return session?.user ?? null;
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
    try {
      const data = await call('token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: latest?.refreshToken ?? session.refreshToken } });
      keep(data);
      return session.accessToken;
    } catch (error) {
      // Offline, busy or a server hiccup: keep the session and try again later.
      // Only a refused session means logging in again.
      const temporary = error.code === 'network' || error.code === 'over_request_rate_limit' || error.status === 429 || error.status >= 500;
      if (!temporary) forget('expired');
      return null;
    }
  };
  if (typeof navigator !== 'undefined' && navigator.locks?.request) return navigator.locks.request('foliofy-session', refresh);
  return refresh();
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
