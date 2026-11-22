// Data layer: the only file that reads or writes saved data.
//
// Everything is kept in IndexedDB, a database built into the browser, on this
// device only. It holds three collections:
//   applications  every job application
//   profile       your profile (one record, id 'me')
//   documents     your CV and LinkedIn files (ids 'cv' and 'linkedin')
// In version 2 this file can also talk to an online service, and the screens
// won't need to change, because they only use the functions exported here.

import { getPref, setPref } from './prefs.js';

const DB_NAME = 'job-tracker';
const DB_VERSION = 2; // 1 = applications only; 2 adds profile and documents

export const STORES = { applications: 'applications', profile: 'profile', documents: 'documents' };

let mode = 'none'; // 'indexeddb' | 'memory'
let dbPromise = null;
// Only used if the browser blocks IndexedDB (some private windows).
const memory = { applications: new Map(), profile: new Map(), documents: new Map() };

const copy = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      // Runs the first time, and whenever DB_VERSION goes up. Existing data is kept.
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.applications)) {
        const store = db.createObjectStore(STORES.applications, { keyPath: 'id' });
        store.createIndex('status', 'status');
        store.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains(STORES.profile)) db.createObjectStore(STORES.profile, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.documents)) db.createObjectStore(STORES.documents, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close(); // lets a newer version of the app upgrade the database
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    // Another tab still has the old version open. It closes itself (see above), then this carries on.
    request.onblocked = () => console.warn('Waiting for other tabs of this app to close the old database');
  });
}

/** Opens storage. Returns 'indexeddb', or 'memory' if the browser blocks saving. */
export async function init() {
  try {
    dbPromise = openDb();
    await dbPromise;
    mode = 'indexeddb';
  } catch (error) {
    console.warn('Saving is blocked, keeping data in memory only:', error);
    dbPromise = null;
    mode = 'memory';
  }
  return mode;
}

export function storageMode() {
  return mode;
}

async function run(storeName, txMode, work) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, txMode);
    const request = work(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(request ? request.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Saving was cancelled'));
  });
}

// ---- Telling the screens that data changed ----
// The computer layout keeps the applications list on screen next to the details,
// so it listens for this to stay up to date. (Sync will use it too.)

function notifyChange(storeName) {
  if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent('foliofy:data-changed', { detail: { store: storeName } }));
}

// ---- Generic record helpers ----

export async function getRecord(storeName, id) {
  if (mode === 'memory') return memory[storeName].has(id) ? copy(memory[storeName].get(id)) : null;
  return (await run(storeName, 'readonly', (store) => store.get(id))) ?? null;
}

export async function getAllRecords(storeName) {
  if (mode === 'memory') return [...memory[storeName].values()].map(copy);
  return run(storeName, 'readonly', (store) => store.getAll());
}

/** Writes records exactly as given. */
export async function putRecords(storeName, records) {
  if (records.length === 0) return;
  // An application saved again (undo, restore, or from another device) is no longer deleted.
  if (storeName === STORES.applications) forgetDeletions(records.map((record) => record.id));
  if (mode === 'memory') {
    for (const record of records) memory[storeName].set(record.id, copy(record));
  } else {
    await run(storeName, 'readwrite', (store) => {
      for (const record of records) store.put(record);
      return null;
    });
  }
  notifyChange(storeName);
}

export async function deleteRecord(storeName, id) {
  if (mode === 'memory') memory[storeName].delete(id);
  else await run(storeName, 'readwrite', (store) => store.delete(id));
  notifyChange(storeName);
}

export async function clearStore(storeName) {
  if (mode === 'memory') memory[storeName].clear();
  else await run(storeName, 'readwrite', (store) => store.clear());
  notifyChange(storeName);
}

// ---- Applications ----

export function listApplications() {
  return getAllRecords(STORES.applications);
}

export function getApplication(id) {
  return getRecord(STORES.applications, id);
}

/** Saves one application and stamps updatedAt. Returns the saved record. */
export async function saveApplication(app) {
  const record = { ...app, updatedAt: new Date().toISOString() };
  await putRecords(STORES.applications, [record]);
  return record;
}

/**
 * Writes applications exactly as given, keeping their timestamps (used by restore).
 * They may be older than the last sync, so they're marked to be sent regardless;
 * the account keeps whichever copy is newer.
 */
export async function putMany(records) {
  await putRecords(STORES.applications, records);
  markUnsent(records.map((record) => record.id));
}

export function deleteApplication(id) {
  rememberDeletions([id]);
  return deleteRecord(STORES.applications, id);
}

export async function clearAll() {
  rememberDeletions((await listApplications()).map((app) => app.id));
  return clearStore(STORES.applications);
}

// ---- Deletions, for sync ----
// Sync needs to tell your other devices about applications you deleted, so each
// deletion is remembered (id → when) until it has been sent. Kept to the latest 500.

const DELETIONS_KEY = 'jt-deleted';
let deletions = null;

function loadDeletions() {
  if (!deletions) {
    try {
      deletions = JSON.parse(getPref(DELETIONS_KEY, '{}')) || {};
    } catch {
      deletions = {};
    }
  }
  return deletions;
}

function saveDeletions() {
  const newest = Object.entries(deletions).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 500);
  deletions = Object.fromEntries(newest);
  setPref(DELETIONS_KEY, JSON.stringify(deletions));
}

function rememberDeletions(ids) {
  if (ids.length === 0) return;
  const at = new Date().toISOString();
  for (const id of ids) loadDeletions()[id] = at;
  saveDeletions();
}

function forgetDeletions(ids) {
  const list = loadDeletions();
  if (!ids.some((id) => id in list)) return;
  for (const id of ids) delete list[id];
  saveDeletions();
}

// Applications restored with their old timestamps, to be sent at the next sync.
const UNSENT_KEY = 'jt-unsent';
let unsent = null;

function loadUnsent() {
  if (!unsent) {
    try {
      unsent = new Set(JSON.parse(getPref(UNSENT_KEY, '[]')));
    } catch {
      unsent = new Set();
    }
  }
  return unsent;
}

function markUnsent(ids) {
  for (const id of ids) loadUnsent().add(id);
  setPref(UNSENT_KEY, JSON.stringify([...loadUnsent()].slice(-2000)));
}

/** Applications to send at the next sync even if they look older than it. */
export function pendingUnsent() {
  return new Set(loadUnsent());
}

export function unsentSent(ids) {
  for (const id of ids) loadUnsent().delete(id);
  setPref(UNSENT_KEY, JSON.stringify([...loadUnsent()]));
}

/** Another tab changed these lists: read them again next time. */
export function forgetCachedLists() {
  deletions = null;
  unsent = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === DELETIONS_KEY || event.key === UNSENT_KEY) forgetCachedLists();
  });
}

/** Deleted applications not yet sent to the account: { id: deletedAt }. */
export function pendingDeletions() {
  return { ...loadDeletions() };
}

/** Called by sync once these deletions have reached the account. */
export function deletionsSent(sent) {
  const list = loadDeletions();
  for (const [id, at] of Object.entries(sent)) if (list[id] === at) delete list[id];
  saveDeletions();
}

// ---- Keeping data safe ----

/** Asks the browser not to clear this app's data when the device runs low on space. */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function isPersisted() {
  try {
    return Boolean(await navigator.storage?.persisted?.());
  } catch {
    return false;
  }
}
