// The online copy without an account: a guest session (Supabase's anonymous sign-in)
// that syncs like an account, and is deleted when it's turned off or replaced by a
// real account. Supabase is replaced by a small stand-in server.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// This browser can keep a session (a private window couldn't), and screens hear events.
const saved = new Map();
globalThis.localStorage = {
  getItem: (key) => (saved.has(key) ? saved.get(key) : null),
  setItem: (key, value) => saved.set(key, String(value)),
  removeItem: (key) => saved.delete(key),
};
globalThis.window = new EventTarget();
const events = [];
window.addEventListener('foliofy:auth-changed', (event) => events.push(event.detail));

const store = await import('../app/js/store.js');
const { STORES } = store;
await store.init();
const { normalize } = await import('../app/js/model.js');
const auth = await import('../app/js/auth.js');
const { syncNow } = await import('../app/js/sync.js');

const app = (id, updatedAt) => normalize({ id, company: `Company ${id}`, title: 'Analyst', createdAt: updatedAt, updatedAt });

// ---- A stand-in Supabase that knows who each token belongs to ----

let server;
let calls;
let offline = false;

function resetServer() {
  // Ids keep counting across tests: real guest ids are never reused either.
  server = { users: new Map(), tokens: new Map(), rows: new Map(), anonymousOn: true, clock: Date.parse('2026-11-22T00:00:00Z'), next: server?.next ?? 1 };
  calls = [];
}

