// Sync: the newest copy wins, deletions reach every device, and the first sync on a
// device with data asks first. Supabase is replaced by a small stand-in server.

import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../app/js/store.js';
import { STORES } from '../app/js/store.js';
import { normalize } from '../app/js/model.js';
import { saveProfile, getProfile, deleteProfileAndDocuments, saveDocumentFile, getDocument, removeDocument, saveCvCheck, getCvCheck, listCvVersions, makeCvCurrent, deleteCvVersion, MAX_CV_VERSIONS } from '../app/js/profile.js';
import { logIn, signOut, currentUser } from '../app/js/auth.js';
import { planSync, planProfile, syncNow, forgetSyncState } from '../app/js/sync.js';

const app = (id, updatedAt, fields = {}) => normalize({ id, company: `Company ${id}`, title: 'Analyst', createdAt: updatedAt, updatedAt, ...fields });
const pg = (iso) => new Date(Date.parse(iso)).toISOString().replace('Z', '+00:00'); // how Postgres writes times

// ---- The rules ----

test('the newer copy wins, in either direction', () => {
  const plan = planSync({
    localApps: [app('a', '2026-11-20T10:00:00Z'), app('b', '2026-11-22T10:00:00Z')],
    remoteRows: [
      { id: 'a', data: app('a', '2026-11-21T10:00:00Z', { title: 'From the other device' }), updated_at: pg('2026-11-21T10:00:00Z'), deleted: false },
      { id: 'b', data: app('b', '2026-11-21T10:00:00Z'), updated_at: pg('2026-11-21T10:00:00Z'), deleted: false },
      { id: 'c', data: app('c', '2026-11-19T10:00:00Z'), updated_at: pg('2026-11-19T10:00:00Z'), deleted: false },
    ],
  });
  assert.deepEqual(plan.apply.map((a) => [a.id, a.title]), [['a', 'From the other device'], ['c', 'Analyst']]);
  assert.equal(plan.apply[0].updatedAt, '2026-11-21T10:00:00.000Z', 'kept in the app’s own time format');
  assert.deepEqual(plan.push.map((r) => r.id), ['b']);
});

test('the same moment written two ways is not a change', () => {
  const plan = planSync({
    localApps: [app('a', '2026-11-21T10:00:00.123Z')],
    remoteRows: [{ id: 'a', data: app('a', '2026-11-21T10:00:00.123Z'), updated_at: '2026-11-21T10:00:00.123+00:00', deleted: false }],
  });
  assert.deepEqual([plan.apply.length, plan.push.length], [0, 0]);
});

test('only changes since the last sync are sent', () => {
  const plan = planSync({
    localApps: [app('old', '2026-11-01T00:00:00Z'), app('new', '2026-11-22T00:00:00Z')],
    remoteRows: [],
    lastPushedAt: '2026-11-15T00:00:00Z',
  });
  assert.deepEqual(plan.push.map((r) => r.id), ['new']);
});

test('deletions travel both ways, unless the other side changed it afterwards', () => {
  const deletedThere = planSync({
    localApps: [app('a', '2026-11-20T00:00:00Z')],
    remoteRows: [{ id: 'a', data: { id: 'a' }, updated_at: pg('2026-11-21T00:00:00Z'), deleted: true }],
  });
  assert.deepEqual(deletedThere.removeLocal, ['a']);

  const editedHereLater = planSync({
    localApps: [app('a', '2026-11-22T00:00:00Z')],
    remoteRows: [{ id: 'a', data: { id: 'a' }, updated_at: pg('2026-11-21T00:00:00Z'), deleted: true }],
  });
  assert.deepEqual(editedHereLater.removeLocal, []);
  assert.deepEqual(editedHereLater.push.map((r) => [r.id, r.deleted]), [['a', false]]);

  const deletedHere = planSync({ localApps: [], remoteRows: [], deletions: { gone: '2026-11-22T00:00:00.000Z' } });
  assert.deepEqual(deletedHere.push, [{ id: 'gone', data: { id: 'gone' }, updated_at: '2026-11-22T00:00:00.000Z', deleted: true }]);
  assert.deepEqual(deletedHere.sentDeletions, { gone: '2026-11-22T00:00:00.000Z' });

  const editedThereLater = planSync({
    localApps: [],
    remoteRows: [{ id: 'x', data: app('x', '2026-11-23T00:00:00Z'), updated_at: pg('2026-11-23T00:00:00Z'), deleted: false }],
    deletions: { x: '2026-11-22T00:00:00.000Z' },
  });
  assert.deepEqual(editedThereLater.apply.map((a) => a.id), ['x'], 'the later edit wins over the earlier deletion');
  assert.deepEqual(editedThereLater.push, []);
});

