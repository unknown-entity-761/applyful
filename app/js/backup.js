// Backup and restore: saves every application and your profile to a .json file,
// and loads one back. Restoring merges: new applications are added, and for ones
// you already have, whichever copy was changed most recently wins. The same goes
// for the profile. CV and LinkedIn files aren't included.

import { listApplications, putMany } from './store.js';
import { SCHEMA_VERSION, normalize } from './model.js';
import { getProfile, saveProfile, normalizeProfile, isProfileEmpty } from './profile.js';
import { todayISO } from './ui.js';
import { APP_NAME } from './config.js';

const APP_ID = 'job-tracker';
const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

export async function exportBackup() {
  const [applications, profile] = await Promise.all([listApplications(), getProfile()]);
  const payload = {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    applications,
    profile: isProfileEmpty(profile) ? undefined : profile,
  };
  const filename = `job-tracker-backup-${todayISO()}.json`;
  const file = new File([JSON.stringify(payload, null, 2)], filename, { type: 'application/json' });

  // On phones, the share sheet makes it easy to save to Files, Google Drive or iCloud.
  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
  if (isTouchDevice && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${APP_NAME} backup` });
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
  const result = { added: 0, updated: 0, unchanged: 0, skipped: 0, profileRestored: false };

  // Profile: restore it if this device has none, or the backup's copy is newer.
  if (!Array.isArray(data) && data?.profile && typeof data.profile === 'object') {
    const incoming = normalizeProfile(data.profile);
    const current = await getProfile();
    if (!isProfileEmpty(incoming) && (isProfileEmpty(current) || incoming.updatedAt > current.updatedAt)) {
      await saveProfile(incoming);
      result.profileRestored = true;
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
