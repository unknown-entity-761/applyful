// Accounts: signing up, logging in, staying logged in, email links, and clear messages.
// Supabase is replaced by a stand-in fetch, so nothing is sent anywhere.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  signUp,
  logIn,
  signOut,
  currentUser,
  accessToken,
  handleAuthRedirect,
  authMessage,
  AuthError,
} from '../app/js/auth.js';

const realFetch = globalThis.fetch;
let calls = [];

/** Answers each request with the next of `responses`: [status, body] or an Error to throw. */
function supabase(...responses) {
  calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method ?? 'GET', headers: options.headers ?? {}, body: options.body ? JSON.parse(options.body) : undefined });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    const [status, body] = next ?? [500, {}];
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
}

const tokens = (overrides = {}) => ({
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 3600,
  user: { id: 'user-1', email: 'alex@example.com' },
  ...overrides,
});

afterEach(async () => {
  supabase([200, {}]);
  await signOut();
  globalThis.fetch = realFetch;
});

test('logging in keeps you signed in, with the publishable key and no password stored', async () => {
  supabase([200, tokens()], [201, {}]);
  const user = await logIn('alex@example.com', 'correct horse');
  assert.equal(user.email, 'alex@example.com');
  assert.deepEqual(currentUser(), { id: 'user-1', email: 'alex@example.com' });
  assert.match(calls[0].url, /\/auth\/v1\/token\?grant_type=password$/);
  assert.match(calls[0].headers.apikey, /^sb_publishable_/);
  assert.equal(await accessToken(), 'access-1', 'a fresh token is used as it is');
});

test('wrong password, unconfirmed email and no connection get plain messages', async () => {
  supabase([400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }]);
  await assert.rejects(logIn('alex@example.com', 'wrong'), (error) => error instanceof AuthError && /don’t match/.test(error.message));

  supabase([400, { error_code: 'email_not_confirmed' }]);
  await assert.rejects(logIn('alex@example.com', 'pw'), /Confirm your email first/);

  supabase(new TypeError('Failed to fetch'));
  await assert.rejects(logIn('alex@example.com', 'pw'), { code: 'network' });
  assert.equal(currentUser(), null);
});

test('signing up asks for the email to be confirmed, and records what was agreed to', async () => {
  supabase([200, { id: 'user-2', email: 'sam@example.com' }]);
  const result = await signUp('sam@example.com', 'long enough', { emailsOk: false });
  assert.deepEqual(result, { needsConfirmation: true });
  assert.equal(currentUser(), null, 'not signed in until the email link is opened');
  const { consents } = calls[0].body.data;
  assert.equal(consents.minAge, 16);
  assert.equal(consents.emails, false);
  assert.ok(consents.terms && consents.privacy && consents.agreedAt);
});

test('a token about to run out is refreshed; a refused refresh signs you out', async () => {
  supabase([200, tokens({ expires_in: 30 })], [201, {}]);
  await logIn('alex@example.com', 'pw');

  supabase([200, tokens({ access_token: 'access-2', refresh_token: 'refresh-2' })]);
  assert.equal(await accessToken(), 'access-2');
  assert.deepEqual(calls[0].body, { refresh_token: 'refresh-1' });

  supabase([200, tokens({ expires_in: 30 })], [201, {}]);
  await logIn('alex@example.com', 'pw');
  supabase([400, { error_code: 'refresh_token_not_found' }]);
  assert.equal(await accessToken(), null);
  assert.equal(currentUser(), null);
});

test('email links: confirming signs you in; expired links say so; other addresses are ignored', async () => {
  assert.equal(await handleAuthRedirect('#/applications'), null);

  const expired = await handleAuthRedirect('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  assert.match(expired.error, /expired or was already used/);

  supabase([200, { id: 'user-3', email: 'jo@example.com' }], [201, {}]);
  const result = await handleAuthRedirect('#access_token=link-token&expires_in=3600&refresh_token=link-refresh&token_type=bearer&type=signup');
  assert.deepEqual(result, { type: 'signup' });
  assert.equal(currentUser().email, 'jo@example.com');
  assert.equal(calls[0].headers.Authorization, 'Bearer link-token');

  supabase([200, { id: 'user-3', email: 'jo@example.com' }]);
  assert.deepEqual(await handleAuthRedirect('#access_token=t&refresh_token=r&type=recovery'), { type: 'recovery' });
});

test('every message is plain English', () => {
  assert.match(authMessage('user_already_exists'), /Log in instead/);
  assert.match(authMessage('weak_password'), /at least 8/);
  assert.match(authMessage('something_new', 'Detail from server'), /Detail from server/);
});