test('profile: newest wins, and an unsaved profile is never sent', () => {
  assert.equal(planProfile({ updatedAt: '2026-11-22T00:00:00Z' }, { updated_at: pg('2026-11-21T00:00:00Z') }), 'push');
  assert.equal(planProfile({ updatedAt: '2026-11-20T00:00:00Z' }, { updated_at: pg('2026-11-21T00:00:00Z') }), 'apply');
  assert.equal(planProfile(null, { updated_at: pg('2026-11-21T00:00:00Z') }), 'apply');
  assert.equal(planProfile({ updatedAt: '' }, undefined), 'none');
});

// ---- Two devices and a stand-in server ----

const server = { rows: new Map(), profiles: new Map(), documents: new Map(), versions: new Map(), letters: new Map(), files: new Map(), clock: Date.parse('2026-11-22T00:00:00Z'), denied: false };
const toPg = (v) => (v ? new Date(Date.parse(v)).toISOString().replace('Z', '+00:00') : v);
const realFetch = globalThis.fetch;

function json(status, body) {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function fakeSupabase(url, options = {}) {
  const { pathname, searchParams } = new URL(url);
  const method = options.method ?? 'GET';
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : undefined; // files arrive as bytes
  const userId = 'user-1';
  if (pathname === '/auth/v1/token') return json(200, { access_token: 'token', refresh_token: 'refresh', expires_in: 3600, user: { id: userId, email: 'alex@example.com' } });
  if (pathname === '/auth/v1/logout') return json(204, null);
  if (pathname === '/rest/v1/consents') return json(201, null);
  if (server.denied) return json(401, { code: '42501', message: 'permission denied for table applications' });
  const stamp = () => {
    server.clock += 1000;
    return new Date(server.clock).toISOString().replace('Z', '+00:00');
  };
  if (pathname === '/rest/v1/applications' && method === 'GET') {
    let after = (searchParams.get('synced_at') ?? '').replace(/^gt\./, '');
    let afterId = '';
    const or = searchParams.get('or');
    if (or) [, after, , afterId] = or.match(/synced_at\.gt\.([^,]+),and\(synced_at\.eq\.([^,]+),id\.gt\.([^)]+)\)/);
    const rows = [...server.rows.values()]
      .filter((r) => Date.parse(r.synced_at) > Date.parse(after) || (afterId && Date.parse(r.synced_at) === Date.parse(after) && r.id > afterId))
      .sort((a, b) => Date.parse(a.synced_at) - Date.parse(b.synced_at) || a.id.localeCompare(b.id));
    return json(200, rows.map(({ id, data, updated_at, deleted, synced_at }) => ({ id, data, updated_at, deleted, synced_at })));
  }
  if (pathname === '/rest/v1/applications' && method === 'POST') {
    const syncedAt = stamp();
    for (const row of body) server.rows.set(row.id, { ...row, updated_at: new Date(Date.parse(row.updated_at)).toISOString().replace('Z', '+00:00'), synced_at: syncedAt });
    return json(201, null);
  }
  if (pathname === '/rest/v1/documents' && method === 'GET') return json(200, [...server.documents.values()]);
  if (pathname === '/rest/v1/documents' && method === 'POST') {
    for (const row of body) server.documents.set(row.kind, { ...row, uploaded_at: toPg(row.uploaded_at), updated_at: toPg(row.updated_at) });
    return json(201, null);
  }
  if (pathname === '/rest/v1/cover_letters' && method === 'GET') return json(200, [...server.letters.values()]);
  if (pathname === '/rest/v1/cover_letters' && method === 'POST') {
    for (const row of body) server.letters.set(row.id, { ...row, updated_at: toPg(row.updated_at) });
    return json(201, null);
  }
  if (pathname === '/rest/v1/cv_versions' && method === 'GET') return json(200, [...server.versions.values()]);
  if (pathname === '/rest/v1/cv_versions' && method === 'POST') {
    for (const row of body) server.versions.set(row.id, { ...row, added_at: toPg(row.added_at), updated_at: toPg(row.updated_at) });
    return json(201, null);
  }
  const file = pathname.match(/^\/storage\/v1\/object\/(?:authenticated\/)?documents\/user-1\/(cv|linkedin|cv-versions\/[^/]+)$/);
  if (file && method === 'POST') {
    server.files.set(file[1], new Uint8Array(await new Response(options.body).arrayBuffer()));
    return json(200, { Key: `documents/user-1/${file[1]}` });
  }
  if (file && method === 'GET') return server.files.has(file[1]) ? new Response(server.files.get(file[1])) : json(404, { statusCode: '404', message: 'Object not found' });
  if (file && method === 'DELETE') {
    server.files.delete(file[1]);
    return json(200, []);
  }
  if (pathname === '/rest/v1/profiles' && method === 'GET') return json(200, [...server.profiles.values()]);
  if (pathname === '/rest/v1/profiles' && method === 'POST') {
    const [row] = body;
    server.profiles.set(row.user_id, { data: row.data, updated_at: row.updated_at.replace('Z', '+00:00') });
    return json(201, null);
  }
  return json(404, { message: `stand-in server has no ${method} ${pathname}` });
}

