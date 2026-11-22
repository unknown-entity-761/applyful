// Sync (version 4): when you're signed in, your applications, profile, CV and
// LinkedIn files and CV check results are saved to your account and kept the same on
// every device you sign in on. That's also the automatic backup. Each device keeps a
// working copy, so the app still opens and works with no signal.
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
//
// Without an account, the same sync keeps an online copy for this browser, as a guest
// (see auth.js), once you've agreed to it. A guest never gets asked about moving data:
// the copy is this device's own.

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { accessToken, onlineUser, signOut, startGuest, onlineCopyChoice, finishRemovingGuests, onSessionChange, setSyncWaiter } from './auth.js';
import { STORES, getAllRecords, getRecord, putRecords, deleteRecord, pendingDeletions, deletionsSent, pendingUnsent, unsentSent, storageMode } from './store.js';
import { normalize } from './model.js';
import {
  normalizeProfile, isProfileEmpty, mergeIntoProfile, DOC_KINDS, CV_CHECK_ID, documentDeletedAt, markDocumentDeleted, safeDocType,
  listCvVersions, versionRecordId, pendingVersionDeletions, versionDeletionsSent, archiveCv, cvVersionIdOf,
} from './profile.js';
import { getPref, setPref } from './prefs.js';
import { normalizeLetter, pendingLetterDeletions, letterDeletionsSent } from './letters.js';

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
 * unsent       ids restored with old timestamps, to send anyway (the server keeps the newer copy)
 * Returns { apply, removeLocal, push, sentDeletions }.
 */
