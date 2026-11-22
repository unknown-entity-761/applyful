// Saving applications and the profile, and backing up and restoring them.
//
// Node has no IndexedDB, so the store runs in its in-memory mode here (the same
// mode browsers fall back to when they block saving). The rules being tested,
// such as timestamps, copies and how a restore merges, are the same in both modes.

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../app/js/store.js';
import { buildBackup, importBackup } from '../app/js/backup.js';
import { normalize, SCHEMA_VERSION } from '../app/js/model.js';
import { getProfile, saveProfile, deleteProfileAndDocuments } from '../app/js/profile.js';

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

  assert.deepEqual(result, { added: 2, updated: 0, unchanged: 0, skipped: 0, profileRestored: true });
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

  assert.deepEqual(result, { added: 0, updated: 1, unchanged: 1, skipped: 2, profileRestored: false });
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
  await assert.rejects(importBackup(backupFile('this is not json')), /isn’t a Foliofy backup/);
  await assert.rejects(importBackup(backupFile({ hello: 'world' })), /isn’t a Foliofy backup/);
  await assert.rejects(
    importBackup(backupFile({ schemaVersion: SCHEMA_VERSION + 1, applications: [] })),
    /newer version of the app/,
  );
  assert.equal((await store.listApplications()).length, 0, 'nothing was saved');
});
