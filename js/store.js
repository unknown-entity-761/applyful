// Data layer: the only file that reads or writes saved data.
//
// Everything is kept in IndexedDB, a database built into the browser, on this
// device only. It holds three collections:
//   applications  every job application
//   profile       your profile (one record, id 'me')
//   documents     your CV and LinkedIn files (ids 'cv' and 'linkedin')
// In version 2 this file can also talk to an online service, and the screens
// won't need to change, because they only use the functions exported here.

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
  if (mode === 'memory') {
    for (const record of records) memory[storeName].set(record.id, copy(record));
    return;
  }
  await run(storeName, 'readwrite', (store) => {
    for (const record of records) store.put(record);
    return null;
  });
}

export async function deleteRecord(storeName, id) {
  if (mode === 'memory') memory[storeName].delete(id);
  else await run(storeName, 'readwrite', (store) => store.delete(id));
}

export async function clearStore(storeName) {
  if (mode === 'memory') memory[storeName].clear();
  else await run(storeName, 'readwrite', (store) => store.clear());
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

/** Writes applications exactly as given, keeping their timestamps (used by restore and undo). */
export function putMany(records) {
  return putRecords(STORES.applications, records);
}

export function deleteApplication(id) {
  return deleteRecord(STORES.applications, id);
}

export function clearAll() {
  return clearStore(STORES.applications);
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
