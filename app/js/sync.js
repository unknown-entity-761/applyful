// Sync (version 4): when you're signed in, your applications and profile are saved to
// your account and kept the same on every device you sign in on. That's also the
// automatic backup. (CV and LinkedIn files come next.)
//
// The newest copy of each record wins, by its updatedAt, just as with backups.
// A sync:
//   1. fetches what changed in the account since the last sync (the server stamps
//      every change with synced_at, so only new changes come down),
//   2. applies anything newer than this device's copy, including deletions,
//   3. sends this device's own changes, with deleted applications as deleted = true
//      so the deletion reaches every device.
// It runs when you sign in, when the app opens or comes back on screen, when you're
// back online, and a few seconds after you change something.
//
// The first time an account syncs on a device that already has data, it asks before
// moving that data into the account.

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { accessToken, currentUser, signOut } from './auth.js';
import { STORES, getAllRecords, getRecord, putRecords, deleteRecord, pendingDeletions, deletionsSent } from './store.js';
import { normalize } from './model.js';
import { normalizeProfile, isProfileEmpty } from './profile.js';
import { getPref, setPref } from './prefs.js';

const PAGE = 1000;
const EPOCH = '1970-01-01T00:00:00.000Z';
const CHANGE_DELAY_MS = 3000;
const RESYNC_AFTER_MS = 60 * 1000;

/** Timestamps from the server (…+00:00) and the app (…Z) compared as moments in time. */
const time = (iso) => Date.parse(iso || '') || 0;
const toAppTime = (iso) => new Date(time(iso)).toISOString();

export class SyncError extends Error {
  constructor(status, code = '', detail = '') {
    super(syncMessage(status, code, detail));
    this.name = 'SyncError';
    this.status = status;
    this.code = code;
  }
}

export function syncMessage(status, code = '', detail = '') {
  if (status === 0) return 'You’re offline. Changes are saved here and will sync when you’re back online.';
  if (code === '42501') return 'Your account’s online storage isn’t fully set up yet, so nothing was synced.';
  if (status === 401) return 'You’ve been logged out. Log in again to keep syncing.';
  return `Couldn’t sync just now${detail ? ` (${detail})` : ''}. It will try again.`;
}

// ---- Deciding what to do (no saving or network here, so it can be tested) ----

/**
 * localApps    every application on this device
 * remoteRows   what changed in the account since the last sync: { id, data, updated_at, deleted }
 * deletions    applications deleted here and not sent yet: { id: deletedAt }
 * lastPushedAt when this device last sent its changes
 * Returns { apply, removeLocal, push, sentDeletions }.
 */
export function planSync({ localApps, remoteRows, deletions = {}, lastPushedAt = EPOCH }) {
  const local = new Map(localApps.map((app) => [app.id, app]));
  const remote = new Map(remoteRows.map((row) => [row.id, row]));
  const apply = [];
  const removeLocal = [];
  const push = [];
  const sentDeletions = {};

  for (const row of remoteRows) {
    const mine = local.get(row.id);
    if (row.deleted) {
      if (mine && time(mine.updatedAt) <= time(row.updated_at)) removeLocal.push(row.id);
      continue;
    }
    const deletedHere = deletions[row.id];
    if (deletedHere && time(deletedHere) >= time(row.updated_at)) continue; // deleted here later: sent below
    if (!mine || time(row.updated_at) > time(mine.updatedAt)) {
      apply.push(normalize({ ...row.data, id: row.id, updatedAt: toAppTime(row.updated_at) }));
    }
  }

  for (const app of localApps) {
    const theirs = remote.get(app.id);
    const newer = theirs ? time(app.updatedAt) > time(theirs.updated_at) : time(app.updatedAt) > time(lastPushedAt);
    if (newer) push.push({ id: app.id, data: app, updated_at: app.updatedAt, deleted: false });
  }

  for (const [id, deletedAt] of Object.entries(deletions)) {
    if (local.has(id)) continue; // saved again since
    const theirs = remote.get(id);
    if (theirs && time(theirs.updated_at) > time(deletedAt)) continue; // changed elsewhere afterwards: that wins
    push.push({ id, data: { id }, updated_at: deletedAt, deleted: true });
    sentDeletions[id] = deletedAt;
  }

  return { apply, removeLocal, push, sentDeletions };
}