function json(status, body) {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function issue(user) {
  const token = `token-${server.next++}`;
  server.tokens.set(token, user.id);
  server.tokens.set(`refresh-${token}`, user.id);
  return { access_token: token, refresh_token: `refresh-${token}`, expires_in: 3600, user };
}

globalThis.fetch = async (url, options = {}) => {
  if (offline) throw new TypeError('Failed to fetch');
  const { pathname, searchParams } = new URL(url);
  const method = options.method ?? 'GET';
  const body = typeof options.body === 'string' && options.body ? JSON.parse(options.body) : undefined;
  const who = server.tokens.get(String(options.headers?.Authorization ?? '').replace(/^Bearer /, ''));
  calls.push({ path: pathname, method, body, who });

  if (pathname === '/auth/v1/signup' && !body.email) {
    if (!server.anonymousOn) return json(422, { code: 422, error_code: 'anonymous_provider_disabled', msg: 'Anonymous sign-ins are disabled' });
    const user = { id: `guest-${server.next++}`, email: '', is_anonymous: true };
    server.users.set(user.id, user);
    return json(200, issue(user));
  }
  if (pathname === '/auth/v1/token' && searchParams.get('grant_type') === 'password') {
    const user = { id: 'account-1', email: body.email, is_anonymous: false };
    server.users.set(user.id, user);
    return json(200, issue(user));
  }
  if (pathname === '/auth/v1/token' && searchParams.get('grant_type') === 'refresh_token') {
    if (server.holdRefresh) await server.holdRefresh;
    const id = server.tokens.get(body.refresh_token);
    if (!id || !server.users.has(id)) return json(400, { error_code: 'refresh_token_not_found' });
    return json(200, issue(server.users.get(id)));
  }
  if (pathname === '/rest/v1/consents') return json(201, null);
  if (!who || !server.users.has(who)) return json(401, { code: 'PGRST301', message: 'JWT expired' });

  if (pathname === '/storage/v1/object/documents' && method === 'DELETE') return json(200, []);
  if (pathname === '/rest/v1/rpc/delete_my_account') {
    server.users.delete(who);
    for (const [key, row] of server.rows) if (row.user_id === who) server.rows.delete(key);
    return json(204, null);
  }
  if (pathname === '/rest/v1/applications' && method === 'GET') {
    const after = Date.parse((searchParams.get('synced_at') ?? 'gt.1970-01-01T00:00:00Z').replace(/^gt\./, ''));
    const rows = [...server.rows.values()].filter((r) => r.user_id === who && Date.parse(r.synced_at) > after);
    return json(200, rows.map(({ id, data, updated_at, deleted, synced_at }) => ({ id, data, updated_at, deleted, synced_at })));
  }
  if (pathname === '/rest/v1/applications' && method === 'POST') {
    server.clock += 1000;
    for (const row of body) server.rows.set(`${who}/${row.id}`, { ...row, synced_at: new Date(server.clock).toISOString() });
    return json(201, null);
  }
  if (['/rest/v1/profiles', '/rest/v1/documents', '/rest/v1/cv_versions'].includes(pathname)) return json(method === 'GET' ? 200 : 201, method === 'GET' ? [] : null);
  if (pathname === '/storage/v1/object/list/documents') return json(200, []);
  return json(404, { message: `No stand-in for ${method} ${pathname}` });
};

const askedToMove = [];
const confirmMove = async (details) => {
  askedToMove.push(details);
  return true;
};

beforeEach(async () => {
  offline = false;
  resetServer();
  if (auth.currentUser()) await auth.signOut();
  await auth.setOnlineCopy(false);
  saved.clear();
  events.length = 0;
  askedToMove.length = 0;
  await store.clearStore(STORES.applications);
});

// ---- The tests ----

test('no guest until the online copy is switched on; then a guest, which isn’t an account', async () => {
  assert.equal(auth.onlineCopyChoice(), '');
  assert.equal(await auth.startGuest(), null);
  assert.equal(calls.length, 0, 'nothing sent before saying yes');

  await auth.setOnlineCopy(true);
  assert.equal(auth.onlineUser()?.guest, true);
  assert.equal(auth.currentUser(), null, 'screens still treat it as signed out');
  assert.equal(auth.dataHome(), 'online-copy');
  assert.deepEqual(calls[0].body, { data: {} }, 'no email or name is sent');
  assert.equal(events.at(-1).online, true);
  assert.equal(events.at(-1).signedIn, false);
});

test('a guest’s data syncs to its online copy without asking to move it', async () => {
  await store.putRecords(STORES.applications, [app('a', '2026-11-21T10:00:00Z'), app('b', '2026-11-21T11:00:00Z')]);
  await auth.setOnlineCopy(true);
  const result = await syncNow({ confirmMove });
  assert.equal(result.pushed, 2);
  assert.equal(askedToMove.length, 0);
  const guest = auth.onlineUser().id;
  assert.deepEqual([...server.rows.values()].filter((r) => r.user_id === guest).map((r) => r.id).sort(), ['a', 'b']);
});

test('if this device loses its data, the online copy brings it back, even after adding something new', async () => {
  await store.putRecords(STORES.applications, [app('a', '2026-11-21T10:00:00Z')]);
  await auth.setOnlineCopy(true);
  await syncNow({ confirmMove });
  // Storage lost (the sign-in was kept), then a new application added before the next sync.
  await store.clearStore(STORES.applications);
  await store.clearStore(STORES.documents);
  await store.putRecords(STORES.applications, [app('new', new Date().toISOString())]);
  await syncNow({ confirmMove });
  assert.deepEqual((await store.getAllRecords(STORES.applications)).map((a) => a.id).sort(), ['a', 'new']);
});

test('logging in replaces the guest: its online copy is deleted and the account asks first', async () => {
  await store.putRecords(STORES.applications, [app('a', '2026-11-21T10:00:00Z')]);
  await auth.setOnlineCopy(true);
  await syncNow({ confirmMove });
  const guest = auth.onlineUser().id;

  await auth.logIn('alex@example.com', 'pw');
  await new Promise((resolve) => setTimeout(resolve, 20)); // the guest is removed in the background
  assert.equal(auth.currentUser().email, 'alex@example.com');
  assert.ok(!server.users.has(guest), 'the guest is gone');
  assert.ok(calls.some((c) => c.path === '/storage/v1/object/documents' && c.method === 'DELETE' && c.who === guest), 'its files were deleted first');
  assert.ok(![...server.rows.values()].some((r) => r.user_id === guest), 'and its rows');

  await syncNow({ confirmMove });
  assert.equal(askedToMove.length, 1, 'moving this device’s data into the account is asked, as before');
  assert.ok(server.rows.has('account-1/a'));
});

test('turning the online copy off deletes it; offline, it’s deleted once back online', async () => {
  await auth.setOnlineCopy(true);
  const first = auth.onlineUser().id;
  await auth.setOnlineCopy(false);
  assert.equal(auth.onlineUser(), null);
  assert.ok(!server.users.has(first));
  assert.equal(events.at(-1).reason, 'copy-off');

  await auth.setOnlineCopy(true);
  const second = auth.onlineUser().id;
  offline = true;
  await auth.setOnlineCopy(false);
  assert.ok(server.users.has(second), 'couldn’t be deleted while offline');
  offline = false;
  await auth.finishRemovingGuests();
  assert.ok(!server.users.has(second), 'deleted when back online');
});

test('with guest sign-ins off in Supabase, the app quietly stays on this device', async () => {
  server.anonymousOn = false;
  assert.equal(await auth.setOnlineCopy(true), null);
  assert.equal(auth.onlineUser(), null);
  assert.equal(auth.dataHome(), 'device', 'screens don’t claim an online copy that isn’t there');
  calls.length = 0;
  await auth.startGuest();
  assert.equal(calls.length, 0, 'not asked again until the app opens next time');
});

test('a guest the server no longer knows ends quietly, without “you’ve been signed out”', async () => {
  await auth.setOnlineCopy(true);
  server.users.clear(); // deleted after a year unused
  saved.set('jt-session', JSON.stringify({ ...JSON.parse(saved.get('jt-session')), expiresAt: 0 }));
  window.dispatchEvent(Object.assign(new Event('storage'), { key: 'jt-session' }));
  assert.equal(await auth.accessToken(), null);
  assert.equal(auth.onlineUser(), null);
  assert.equal(events.at(-1).reason, 'guest-ended');
});

// ---- Fixes from the second review (22 Nov 2026) ----

test('after an account replaces the guest, signing out asks again instead of starting a new copy', async () => {
  await auth.setOnlineCopy(true);
  await auth.logIn('alex@example.com', 'pw');
  assert.equal(auth.onlineCopyChoice(), '', 'the question will be asked again');
  await auth.signOut();
  assert.equal(await auth.startGuest(), null, 'no new guest without a yes');
});

test('turning the copy off while offline says it isn’t deleted yet', async () => {
  await auth.setOnlineCopy(true);
  offline = true;
  assert.equal(await auth.setOnlineCopy(false), false);
  offline = false;
  await auth.finishRemovingGuests();
});

test('a guest refresh that arrives after logging in doesn’t bring the guest back', async () => {
  await auth.setOnlineCopy(true);
  const guest = auth.onlineUser().id;
  saved.set('jt-session', JSON.stringify({ ...JSON.parse(saved.get('jt-session')), expiresAt: 0 }));
  window.dispatchEvent(Object.assign(new Event('storage'), { key: 'jt-session' }));
  let release;
  server.holdRefresh = new Promise((resolve) => { release = resolve; });
  const refreshing = auth.accessToken(); // on its way...
  await auth.logIn('alex@example.com', 'pw'); // ...while you log in
  server.holdRefresh = null;
  release();
  await refreshing;
  assert.equal(auth.currentUser()?.email, 'alex@example.com', 'still the account');
  assert.notEqual(auth.onlineUser().id, guest);
});
