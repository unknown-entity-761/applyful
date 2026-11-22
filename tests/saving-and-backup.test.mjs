// Saving applications and the profile, and backing up and restoring them.
//
// Node has no IndexedDB, so the store runs in its in-memory mode here (the same
// mode browsers fall back to when they block saving). The rules being tested,
// such as timestamps, copies and how a restore merges, are the same in both modes.

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../app/js/store.js';
import { buildBackup, importBackup, backupReminderDue } from '../app/js/backup.js';
import { normalize, SCHEMA_VERSION } from '../app/js/model.js';
import { getProfile, saveProfile, deleteProfileAndDocuments, saveDocumentFile, getDocument, saveCvCheck, getCvCheck, needsSetup, listCvVersions } from '../app/js/profile.js';

const application = (fields) => normalize({ company: 'Acme', title: 'Analyst', ...fields });
const backupFile = (data) => new File([typeof data === 'string' ? data : JSON.stringify(data)], 'backup.json', { type: 'application/json' });

before(async () => {
  const warn = console.warn;
  console.warn = () => {}; // init() warns that saving falls back to memory
  assert.equal(await store.init(), 'memory');
  console.warn = warn;
});

beforeEach(async () => {
  await store.clearAll();
  await deleteProfileAndDocuments();
});

test('saving stamps the time, and loading gives a copy', async () => {
  const saved = await store.saveApplication(application({ id: 'a1', updatedAt: '2020-01-01T00:00:00.000Z' }));
  assert.ok(saved.updatedAt > '2020-01-01T00:00:00.000Z', 'updatedAt is set on save');

  const loaded = await store.getApplication('a1');
  loaded.company = 'Changed without saving';
  assert.equal((await store.getApplication('a1')).company, 'Acme');

  await store.deleteApplication('a1');
  assert.equal(await store.getApplication('a1'), null);
});

test('restore and undo keep the original timestamps', async () => {
  await store.putMany([application({ id: 'a1', updatedAt: '2024-05-01T10:00:00.000Z' })]);
  assert.equal((await store.getApplication('a1')).updatedAt, '2024-05-01T10:00:00.000Z');
});

test('a backup restores into an empty device', async () => {
  await store.putMany([application({ id: 'a1' }), application({ id: 'a2', company: 'Globex' })]);
  await saveProfile({ firstName: 'Alex', skills: ['SQL'] });
  const backup = await buildBackup();
  assert.equal(backup.schemaVersion, SCHEMA_VERSION);

  await store.clearAll();
  await deleteProfileAndDocuments();
  const result = await importBackup(backupFile(backup));

  assert.deepEqual(result, { added: 2, updated: 0, unchanged: 0, skipped: 0, profileRestored: true, filesRestored: 0 });
  assert.deepEqual((await store.listApplications()).map((app) => app.company).sort(), ['Acme', 'Globex']);
  assert.equal((await getProfile()).firstName, 'Alex');
});

test('restoring merges: the most recently changed copy wins', async () => {
  await store.putMany([
    application({ id: 'old-here', title: 'Here, older', updatedAt: '2024-01-01T00:00:00.000Z' }),
    application({ id: 'new-here', title: 'Here, newer', updatedAt: '2024-09-01T00:00:00.000Z' }),
  ]);
  const result = await importBackup(backupFile({
    app: 'job-tracker',
    schemaVersion: SCHEMA_VERSION,
    applications: [
      application({ id: 'old-here', title: 'Backup, newer', updatedAt: '2024-06-01T00:00:00.000Z' }),
      application({ id: 'new-here', title: 'Backup, older', updatedAt: '2024-06-01T00:00:00.000Z' }),
      { company: '', title: 'No company' },
      'not an application',
    ],
  }));

  assert.deepEqual(result, { added: 0, updated: 1, unchanged: 1, skipped: 2, profileRestored: false, filesRestored: 0 });
  assert.equal((await store.getApplication('old-here')).title, 'Backup, newer');
  assert.equal((await store.getApplication('new-here')).title, 'Here, newer');
});

test('a newer profile on the device is not replaced by an older backup', async () => {
  await saveProfile({ firstName: 'Current' });
  await importBackup(backupFile({ applications: [], profile: { firstName: 'Old', updatedAt: '2020-01-01T00:00:00.000Z' } }));
  assert.equal((await getProfile()).firstName, 'Current');
});

test('backups from the first version (a plain list) still restore', async () => {
  const result = await importBackup(backupFile([application({ id: 'v1' })]));
  assert.equal(result.added, 1);
});

test('files that are not backups are refused with a clear message', async () => {
  await assert.rejects(importBackup(backupFile('this is not json')), /isn’t an Applyful backup/);
  await assert.rejects(importBackup(backupFile({ hello: 'world' })), /isn’t an Applyful backup/);
  await assert.rejects(
    importBackup(backupFile({ schemaVersion: SCHEMA_VERSION + 1, applications: [] })),
    /newer version of the app/,
  );
  assert.equal((await store.listApplications()).length, 0, 'nothing was saved');
});