/** For the profile: 'apply' the account's copy, 'push' this device's, or 'none'. */
export function planProfile(localProfile, remoteRow) {
  const mine = localProfile?.updatedAt ? time(localProfile.updatedAt) : 0;
  const theirs = remoteRow ? time(remoteRow.updated_at) : 0;
  if (theirs > mine) return 'apply';
  if (mine > theirs) return 'push';
  return 'none';
}

// ---- Talking to the account ----

async function rest(path, token, { method = 'GET', body, prefer } = {}) {
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new SyncError(0);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new SyncError(response.status, data.code ?? '', data.message ?? '');
  }
  return method === 'GET' ? response.json() : null;
}

/** Everything changed since (afterTime, afterId), oldest first, a page at a time. */
async function pullApplications(token, afterTime, afterId) {
  const rows = [];
  for (;;) {
    const filter = afterId
      ? `or=${encodeURIComponent(`(synced_at.gt.${afterTime},and(synced_at.eq.${afterTime},id.gt.${afterId}))`)}`
      : `synced_at=gt.${encodeURIComponent(afterTime)}`;
    const page = await rest(`applications?select=id,data,updated_at,deleted,synced_at&${filter}&order=synced_at.asc,id.asc&limit=${PAGE}`, token);
    rows.push(...page);
    if (page.length < PAGE) return rows;
    afterTime = page[page.length - 1].synced_at;
    afterId = page[page.length - 1].id;
  }
}

async function upsert(table, rows, conflict, token) {
  for (let i = 0; i < rows.length; i += 500) {
    await rest(`${table}?on_conflict=${conflict}`, token, {
      method: 'POST',
      body: rows.slice(i, i + 500),
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
  }
}

// ---- What each device remembers about each account ----

const memory = new Map();
const stateKey = (userId) => `jt-sync-${userId}`;

function loadState(userId) {
  const key = stateKey(userId);
  if (!memory.has(key)) {
    let saved = null;
    try {
      saved = JSON.parse(getPref(key, 'null'));
    } catch {
      saved = null;
    }
    memory.set(key, saved);
  }
  return memory.get(key);
}

function saveState(userId, state) {
  memory.set(stateKey(userId), state);
  setPref(stateKey(userId), JSON.stringify(state));
}

/** For tests: forget what this device knows about an account, like a new device. */
export function forgetSyncState(userId) {
  memory.delete(stateKey(userId));
  setPref(stateKey(userId), '');
}

// ---- Status, for the Account page ----

let status = { state: 'off', lastSyncedAt: '', error: '' };

export function syncStatus() {
  const user = currentUser();
  if (!user) return { state: 'off', lastSyncedAt: '', error: '' };
  return { ...status, lastSyncedAt: status.lastSyncedAt || loadState(user.id)?.lastSyncedAt || '' };
}

function setStatus(next) {
  status = { ...status, ...next };
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('foliofy:sync-changed', { detail: syncStatus() }));
  }
}

// ---- Running a sync ----

let running = null;
let runAgain = false;
let applying = false;
let lastRunAt = 0;

function askToMove({ email, count, hasProfile }) {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
  const what = [count > 0 ? `${count} application${count === 1 ? '' : 's'}` : '', hasProfile ? 'your profile' : ''].filter(Boolean).join(' and ');
  return window.confirm(`Move the ${what} on this device into your account (${email})?\n\nThey’ll then be on every device you sign in on. Choose Cancel to sign out and keep them only on this device.`);
}

/**
 * Syncs now (or once more after the sync already running). Resolves to
 * { applied, removed, pushed } or { skipped } or { cancelled }.
 */
export function syncNow(options = {}) {
  if (running) {
    runAgain = true;
    return running;
  }
  running = run(options).finally(() => {
    running = null;
    lastRunAt = Date.now();
    if (runAgain) {
      runAgain = false;
      syncNow(options);
    }
  });
  return running;
}