export function planSync({ localApps, remoteRows, deletions = {}, lastPushedAt = EPOCH, unsent = new Set() }) {
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
    const newer = theirs ? time(app.updatedAt) > time(theirs.updated_at) : time(app.updatedAt) > time(lastPushedAt) || unsent.has(app.id);
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

// ---- CV and LinkedIn files ----
// Files go in the private file store, one folder per person (documents/<user id>/cv).
// A small row per file in the documents table says which version is newest, and
// carries the CV check result for that CV.

const MIME_BY_EXTENSION = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const uploadType = (doc) => (Object.values(MIME_BY_EXTENSION).includes(doc.type)
  ? doc.type
  : MIME_BY_EXTENSION[String(doc.name).split('.').pop().toLowerCase()] ?? 'application/pdf');

async function files(path, token, { method = 'GET', body, type } = {}) {
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/storage/v1/object/${path}`, {
      method,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
        ...(type ? { 'Content-Type': type, 'x-upsert': 'true' } : {}),
      },
      body,
    });
  } catch {
    throw new SyncError(0);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new SyncError(response.status, String(data.statusCode ?? data.code ?? ''), data.message ?? data.error ?? '');
  }
  return method === 'GET' ? response.arrayBuffer() : null;
}

const checkFor = (check, doc) => (check && doc && time(check.cvUploadedAt) === time(doc.uploadedAt) ? check : null);

/** Brings the CV and LinkedIn files (and the CV check) up to date both ways. */
async function syncDocuments(user, token) {
  const rows = await rest('documents?select=kind,name,type,size,uploaded_at,deleted,cv_check,updated_at,version_id,added_at', token);
  const remote = new Map(rows.map((row) => [row.kind, row]));
  let applied = 0;
  let pushed = 0;
  for (const kind of Object.keys(DOC_KINDS)) {
    const local = await getRecord(STORES.documents, kind);
    const localCheck = kind === 'cv' ? checkFor(await getRecord(STORES.documents, CV_CHECK_ID), local) : null;
    const row = remote.get(kind);
    const mine = local ? time(local.uploadedAt) : time(documentDeletedAt(kind));
    const theirs = row ? time(row.updated_at) : 0;
    const path = `documents/${user.id}/${kind}`;

    if (theirs > mine) {
      applying = true;
      try {
        if (row.deleted) {
          // Remember it, so the same deletion isn't applied again at every sync.
          markDocumentDeleted(kind, toAppTime(row.updated_at));
          if (local) await deleteRecord(STORES.documents, kind);
          if (kind === 'cv') await deleteRecord(STORES.documents, CV_CHECK_ID);
          if (!local) continue;
        } else {
          const data = await files(`authenticated/${path}`, token);
          const uploadedAt = toAppTime(row.uploaded_at);
          const doc = { id: kind, name: String(row.name).slice(0, 120), type: safeDocType(row.type, row.name), size: data.byteLength, uploadedAt, data };
          if (kind === 'cv') {
            doc.versionId = row.version_id || cvVersionIdOf({ uploadedAt });
            doc.addedAt = row.added_at ? toAppTime(row.added_at) : uploadedAt;
            // A different CV replaces this device's: keep this one in the CV history.
            if (local && cvVersionIdOf(local) !== doc.versionId) await archiveCv(local);
          }
          await putRecords(STORES.documents, [doc]);
          if (kind === 'cv' && checkFor(row.cv_check, doc)) await putRecords(STORES.documents, [{ ...row.cv_check, id: CV_CHECK_ID }]);
        }
      } finally {
        applying = false;
      }
      applied += 1;
    } else if (mine > theirs) {
      if (local) {
        if (kind === 'cv' && row && !row.deleted && (row.version_id || cvVersionIdOf({ uploadedAt: toAppTime(row.uploaded_at) })) !== cvVersionIdOf(local)) {
          // A different CV in the account (added elsewhere, or before this device's was
          // moved in): keep it in the CV history rather than lose it.
          const data = await files(`authenticated/${path}`, token);
          const uploadedAt = toAppTime(row.uploaded_at);
          const theirs = {
            id: 'cv', name: String(row.name).slice(0, 120), type: safeDocType(row.type, row.name), size: data.byteLength, uploadedAt, data,
            versionId: row.version_id || cvVersionIdOf({ uploadedAt }), addedAt: row.added_at ? toAppTime(row.added_at) : uploadedAt,
          };
          applying = true;
          try {
            await archiveCv(theirs, checkFor(row.cv_check, theirs));
          } finally {
            applying = false;
          }
        }
        await files(path, token, { method: 'POST', body: local.data, type: uploadType(local) });
        await upsert('documents', [{
          user_id: user.id, kind, name: local.name, type: local.type, size: local.size,
          uploaded_at: local.uploadedAt, deleted: false, cv_check: localCheck ? { ...localCheck, id: undefined } : null, updated_at: local.uploadedAt,
          version_id: kind === 'cv' ? cvVersionIdOf(local) : null, added_at: kind === 'cv' ? local.addedAt || local.uploadedAt : null,
        }], 'user_id,kind', token);
      } else {
        await files(path, token, { method: 'DELETE' }).catch((error) => { if (error.status !== 404 && error.status !== 400) throw error; });
        await upsert('documents', [{
          user_id: user.id, kind, name: '', type: '', size: 0, uploaded_at: documentDeletedAt(kind), deleted: true, cv_check: null, updated_at: documentDeletedAt(kind),
        }], 'user_id,kind', token);
      }
      pushed += 1;
    } else if (kind === 'cv' && local && row && !row.deleted) {
      // The same CV everywhere: the newer CV check (score, ignored suggestions) wins.
      const theirCheck = checkFor(row.cv_check, local);
      if (theirCheck && time(theirCheck.checkedAt) > time(localCheck?.checkedAt)) {
        applying = true;
        try {
          await putRecords(STORES.documents, [{ ...theirCheck, id: CV_CHECK_ID }]);
        } finally {
          applying = false;
        }
        applied += 1;
      } else if (localCheck && time(localCheck.checkedAt) > time(theirCheck?.checkedAt)) {
        await upsert('documents', [{
          user_id: user.id, kind, name: row.name, type: row.type, size: row.size,
          uploaded_at: row.uploaded_at, deleted: false, cv_check: { ...localCheck, id: undefined }, updated_at: row.updated_at,
          version_id: row.version_id, added_at: row.added_at,
        }], 'user_id,kind', token);
        pushed += 1;
      }
    }
  }
  return { applied, pushed };
}

// ---- Earlier CVs (CV history, version 4.2) ----
// Each earlier CV is a row in cv_versions plus a file at <user id>/cv-versions/<id>.
// Versions don't change once kept, so a sync only adds the ones a side is missing and
// passes on deletions (kept as deleted = true, like applications). The list is short
// (10 at most), so it's fetched whole each time.

async function syncCvVersions(user, token) {
  const rows = await rest('cv_versions?select=id,name,type,size,added_at,cv_check,deleted,updated_at', token);
  const remote = new Map(rows.map((row) => [row.id, row]));
  const local = new Map((await listCvVersions()).map((version) => [version.versionId, version]));
  const deletions = pendingVersionDeletions();
  const path = (id) => `documents/${user.id}/cv-versions/${id}`;
  let applied = 0;
  let pushed = 0;

  applying = true;
  try {
    for (const row of rows) {
      const mine = local.get(row.id);
      if (row.deleted) {
        if (mine && time(mine.updatedAt) <= time(row.updated_at)) {
          await deleteRecord(STORES.documents, versionRecordId(row.id));
          local.delete(row.id);
          applied += 1;
        }
        continue;
      }
      if (deletions[row.id] && time(deletions[row.id]) >= time(row.updated_at)) continue; // deleted here since: sent below
      if (mine && time(mine.updatedAt) >= time(row.updated_at)) continue;
      const data = mine?.data ?? await files(`authenticated/${path(row.id)}`, token);
      const version = {
        id: versionRecordId(row.id), versionId: row.id, name: String(row.name).slice(0, 120), type: safeDocType(row.type, row.name),
        size: data.byteLength, addedAt: toAppTime(row.added_at), check: row.cv_check ?? null, updatedAt: toAppTime(row.updated_at), data,
      };
      await putRecords(STORES.documents, [version]);
      local.set(row.id, version);
      applied += 1;
    }
  } finally {
    applying = false;
  }

  for (const version of local.values()) {
    const theirs = remote.get(version.versionId);
    if (theirs && time(theirs.updated_at) >= time(version.updatedAt)) continue;
    if (!theirs || theirs.deleted) await files(path(version.versionId), token, { method: 'POST', body: version.data, type: uploadType(version) });
    await upsert('cv_versions', [{
      user_id: user.id, id: version.versionId, name: version.name, type: version.type, size: version.size,
      added_at: version.addedAt, cv_check: version.check, deleted: false, updated_at: version.updatedAt,
    }], 'user_id,id', token);
    pushed += 1;
  }

  const sent = {};
  for (const [id, deletedAt] of Object.entries(deletions)) {
    sent[id] = deletedAt;
    if (local.has(id)) continue; // kept again since
    const theirs = remote.get(id);
    if (!theirs || theirs.deleted || time(theirs.updated_at) > time(deletedAt)) continue; // nothing to delete, or changed since
    await files(path(id), token, { method: 'DELETE' }).catch((error) => { if (error.status !== 404 && error.status !== 400) throw error; });
    await upsert('cv_versions', [{
      user_id: user.id, id, name: '', type: '', size: 0, added_at: null, cv_check: null, deleted: true, updated_at: deletedAt,
    }], 'user_id,id', token);
    pushed += 1;
  }
  versionDeletionsSent(sent);
  return { applied, pushed };
}

// ---- Cover letters (version 6) ----
// One row per letter in cover_letters, newest copy wins; deleted ones are kept as
// deleted = true. People have tens of letters, not thousands, so the list is fetched whole.

async function syncLetters(user, token) {
  const rows = await rest('cover_letters?select=id,data,updated_at,deleted', token);
  const remote = new Map(rows.map((row) => [row.id, row]));
  const local = new Map((await getAllRecords(STORES.letters)).map((letter) => [letter.id, normalizeLetter(letter)]));
  const deletions = pendingLetterDeletions();
  let applied = 0;

  applying = true;
  try {
    for (const row of rows) {
      const mine = local.get(row.id);
      if (row.deleted) {
        if (mine && time(mine.updatedAt) <= time(row.updated_at)) {
          await deleteRecord(STORES.letters, row.id);
          local.delete(row.id);
          applied += 1;
        }
        continue;
      }
      if (deletions[row.id] && time(deletions[row.id]) >= time(row.updated_at)) continue; // deleted here since: sent below
      if (mine && time(mine.updatedAt) >= time(row.updated_at)) continue;
      const letter = normalizeLetter({ ...row.data, id: row.id, updatedAt: toAppTime(row.updated_at) });
      await putRecords(STORES.letters, [letter]);
      local.set(row.id, letter);
      applied += 1;
    }
  } finally {
    applying = false;
  }

  const push = [];
  for (const letter of local.values()) {
    const theirs = remote.get(letter.id);
    if (theirs && time(theirs.updated_at) >= time(letter.updatedAt)) continue;
    push.push({ user_id: user.id, id: letter.id, data: letter, updated_at: letter.updatedAt, deleted: false });
  }
  const sent = {};
  for (const [id, deletedAt] of Object.entries(deletions)) {
    sent[id] = deletedAt;
    if (local.has(id)) continue; // written again since
    const theirs = remote.get(id);
    if (!theirs || theirs.deleted || time(theirs.updated_at) > time(deletedAt)) continue;
    push.push({ user_id: user.id, id, data: { id }, updated_at: deletedAt, deleted: true });
  }
  if (push.length) await upsert('cover_letters', push, 'user_id,id', token);
  letterDeletionsSent(sent);
  return { applied, pushed: push.length };
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
  const user = onlineUser();
  if (!user) return { state: 'off', lastSyncedAt: '', error: '' };
  return { ...status, lastSyncedAt: status.lastSyncedAt || loadState(user.id)?.lastSyncedAt || '' };
}

function setStatus(next) {
  status = { ...status, ...next };
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('applyful:sync-changed', { detail: syncStatus() }));
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
  return window.confirm(`Move the ${what} on this device into your account (${email})?\n\nThey’ll then be on every device you sign in on. Choose Cancel to sign out and keep them separate from this account.`);
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

// A small record in the app's own storage naming the accounts (and guests) synced on
// this device. If it's missing while this device remembers syncing, the storage was
// cleared or lost (the sign-in was kept): fetch everything again, not just what's new.
const SYNC_MARKER_ID = 'sync-marker';

// Changes made on this device belong to the session they were made in: never send them
// to another account (or to the same one after signing out and in again). And the next
// time an account syncs here, it's treated as new, so it asks before moving data in.
onSessionChange(({ from }) => {
  deletionsSent(pendingDeletions());
  unsentSent([...pendingUnsent()]);
  versionDeletionsSent(pendingVersionDeletions());
  letterDeletionsSent(pendingLetterDeletions());
  for (const kind of Object.keys(DOC_KINDS)) markDocumentDeleted(kind, '');
  if (from) forgetSyncState(from);
});

// A guest isn't deleted while a sync is still uploading to it (auth.js waits for this).
setSyncWaiter(() => running ?? Promise.resolve());

async function run({ confirmMove = askToMove } = {}) {
  const user = onlineUser();
  const token = user ? await accessToken() : null;
  if (!user || !token) {
    setStatus({ state: 'off', error: '' });
    return { skipped: true };
  }

  let state = loadState(user.id);
  const firstSync = !state;
  if (!state) {
    // First sync for this account on this device: ask before moving existing data in.
    const [apps, profileRecord] = await Promise.all([getAllRecords(STORES.applications), getRecord(STORES.profile, 'me')]);
    const hasProfile = Boolean(profileRecord) && !isProfileEmpty(normalizeProfile(profileRecord));
    if (!user.guest && (apps.length > 0 || hasProfile) && !(await confirmMove({ email: user.email, count: apps.length, hasProfile }))) {
      await signOut();
      setStatus({ state: 'off', error: '' });
      return { cancelled: true };
    }
    state = { lastPulledAt: EPOCH, lastPulledId: '', lastPushedAt: EPOCH, lastSyncedAt: '' };
  }
  const marker = await getRecord(STORES.documents, SYNC_MARKER_ID);
  const markedUsers = Array.isArray(marker?.users) ? marker.users : [];
  if (!firstSync && !markedUsers.includes(user.id)) state = { ...state, lastPulledAt: EPOCH, lastPulledId: '' };

  setStatus({ state: 'syncing', error: '' });
  const startedAt = new Date().toISOString();
  try {
    // 1. What changed in the account
    const remoteRows = await pullApplications(token, state.lastPulledAt, state.lastPulledId);
    const [remoteProfile] = await rest('profiles?select=data,updated_at', token);

    // 2. Apply it here
    const localApps = await getAllRecords(STORES.applications);
    const unsent = pendingUnsent();
    const plan = planSync({ localApps, remoteRows, deletions: pendingDeletions(), lastPushedAt: state.lastPushedAt, unsent });
    applying = true;
    try {
      if (plan.apply.length) await putRecords(STORES.applications, plan.apply);
      for (const id of plan.removeLocal) await deleteRecord(STORES.applications, id);
    } finally {
      applying = false;
    }
    let localProfile = await getRecord(STORES.profile, 'me');
    let profileStep = planProfile(localProfile, remoteProfile);
    const filled = (profile) => profile && !isProfileEmpty(normalizeProfile(profile));
    // First sync here: an empty profile on this device never wipes the account's.
    if (firstSync && !filled(localProfile) && filled(remoteProfile?.data)) profileStep = 'apply';
    if (firstSync && filled(localProfile) && filled(remoteProfile?.data)) {
      // First sign-in on a device with its own profile: combine the two rather than
      // letting one replace the other. The newer one's details come first; the other
      // only adds what's missing (jobs, education, skills and so on).
      const remoteNewer = time(remoteProfile.updated_at) > time(localProfile.updatedAt);
      const [base, extra] = remoteNewer ? [remoteProfile.data, localProfile] : [localProfile, remoteProfile.data];
      localProfile = { ...mergeIntoProfile(base, extra).profile, updatedAt: new Date().toISOString() };
      applying = true;
      try {
        await putRecords(STORES.profile, [localProfile]);
      } finally {
        applying = false;
      }
      profileStep = 'push';
    }
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
    unsentSent([...unsent]);
    if (profileStep === 'push') {
      await upsert('profiles', [{ user_id: user.id, data: normalizeProfile(localProfile), updated_at: localProfile.updatedAt }], 'user_id', token);
    }

    // 4. CV and LinkedIn files, the CV check, and earlier CVs
    const docs = await syncDocuments(user, token);
    const versions = await syncCvVersions(user, token);
    const letters = await syncLetters(user, token);
    docs.applied += versions.applied + letters.applied;
    docs.pushed += versions.pushed + letters.pushed;

    const newest = remoteRows[remoteRows.length - 1];
    state = {
      lastPulledAt: newest ? newest.synced_at : state.lastPulledAt,
      lastPulledId: newest ? newest.id : state.lastPulledId,
      lastPushedAt: startedAt,
      lastSyncedAt: new Date().toISOString(),
    };
    saveState(user.id, state);
    if (!markedUsers.includes(user.id)) {
      applying = true;
      try {
        await putRecords(STORES.documents, [{ id: SYNC_MARKER_ID, users: [...markedUsers, user.id].slice(-20) }]);
      } finally {
        applying = false;
      }
    }
    setStatus({ state: 'ok', lastSyncedAt: state.lastSyncedAt, error: '' });
    const changedHere = plan.apply.length + plan.removeLocal.length + (profileStep === 'apply' ? 1 : 0) + docs.applied;
    return { applied: changedHere, removed: plan.removeLocal.length, pushed: plan.push.length + (profileStep === 'push' ? 1 : 0) + docs.pushed };
  } catch (error) {
    if (!(error instanceof SyncError)) console.error(error);
    setStatus({ state: 'error', error: error instanceof SyncError ? error.message : syncMessage(500) });
    return { error: error.message };
  }
}

// ---- When to sync ----

let timer = 0;
function schedule(delay) {
  if (!onlineUser()) return;
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), delay);
}

/** True when this device has something worth keeping a copy of. */
export async function hasDataToKeep() {
  const [apps, profile, cv, linkedin, letters] = await Promise.all([
    getAllRecords(STORES.applications),
    getRecord(STORES.profile, 'me'),
    getRecord(STORES.documents, 'cv'),
    getRecord(STORES.documents, 'linkedin'),
    getAllRecords(STORES.letters),
  ]);
  return apps.length > 0 || (Boolean(profile) && !isProfileEmpty(normalizeProfile(profile))) || Boolean(cv || linkedin) || letters.length > 0;
}

/**
 * Without an account: starts the online copy if it's switched on, or asks about it
 * (once) when there's first something to keep. Nothing happens in a window that can't
 * keep data, or before there's anything to copy, so a visit alone never creates a guest.
 */
async function keepOnlineCopy(askOnlineCopy) {
  if (onlineUser() || storageMode() === 'memory') return;
  const choice = onlineCopyChoice();
  if (choice === 'off' || !(await hasDataToKeep())) return;
  if (choice === 'on') await startGuest();
  else askOnlineCopy();
}

/**
 * Starts syncing in the background. `onRemoteChanges` is called after a sync
 * brought changes from other devices, so the screen can redraw. `askOnlineCopy` shows
 * the question about keeping a copy online without an account.
 */
export function startSync({ onRemoteChanges = () => {}, askOnlineCopy = () => {} } = {}) {
  // Another tab synced: use its record of what's been synced.
  window.addEventListener('storage', (event) => {
    if (event.key?.startsWith('jt-sync-')) memory.delete(event.key);
  });
  const runAndReport = async () => {
    const result = await syncNow();
    if (result?.applied > 0) onRemoteChanges(result);
  };
  const syncOrStart = () => (onlineUser() ? runAndReport() : keepOnlineCopy(askOnlineCopy));
  window.addEventListener('applyful:data-changed', () => {
    if (applying) return;
    if (onlineUser()) schedule(CHANGE_DELAY_MS);
    else keepOnlineCopy(askOnlineCopy);
  });
  window.addEventListener('applyful:auth-changed', (event) => {
    if (event.detail.online) runAndReport();
    else {
      setStatus({ state: 'off', error: '' });
      keepOnlineCopy(askOnlineCopy); // signed out: back to this browser's own copy, if it's on
    }
  });
  window.addEventListener('online', () => {
    finishRemovingGuests();
    syncOrStart();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastRunAt > RESYNC_AFTER_MS) syncOrStart();
  });
  finishRemovingGuests();
  syncOrStart();
}