async function newDevice() {
  // Same account, empty device: nothing saved locally and no sync history.
  await store.clearStore(STORES.applications);
  await store.clearStore(STORES.profile);
  await store.clearStore(STORES.documents);
  await store.clearStore(STORES.letters);
  store.deletionsSent(store.pendingDeletions());
  forgetSyncState('user-1');
}

before(async () => {
  const warn = console.warn;
  console.warn = () => {};
  await store.init();
  console.warn = warn;
  globalThis.fetch = fakeSupabase;
});

beforeEach(async () => {
  server.rows.clear();
  server.profiles.clear();
  server.documents.clear();
  server.versions.clear();
  server.letters.clear();
  server.files.clear();
  server.denied = false;
  await newDevice();
  await signOut();
});

after(() => {
  globalThis.fetch = realFetch;
});

test('signed out, nothing syncs', async () => {
  assert.deepEqual(await syncNow(), { skipped: true });
});

test('first sign-in on a device with data asks first; Cancel signs out and sends nothing', async () => {
  await store.putMany([app('a', '2026-11-20T00:00:00Z')]);
  await logIn('alex@example.com', 'pw');
  const asked = [];
  const result = await syncNow({ confirmMove: (info) => { asked.push(info); return false; } });
  assert.deepEqual(result, { cancelled: true });
  assert.deepEqual(asked, [{ email: 'alex@example.com', count: 1, hasProfile: false }]);
  assert.equal(currentUser(), null);
  assert.equal(server.rows.size, 0);
});

test('a phone and a laptop stay in step: edits, deletions and the profile', async () => {
  // The phone: two applications and a profile, then signs in and agrees to move them.
  await store.putMany([app('a', '2026-11-20T00:00:00Z'), app('b', '2026-11-20T00:00:00Z')]);
  await saveProfile({ firstName: 'Alex' });
  const phoneSnapshot = await store.listApplications();
  await logIn('alex@example.com', 'pw');
  assert.deepEqual(await syncNow({ confirmMove: () => true }), { applied: 0, removed: 0, pushed: 3 });
  assert.equal(server.rows.size, 2);

  // The laptop: signs in on an empty device and gets everything.
  await newDevice();
  let result = await syncNow({ confirmMove: () => assert.fail('nothing to move on an empty device') });
  assert.equal(result.applied, 3);
  assert.deepEqual((await store.listApplications()).map((a) => a.id).sort(), ['a', 'b']);
  assert.equal((await getProfile()).firstName, 'Alex');

  // On the laptop: edit one, delete the other.
  const a = await store.getApplication('a');
  await store.saveApplication({ ...a, title: 'Senior Analyst' });
  await store.deleteApplication('b');
  result = await syncNow();
  assert.equal(result.pushed, 2);
  assert.equal(server.rows.get('b').deleted, true);
  assert.deepEqual(store.pendingDeletions(), {}, 'the deletion was sent');

  // Back on the phone, which still has the old copies: it picks up both changes.
  await newDevice();
  await store.putMany(phoneSnapshot);
  result = await syncNow({ confirmMove: () => true });
  assert.equal((await store.getApplication('a')).title, 'Senior Analyst');
  assert.equal(await store.getApplication('b'), null, 'deleted on the laptop, so deleted here');
  assert.equal(server.rows.get('a').data.title, 'Senior Analyst', 'the old copy did not overwrite the newer one');

  // Deleting the profile on one device clears it everywhere.
  await deleteProfileAndDocuments();
  await syncNow();
  await newDevice();
  await syncNow();
  assert.equal((await getProfile()).firstName, '');
});