async function run({ confirmMove = askToMove } = {}) {
  const user = currentUser();
  const token = user ? await accessToken() : null;
  if (!user || !token) {
    setStatus({ state: 'off', error: '' });
    return { skipped: true };
  }

  let state = loadState(user.id);
  if (!state) {
    // First sync for this account on this device: ask before moving existing data in.
    const [apps, profileRecord] = await Promise.all([getAllRecords(STORES.applications), getRecord(STORES.profile, 'me')]);
    const hasProfile = Boolean(profileRecord) && !isProfileEmpty(normalizeProfile(profileRecord));
    if ((apps.length > 0 || hasProfile) && !(await confirmMove({ email: user.email, count: apps.length, hasProfile }))) {
      await signOut();
      setStatus({ state: 'off', error: '' });
      return { cancelled: true };
    }
    state = { lastPulledAt: EPOCH, lastPulledId: '', lastPushedAt: EPOCH, lastSyncedAt: '' };
  }

  setStatus({ state: 'syncing', error: '' });
  const startedAt = new Date().toISOString();
  try {
    // 1. What changed in the account
    const remoteRows = await pullApplications(token, state.lastPulledAt, state.lastPulledId);
    const [remoteProfile] = await rest('profiles?select=data,updated_at', token);

    // 2. Apply it here
    const localApps = await getAllRecords(STORES.applications);
    const plan = planSync({ localApps, remoteRows, deletions: pendingDeletions(), lastPushedAt: state.lastPushedAt });
    applying = true;
    try {
      if (plan.apply.length) await putRecords(STORES.applications, plan.apply);
      for (const id of plan.removeLocal) await deleteRecord(STORES.applications, id);
    } finally {
      applying = false;
    }
    const localProfile = await getRecord(STORES.profile, 'me');
    const profileStep = planProfile(localProfile, remoteProfile);
    if (profileStep === 'apply') {
      applying = true;
      try {
        await putRecords(STORES.profile, [normalizeProfile({ ...remoteProfile.data, updatedAt: toAppTime(remoteProfile.updated_at) })]);
      } finally {
        applying = false;
      }
    }

    // 3. Send this device's changes
    if (plan.push.length) {
      await upsert('applications', plan.push.map((row) => ({ user_id: user.id, ...row })), 'user_id,id', token);
      deletionsSent(plan.sentDeletions);
    }
    if (profileStep === 'push') {
      await upsert('profiles', [{ user_id: user.id, data: normalizeProfile(localProfile), updated_at: localProfile.updatedAt }], 'user_id', token);
    }

    const newest = remoteRows[remoteRows.length - 1];
    state = {
      lastPulledAt: newest ? newest.synced_at : state.lastPulledAt,
      lastPulledId: newest ? newest.id : state.lastPulledId,
      lastPushedAt: startedAt,
      lastSyncedAt: new Date().toISOString(),
    };
    saveState(user.id, state);
    setStatus({ state: 'ok', lastSyncedAt: state.lastSyncedAt, error: '' });
    const changedHere = plan.apply.length + plan.removeLocal.length + (profileStep === 'apply' ? 1 : 0);
    return { applied: changedHere, removed: plan.removeLocal.length, pushed: plan.push.length + (profileStep === 'push' ? 1 : 0) };
  } catch (error) {
    if (!(error instanceof SyncError)) console.error(error);
    setStatus({ state: 'error', error: error instanceof SyncError ? error.message : syncMessage(500) });
    return { error: error.message };
  }
}

// ---- When to sync ----

let timer = 0;
function schedule(delay) {
  if (!currentUser()) return;
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), delay);
}

/**
 * Starts syncing in the background. `onRemoteChanges` is called after a sync
 * brought changes from other devices, so the screen can redraw.
 */
export function startSync({ onRemoteChanges = () => {} } = {}) {
  const runAndReport = async () => {
    const result = await syncNow();
    if (result?.applied > 0) onRemoteChanges(result);
  };
  window.addEventListener('foliofy:data-changed', () => {
    if (!applying) schedule(CHANGE_DELAY_MS);
  });
  window.addEventListener('foliofy:auth-changed', (event) => {
    if (event.detail.signedIn) runAndReport();
    else setStatus({ state: 'off', error: '' });
  });
  window.addEventListener('online', () => runAndReport());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastRunAt > RESYNC_AFTER_MS) runAndReport();
  });
  if (currentUser()) runAndReport();
}
