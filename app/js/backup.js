// Backup and restore: saves every application, your profile, your CV and LinkedIn
// files and your last CV check to a .json file, and loads one back. Restoring
// merges: new applications are added, and for ones you already have, whichever copy
// was changed most recently wins. The same goes for the profile and the files.
//
// Also decides when Home should remind you to back up (backupReminderDue).

import { listApplications, putMany, getRecord, putRecords, STORES } from './store.js';
import { SCHEMA_VERSION, normalize } from './model.js';
import { getProfile, saveProfile, normalizeProfile, isProfileEmpty, DOC_KINDS, MAX_DOC_BYTES, CV_CHECK_ID } from './profile.js';
import { getPref, setPref } from './prefs.js';
import { todayISO } from './ui.js';
import { APP_NAME } from './config.js';

const APP_ID = 'job-tracker';
const MAX_BACKUP_BYTES = 40 * 1024 * 1024; // two 10 MB files grow by a third as text, plus the rest
const LAST_BACKUP_KEY = 'jt-last-backup';
const SNOOZED_UNTIL_KEY = 'jt-backup-reminder-snoozed';

// ---- Files as text (a backup is a .json file) ----

export function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

const isTimestamp = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));

/** A file from a backup, checked and turned back into a saved document, or null. */
function documentFromBackup(item) {
  if (!item || !Object.prototype.hasOwnProperty.call(DOC_KINDS, item.id) || typeof item.data !== 'string') return null;
  if (!isTimestamp(item.uploadedAt)) return null;
  let data;
  try {
    data = fromBase64(item.data);
  } catch {
    return null;
  }
  if (data.byteLength === 0 || data.byteLength > MAX_DOC_BYTES) return null;
  return {
    id: item.id,
    name: String(item.name || DOC_KINDS[item.id].label).slice(0, 120),
    type: typeof item.type === 'string' ? item.type.slice(0, 120) : 'application/octet-stream',
    size: data.byteLength,
    uploadedAt: item.uploadedAt,
    data,
  };
}

/** Everything a backup file holds. */
export async function buildBackup() {
  const [applications, profile, ...saved] = await Promise.all([
    listApplications(),
    getProfile(),
    ...Object.keys(DOC_KINDS).map((kind) => getRecord(STORES.documents, kind)),
  ]);
  const files = saved.filter(Boolean);
  const cv = files.find((doc) => doc.id === 'cv');
  const cvCheck = cv ? await getRecord(STORES.documents, CV_CHECK_ID) : null;
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    applications,
    profile: isProfileEmpty(profile) ? undefined : profile,
    documents: files.length ? files.map(({ data, ...doc }) => ({ ...doc, data: toBase64(data) })) : undefined,
    cvCheck: cvCheck && cvCheck.cvUploadedAt === cv.uploadedAt ? cvCheck : undefined,
  };
}