test('when the account storage refuses access, sync says so and keeps everything', async () => {
  await logIn('alex@example.com', 'pw');
  forgetSyncState('user-1');
  server.denied = true;
  await store.putMany([app('a', '2026-11-20T00:00:00Z')]);
  const result = await syncNow({ confirmMove: () => true });
  assert.match(result.error, /isn’t fully set up yet/);
  assert.ok(await store.getApplication('a'), 'nothing on the device was touched');
});

test('the CV, its check, and removing it reach the other device', async () => {
  await logIn('alex@example.com', 'pw');
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3, 250]);
  await saveDocumentFile('cv', new File([bytes], 'my-cv.pdf', { type: 'application/pdf' }));
  await saveCvCheck(await getDocument('cv'), { score: 84, label: 'Good', toFix: 2, ignored: new Set(['cliches']) });
  let result = await syncNow({ confirmMove: () => true });
  assert.ok(result.pushed >= 1, JSON.stringify(result));
  assert.deepEqual([...server.files.get('cv')], [...bytes], 'the file is in the private file store');
  assert.equal(server.documents.get('cv').cv_check.score, 84);

  // Another device: the CV and its check arrive.
  await newDevice();
  result = await syncNow({ confirmMove: () => assert.fail('nothing to move') });
  const cv = await getDocument('cv');
  assert.equal(cv.name, 'my-cv.pdf');
  assert.deepEqual([...new Uint8Array(cv.data)], [...bytes]);
  assert.deepEqual((await getCvCheck(cv)).ignored, ['cliches']);

  // Ignoring another suggestion there updates the check in the account.
  await saveCvCheck(cv, { score: 88, label: 'Strong', toFix: 1, ignored: new Set(['cliches', 'too-short']) });
  await syncNow();
  assert.equal(server.documents.get('cv').cv_check.score, 88);

  // Removing the CV removes it from the account too.
  await removeDocument('cv');
  await syncNow();
  assert.equal(server.documents.get('cv').deleted, true);
  assert.equal(server.files.has('cv'), false);
});

// ---- Fixes from the 22 Nov 2026 review ----

test('restored applications reach the account, even though their dates are old', async () => {
  await logIn('alex@example.com', 'pw');
  await syncNow({ confirmMove: () => true }); // an already-synced device
  await store.putMany([app('restored', '2020-01-01T00:00:00Z')]); // as a backup restore does
  const result = await syncNow();
  assert.equal(result.pushed, 1);
  assert.ok(server.rows.has('restored'));
});

test('first sign-in on a device with its own profile combines both profiles', async () => {
  // The account already has a full profile from another device.
  server.profiles.set('user-1', {
    data: { firstName: 'Alex', skills: ['SQL', 'Python'], experience: [{ id: 'j1', title: 'Analyst', company: 'Contoso' }] },
    updated_at: pg('2026-11-20T00:00:00Z'),
  });
  // This device only has a first name, typed on the Welcome screen just now.
  await saveProfile({ firstName: 'Alexandra' });
  await logIn('alex@example.com', 'pw');
  await syncNow({ confirmMove: () => true });
  const merged = await getProfile();
  assert.equal(merged.firstName, 'Alexandra', 'the newer name wins');
  assert.deepEqual(merged.skills, ['SQL', 'Python'], 'nothing from the account was lost');
  assert.equal(merged.experience.length, 1);
  assert.deepEqual(server.profiles.get('user-1').data.skills, ['SQL', 'Python'], 'and the account has the combined profile');
});