test('backups carry the CV, the LinkedIn PDF and the last CV check', async () => {
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 1, 2, 250, 251, 252, 253, 254, 255]);
  await saveDocumentFile('cv', new File([pdfBytes], 'my-cv.pdf', { type: 'application/pdf' }));
  await saveDocumentFile('linkedin', new File([new Uint8Array([1, 2, 3])], 'Profile.pdf', { type: 'application/pdf' }));
  const cv = await getDocument('cv');
  await saveCvCheck(cv, { score: 84, label: 'Good', toFix: 2, ignored: new Set(['cliches']) });
  const backup = JSON.parse(JSON.stringify(await buildBackup()));
  assert.equal(backup.documents.length, 2);
  assert.equal(backup.cvCheck.score, 84);

  await deleteProfileAndDocuments();
  const result = await importBackup(backupFile(backup));
  assert.equal(result.filesRestored, 2);
  const restored = await getDocument('cv');
  assert.equal(restored.name, 'my-cv.pdf');
  assert.deepEqual([...new Uint8Array(restored.data)], [...pdfBytes], 'the file comes back byte for byte');
  assert.deepEqual((await getCvCheck(restored)).ignored, ['cliches']);

  const again = await importBackup(backupFile(backup));
  assert.equal(again.filesRestored, 0, 'the same files are not restored twice');
});

test('backups carry the CV history, and which CV each application was sent with', async () => {
  await saveDocumentFile('cv', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 1])], 'first.pdf', { type: 'application/pdf' }));
  await saveCvCheck(await getDocument('cv'), { score: 55, label: 'Fair', toFix: 6, ignored: new Set() });
  const firstId = (await getDocument('cv')).versionId;
  await store.putMany([application({ id: 'sent', cvVersionId: firstId })]);
  await saveDocumentFile('cv', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 2])], 'second.pdf', { type: 'application/pdf' }));
  const backup = JSON.parse(JSON.stringify(await buildBackup()));
  assert.equal(backup.cvVersions.length, 1);

  await store.clearAll();
  await deleteProfileAndDocuments();
  const result = await importBackup(backupFile(backup));
  assert.equal(result.filesRestored, 2, 'the current CV and the earlier one');
  const [earlier] = await listCvVersions();
  assert.equal(earlier.name, 'first.pdf');
  assert.equal(earlier.versionId, firstId);
  assert.equal(earlier.check.score, 55);
  assert.equal((await store.getApplication('sent')).cvVersionId, firstId, 'the application still points at the CV it was sent with');
  assert.equal((await getDocument('cv')).name, 'second.pdf');
});

test('a damaged file in a backup is skipped, and the rest still restores', async () => {
  const result = await importBackup(backupFile({
    applications: [application({ id: 'ok' })],
    documents: [{ id: 'cv', data: '%%% not base64 %%%', uploadedAt: '2026-01-01T00:00:00.000Z' }, { id: 'passport', data: 'AAAA', uploadedAt: '2026-01-01T00:00:00.000Z' }],
  }));
  assert.equal(result.filesRestored, 0);
  assert.equal(result.added, 1);
  assert.equal(await getDocument('cv'), null);
});

test('the backup reminder comes when there is something worth backing up', () => {
  const now = new Date('2026-11-22T10:00:00Z');
  const made = (createdAt, updatedAt = createdAt) => ({ createdAt, updatedAt });
  const fresh = [made('2026-11-21T10:00:00Z')];
  const three = [made('2026-11-21T10:00:00Z'), made('2026-11-21T11:00:00Z'), made('2026-11-21T12:00:00Z')];

  assert.equal(backupReminderDue([], { now }), false, 'nothing to back up');
  assert.equal(backupReminderDue(fresh, { now }), false, 'one new application is not enough yet');
  assert.equal(backupReminderDue(three, { now }), true, 'three applications and never backed up');
  assert.equal(backupReminderDue([made('2026-11-14T09:00:00Z')], { now }), true, 'an application a week old');
  assert.equal(backupReminderDue(three, { now, snoozedUntil: '2026-11-25T00:00:00Z' }), false, 'Later hides it');

  const backedUp = '2026-11-01T00:00:00Z';
  assert.equal(backupReminderDue([made('2026-10-01T00:00:00Z')], { now, lastBackupAt: backedUp }), false, 'nothing changed since');
  assert.equal(backupReminderDue([made('2026-10-01T00:00:00Z', '2026-11-05T00:00:00Z')], { now, lastBackupAt: backedUp }), true, 'changed, 3 weeks later');
  assert.equal(backupReminderDue([made('2026-10-01T00:00:00Z', '2026-11-20T00:00:00Z')], { now, lastBackupAt: '2026-11-15T00:00:00Z' }), false, 'changed, but backed up a week ago');
});

test('first-time setup shows only when nothing is saved yet', async () => {
  assert.equal(await needsSetup(0), true, 'a new device');
  assert.equal(await needsSetup(1), false, 'someone with applications already');
  await saveProfile({ firstName: 'Alex' });
  assert.equal(await needsSetup(0), false, 'someone with a profile already');
});