export async function exportBackup() {
  const payload = await buildBackup();
  const { applications } = payload;
  const filename = `job-tracker-backup-${todayISO()}.json`;
  const file = new File([JSON.stringify(payload, null, 2)], filename, { type: 'application/json' });

  // On phones, the share sheet makes it easy to save to Files, Google Drive or iCloud.
  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
  if (isTouchDevice && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${APP_NAME} backup` });
      markBackedUp();
      return { count: applications.length, saved: true };
    } catch (error) {
      if (error.name === 'AbortError') return { count: applications.length, saved: false };
      // Sharing failed for another reason: fall back to a normal download below.
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  markBackedUp();
  return { count: applications.length, saved: true };
}

export async function importBackup(file) {
  const notABackup = new Error(`That file isn’t a ${APP_NAME} backup.`);
  if (file.size > MAX_BACKUP_BYTES) throw notABackup;

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw notABackup;
  }

  const items = Array.isArray(data) ? data : data?.applications;
  if (!Array.isArray(items)) throw notABackup;
  if (Number(data?.schemaVersion) > SCHEMA_VERSION) {
    throw new Error('This backup is from a newer version of the app. Update the app, then try again.');
  }

  const existing = new Map((await listApplications()).map((app) => [app.id, app]));
  const result = { added: 0, updated: 0, unchanged: 0, skipped: 0, profileRestored: false, filesRestored: 0 };

  // Profile: restore it if this device has none, or the backup's copy is newer.
  if (!Array.isArray(data) && data?.profile && typeof data.profile === 'object') {
    const incoming = normalizeProfile(data.profile);
    const current = await getProfile();
    if (!isProfileEmpty(incoming) && (isProfileEmpty(current) || incoming.updatedAt > current.updatedAt)) {
      await saveProfile(incoming);
      result.profileRestored = true;
    }
  }

  // CV and LinkedIn files: restore each one this device doesn't have, or has an older copy of.
  if (!Array.isArray(data) && Array.isArray(data?.documents)) {
    for (const item of data.documents) {
      const incoming = documentFromBackup(item);
      if (!incoming) continue;
      const current = await getRecord(STORES.documents, incoming.id);
      if (current && current.uploadedAt >= incoming.uploadedAt) continue;
      await putRecords(STORES.documents, [incoming]);
      result.filesRestored += 1;
      // The CV check result belongs to that exact CV.
      const check = data.cvCheck;
      if (incoming.id === 'cv' && check && check.cvUploadedAt === incoming.uploadedAt && Number.isFinite(check.score)) {
        await putRecords(STORES.documents, [{
          id: CV_CHECK_ID,
          cvUploadedAt: check.cvUploadedAt,
          checkedAt: isTimestamp(check.checkedAt) ? check.checkedAt : new Date().toISOString(),
          score: Math.max(0, Math.min(100, Math.round(check.score))),
          label: String(check.label ?? '').slice(0, 40),
          toFix: Math.max(0, Math.round(Number(check.toFix) || 0)),
          ignored: Array.isArray(check.ignored) ? check.ignored.filter((id) => typeof id === 'string').slice(0, 50) : [],
        }]);
      }
    }
  }
  const toSave = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      result.skipped += 1;
      continue;
    }
    const app = normalize(item);
    if (!app.company || !app.title) {
      result.skipped += 1;
      continue;
    }
    const current = existing.get(app.id);
    if (!current) {
      result.added += 1;
      toSave.push(app);
    } else if (app.updatedAt > current.updatedAt) {
      result.updated += 1;
      toSave.push(app);
    } else {
      result.unchanged += 1;
    }
  }

  await putMany(toSave);
  return result;
}

// ---- Reminding you to back up ----
// Until accounts and automatic backup arrive (version 4), everything lives on one
// device. Home reminds you when there's something worth backing up:
//   - never backed up: once you have 3 applications, or one that's a week old,
//   - backed up before: 14 days later, if anything has changed since.
// "Later" hides the reminder for a week.

const DAY_MS = 24 * 60 * 60 * 1000;
export const REMIND_AFTER_DAYS = 14;
export const SNOOZE_DAYS = 7;

export function backupReminderDue(apps, { lastBackupAt = '', snoozedUntil = '', now = new Date() } = {}) {
  if (apps.length === 0) return false;
  if (snoozedUntil && now < new Date(snoozedUntil)) return false;
  if (!lastBackupAt) {
    const oldest = Math.min(...apps.map((app) => Date.parse(app.createdAt)));
    return apps.length >= 3 || now - oldest >= 7 * DAY_MS;
  }
  const changedSince = apps.some((app) => app.updatedAt > lastBackupAt);
  return changedSince && now - Date.parse(lastBackupAt) >= REMIND_AFTER_DAYS * DAY_MS;
}

export function lastBackupAt() {
  return getPref(LAST_BACKUP_KEY, '');
}

export function backupReminderSettings() {
  return { lastBackupAt: lastBackupAt(), snoozedUntil: getPref(SNOOZED_UNTIL_KEY, '') };
}

export function snoozeBackupReminder(now = new Date()) {
  setPref(SNOOZED_UNTIL_KEY, new Date(now.getTime() + SNOOZE_DAYS * DAY_MS).toISOString());
}

function markBackedUp() {
  setPref(LAST_BACKUP_KEY, new Date().toISOString());
  setPref(SNOOZED_UNTIL_KEY, '');
}