test('a file deleted on another device is removed once, not at every sync', async () => {
  await logIn('alex@example.com', 'pw');
  server.documents.set('linkedin', { kind: 'linkedin', name: '', type: '', size: 0, uploaded_at: pg('2026-11-21T00:00:00Z'), deleted: true, cv_check: null, updated_at: pg('2026-11-21T00:00:00Z') });
  const first = await syncNow({ confirmMove: () => true });
  const second = await syncNow();
  assert.equal(first.applied, 0, 'nothing here to remove');
  assert.equal(second.applied, 0, 'and nothing applied again');
});

// ---- CV history (version 4.2) ----

const cvFile = (name, ...bytes) => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, ...bytes])], name, { type: 'application/pdf' });

test('adding a different CV keeps the old one, with its score; the same file again changes nothing', async () => {
  await saveDocumentFile('cv', cvFile('first.pdf', 1));
  await saveCvCheck(await getDocument('cv'), { score: 61, label: 'Fair', toFix: 5, ignored: new Set() });
  const again = await saveDocumentFile('cv', cvFile('first-copy.pdf', 1));
  assert.equal(again.name, 'first.pdf', 'the same bytes: kept as it was');
  assert.equal((await listCvVersions()).length, 0);
  assert.ok(await getCvCheck(await getDocument('cv')), 'and its check is still valid');

  await saveDocumentFile('cv', cvFile('second.pdf', 2));
  const [earlier] = await listCvVersions();
  assert.equal(earlier.name, 'first.pdf');
  assert.equal(earlier.check.score, 61, 'the score it had');
  assert.equal((await getDocument('cv')).name, 'second.pdf');
  assert.equal(await getCvCheck(await getDocument('cv')), null, 'the new CV hasn’t been checked yet');
});

test('only the newest ten earlier CVs are kept', async () => {
  for (let i = 0; i <= MAX_CV_VERSIONS + 1; i += 1) {
    await saveDocumentFile('cv', cvFile(`cv-${i}.pdf`, i));
    await new Promise((resolve) => setTimeout(resolve, 2)); // distinct "added" times
  }
  const versions = await listCvVersions();
  assert.equal(versions.length, MAX_CV_VERSIONS);
  assert.equal(versions[0].name, `cv-${MAX_CV_VERSIONS}.pdf`, 'newest first');
  assert.ok(!versions.some((v) => v.name === 'cv-0.pdf'), 'the oldest was dropped');
});

test('making an earlier CV current swaps them, and brings back its check', async () => {
  await saveDocumentFile('cv', cvFile('old.pdf', 1));
  await saveCvCheck(await getDocument('cv'), { score: 70, label: 'Good', toFix: 3, ignored: new Set(['cliches']) });
  await saveDocumentFile('cv', cvFile('new.pdf', 2));
  const [old] = await listCvVersions();
  await makeCvCurrent(old.versionId);
  const current = await getDocument('cv');
  assert.equal(current.name, 'old.pdf');
  assert.equal(current.versionId, old.versionId, 'the same version id, so applications still point at it');
  assert.equal((await getCvCheck(current)).score, 70);
  assert.deepEqual((await listCvVersions()).map((v) => v.name), ['new.pdf']);
});

test('CV history syncs: earlier CVs, making one current, and deleting one reach the other device', async () => {
  await logIn('alex@example.com', 'pw');
  await saveDocumentFile('cv', cvFile('one.pdf', 1));
  await saveDocumentFile('cv', cvFile('two.pdf', 2));
  await syncNow({ confirmMove: () => true });
  assert.equal(server.versions.size, 1);
  const [oneId] = server.versions.keys();
  assert.ok(server.files.has(`cv-versions/${oneId}`), 'the earlier file is in the private file store');

  const deviceOneCv = await getDocument('cv'); // to put back later, as that device still has it

  // Another device gets the current CV and the earlier one.
  await newDevice();
  await syncNow();
  assert.equal((await getDocument('cv')).name, 'two.pdf');
  assert.deepEqual((await listCvVersions()).map((v) => v.name), ['one.pdf']);

  // There, "one" is made current again.
  await makeCvCurrent(oneId);
  await syncNow();
  assert.equal(server.documents.get('cv').version_id, oneId);
  assert.equal(server.versions.get(oneId).deleted, true);

  // Back on the first device (it still has "two" as current): it swaps too, without losing "two".
  await newDevice();
  await store.putRecords(STORES.documents, [deviceOneCv]);
  await syncNow({ confirmMove: () => true });
  assert.equal((await getDocument('cv')).name, 'one.pdf');
  assert.deepEqual((await listCvVersions()).map((v) => v.name), ['two.pdf']);

  // Deleting an earlier CV deletes it from the account and its file.
  const [two] = await listCvVersions();
  await deleteCvVersion(two.versionId);
  await syncNow();
  assert.equal(server.versions.get(two.versionId).deleted, true);
  assert.equal(server.files.has(`cv-versions/${two.versionId}`), false);
});

// ---- Fixes from the second review (22 Nov 2026) ----

test('changes made after signing out never reach the account without asking', async () => {
  await store.putMany([app('a', '2026-11-20T00:00:00Z'), app('b', '2026-11-20T00:00:00Z')]);
  await logIn('alex@example.com', 'pw');
  await syncNow({ confirmMove: () => true });
  await signOut();

  // Signed out: "Delete all applications from this device", then add a new one.
  await store.clearAll();
  await store.putMany([app('c', new Date().toISOString())]);

  await logIn('alex@example.com', 'pw');
  const asked = [];
  await syncNow({ confirmMove: (info) => { asked.push(info.count); return true; } });
  assert.deepEqual(asked, [1], 'logging in again asks before moving this device’s data in');
  assert.equal(server.rows.get('a').deleted, false, 'the deletions made while signed out stayed on this device');
  assert.equal(server.rows.get('b').deleted, false);
  assert.ok(server.rows.has('c'), 'the new one was moved in, as agreed');
  assert.deepEqual((await store.listApplications()).map((x) => x.id).sort(), ['a', 'b', 'c'], 'and the account’s came back');
});

test('an empty profile on a new device never wipes the account’s', async () => {
  server.profiles.set('user-1', { data: { firstName: 'Alex', skills: ['SQL'] }, updated_at: pg('2026-11-20T00:00:00Z') });
  await deleteProfileAndDocuments(); // a blank profile, stamped now
  await logIn('alex@example.com', 'pw');
  await syncNow({ confirmMove: () => true });
  assert.equal((await getProfile()).firstName, 'Alex');
  assert.equal(server.profiles.get('user-1').data.firstName, 'Alex');
});

test('a different CV in the account is kept in the CV history when this device’s replaces it', async () => {
  await logIn('alex@example.com', 'pw');
  await saveDocumentFile('cv', cvFile('in-account.pdf', 1));
  await syncNow({ confirmMove: () => true });

  // Another device, which added its own CV before signing in.
  await newDevice();
  await saveDocumentFile('cv', cvFile('this-device.pdf', 2));
  await syncNow({ confirmMove: () => true });
  assert.equal(server.documents.get('cv').name, 'this-device.pdf');
  assert.deepEqual((await listCvVersions()).map((v) => v.name), ['in-account.pdf'], 'not lost: it’s an earlier CV now');
  assert.equal([...server.versions.values()][0]?.name, 'in-account.pdf', 'and in the account’s history');
});

// ---- Cover letters (version 6) ----

test('cover letters sync: written on one device, edited and deleted on another', async () => {
  const { saveLetter, listLetters, deleteLetter, getLetter } = await import('../app/js/letters.js');
  await logIn('alex@example.com', 'pw');
  const letter = await saveLetter({ company: 'Contoso', jobTitle: 'Data Analyst', body: 'Dear Hiring Manager,\n\nHello.', appIds: ['a'] });
  await syncNow({ confirmMove: () => true });
  assert.equal(server.letters.get(letter.id).data.company, 'Contoso');

  await newDevice();
  await syncNow();
  const there = await getLetter(letter.id);
  assert.equal(there.body, 'Dear Hiring Manager,\n\nHello.');
  assert.deepEqual(there.appIds, ['a']);

  await saveLetter({ ...there, body: 'Edited on the laptop.' });
  await syncNow();
  assert.equal(server.letters.get(letter.id).data.body, 'Edited on the laptop.');

  await deleteLetter(letter.id);
  await syncNow();
  assert.equal(server.letters.get(letter.id).deleted, true);
  await newDevice();
  await syncNow();
  assert.equal((await listLetters()).length, 0, 'deleted everywhere');
});
