// Your profile: who you are, your experience, education, projects, certifications
// and skills, plus your CV and LinkedIn files. You can fill it in yourself, or have
// the app read your CV or LinkedIn PDF into it (cv/parse.js), then check it before
// saving. Cover letters and job matches will use it later.

import { STORES, getRecord, getAllRecords, putRecords, deleteRecord, clearStore } from './store.js';
import { getPref, setPref } from './prefs.js';
import { makeId, normalizeUrl } from './model.js';
import { safeHttpUrl } from './ui.js';
import { norm, normCompany } from './cv/text.js';

const PROFILE_ID = 'me';
const LEGACY_NAME_KEY = 'jt-first-name'; // where the first name was kept before profiles existed
const PROMPT_DISMISSED_KEY = 'jt-name-prompt-dismissed';

export const MAX_NAME_LENGTH = 40;
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

export const DOC_KINDS = {
  cv: {
    label: 'CV',
    accept: '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  linkedin: { label: 'LinkedIn profile (PDF)', accept: '.pdf,application/pdf' },
};

// ---- Shape and cleaning ----

/**
 * Shape of the profile:
 *   firstName, lastName, headline, location, email, phone, linkedinUrl, summary, targetRoles
 *   skills      ['SQL', 'Python', ...]
 *   experience  [{ id, title, company, start 'YYYY-MM', end 'YYYY-MM' or '', current, description }]
 *   education   [{ id, school, qualification, start 'YYYY-MM', end 'YYYY-MM' }]
 *   projects    [{ id, name, link, start, end, description }]
 *   certifications [{ id, name, issuer, issued 'YYYY-MM', link }]
 *   updatedAt   ISO timestamp
 */
export function blankProfile() {
  return normalizeProfile({});
}

export function blankJob() {
  return { id: makeId(), title: '', company: '', start: '', end: '', current: false, description: '' };
}

export function blankEducation() {
  return { id: makeId(), school: '', qualification: '', start: '', end: '' };
}

export function blankProject() {
  return { id: makeId(), name: '', link: '', start: '', end: '', description: '' };
}

export function blankCertification() {
  return { id: makeId(), name: '', issuer: '', issued: '', link: '' };
}

const text = (value, max) => String(value ?? '').trim().slice(0, max);
const longText = (value, max) => String(value ?? '').trim().slice(0, max);
const month = (value) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? '') ? value : '');
const itemId = (value) => (typeof value === 'string' && value ? value.slice(0, 64) : makeId());

function cleanSkills(value) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(/[,\n]/);
  const seen = new Set();
  const skills = [];
  for (const item of raw) {
    const skill = text(item, 40);
    const key = skill.toLowerCase();
    if (skill && !seen.has(key)) {
      seen.add(key);
      skills.push(skill);
    }
  }
  return skills.slice(0, 50);
}

function cleanJob(job = {}) {
  const current = Boolean(job.current);
  return {
    id: itemId(job.id),
    title: text(job.title, 120),
    company: text(job.company, 120),
    start: month(job.start),
    end: current ? '' : month(job.end),
    current,
    description: longText(job.description, 2000),
  };
}

function cleanEducation(item = {}) {
  return {
    id: itemId(item.id),
    school: text(item.school, 120),
    qualification: text(item.qualification, 120),
    start: month(item.start),
    end: month(item.end),
  };
}

function cleanProject(item = {}) {
  return {
    id: itemId(item.id),
    name: text(item.name, 120),
    link: normalizeUrl(text(item.link, 300)),
    start: month(item.start),
    end: month(item.end),
    description: longText(item.description, 2000),
  };
}

function cleanCertification(item = {}) {
  return {
    id: itemId(item.id),
    name: text(item.name, 160),
    issuer: text(item.issuer, 120),
    issued: month(item.issued),
    link: normalizeUrl(text(item.link, 300)),
  };
}

export function normalizeProfile(input = {}) {
  const list = (value) => (Array.isArray(value) ? value : []);
  return {
    id: PROFILE_ID,
    firstName: text(input.firstName, MAX_NAME_LENGTH),
    lastName: text(input.lastName, 60),
    headline: text(input.headline, 140),
    location: text(input.location, 80),
    email: text(input.email, 254),
    phone: text(input.phone, 40),
    linkedinUrl: normalizeUrl(text(input.linkedinUrl, 300)),
    summary: longText(input.summary, 3000),
    targetRoles: text(input.targetRoles, 300),
    skills: cleanSkills(input.skills),
    experience: list(input.experience).map(cleanJob).filter((job) => job.title || job.company).slice(0, 30),
    education: list(input.education).map(cleanEducation).filter((item) => item.school || item.qualification).slice(0, 20),
    projects: list(input.projects).map(cleanProject).filter((item) => item.name).slice(0, 30),
    certifications: list(input.certifications).map(cleanCertification).filter((item) => item.name).slice(0, 40),
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : '',
  };
}

/**
 * Adds what was read from a CV or LinkedIn PDF to a profile, without overwriting
 * anything you've entered yourself ("your edits always win"):
 *   - a detail like your phone number is only filled in if it's empty,
 *   - jobs, education, projects and certifications are added if they aren't there yet,
 *   - new skills are added to the end.
 * Returns { profile, filled } where `filled` says what came from the file, so the
 * review screen can highlight it.
 */
export function mergeIntoProfile(current, found) {
  const profile = normalizeProfile(current);
  const incoming = normalizeProfile(found);
  const filled = { fields: [], skills: [], items: new Set() };

  for (const key of ['firstName', 'lastName', 'headline', 'location', 'email', 'phone', 'linkedinUrl', 'summary']) {
    if (!profile[key] && incoming[key]) {
      profile[key] = incoming[key];
      filled.fields.push(key);
    }
  }

  const known = new Set(profile.skills.map((skill) => skill.toLowerCase()));
  for (const skill of incoming.skills) {
    if (!known.has(skill.toLowerCase()) && profile.skills.length < 50) {
      profile.skills.push(skill);
      known.add(skill.toLowerCase());
      filled.skills.push(skill);
    }
  }

  const same = {
    experience: (a, b) => normCompany(a.company) === normCompany(b.company) && (norm(a.title) === norm(b.title) || (a.start && a.start === b.start)),
    // The same school and the same qualification (a missing one on either side counts as the same).
    education: (a, b) => norm(a.school) === norm(b.school) &&
      (!a.qualification || !b.qualification || norm(a.qualification) === norm(b.qualification)),
    projects: (a, b) => norm(a.name) === norm(b.name),
    certifications: (a, b) => norm(a.name) === norm(b.name),
  };
  let addedJobs = false;
  for (const [kind, matches] of Object.entries(same)) {
    for (const item of incoming[kind]) {
      if (profile[kind].some((existing) => matches(existing, item))) continue;
      const added = { ...item, id: makeId() };
      profile[kind].push(added);
      filled.items.add(added.id);
      if (kind === 'experience') addedJobs = true;
    }
  }
  // Newest jobs first, as on a CV (only re-sorted when jobs were added).
  if (addedJobs) profile.experience.sort((a, b) => (b.current - a.current) || (b.start || '').localeCompare(a.start || ''));

  return { profile, filled };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateProfile(profile) {
  const errors = {};
  if (profile.email && !EMAIL_PATTERN.test(profile.email)) errors.email = 'Check this email address.';
  if (profile.linkedinUrl && !safeHttpUrl(profile.linkedinUrl)) errors.linkedinUrl = 'Use a web link, like https://www.linkedin.com/in/your-name';
  return errors;
}

export function isProfileEmpty(profile) {
  const textFields = ['firstName', 'lastName', 'headline', 'location', 'email', 'phone', 'linkedinUrl', 'summary', 'targetRoles'];
  return textFields.every((key) => !profile[key]) &&
    ['skills', 'experience', 'education', 'projects', 'certifications'].every((key) => !profile[key].length);
}

export function fullName(profile) {
  return [profile.firstName, profile.lastName].filter(Boolean).join(' ');
}

export function initials(profile) {
  return `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.toUpperCase();
}

/** How complete the profile is, and the next thing to add. */
export function profileStrength(profile, docs = {}) {
  const checks = [
    [Boolean(profile.firstName), 'Add your name'],
    [Boolean(profile.headline), 'Add a headline'],
    [Boolean(profile.summary), 'Write a short summary'],
    [profile.experience.length > 0, 'Add your experience'],
    [profile.education.length > 0, 'Add your education'],
    [profile.skills.length > 0, 'Add your skills'],
    [Boolean(docs.cv), 'Add your CV'],
  ];
  const missing = checks.filter(([done]) => !done).map(([, label]) => label);
  return { done: checks.length - missing.length, total: checks.length, next: missing[0] ?? '' };
}

// ---- Saving and loading ----

export async function getProfile() {
  const saved = await getRecord(STORES.profile, PROFILE_ID);
  if (saved) return normalizeProfile(saved);

  // First time after this update: bring over the first name the earlier version saved.
  const profile = blankProfile();
  const legacyName = getPref(LEGACY_NAME_KEY, '').trim();
  if (legacyName) {
    profile.firstName = legacyName.slice(0, MAX_NAME_LENGTH);
    return saveProfile(profile);
  }
  return profile;
}

/** Cleans, stamps updatedAt and saves. Returns the saved profile. */
export async function saveProfile(profile) {
  const record = { ...normalizeProfile(profile), updatedAt: new Date().toISOString() };
  await putRecords(STORES.profile, [record]);
  return record;
}

export async function deleteProfileAndDocuments() {
  for (const kind of Object.keys(DOC_KINDS)) if (await getDocument(kind)) markDocumentDeleted(kind);
  rememberVersionDeletions((await listCvVersions()).map((version) => version.versionId));
  // Saved as an empty profile with today's date rather than removed, so sync can
  // tell your other devices it was deleted (an empty, newer profile wins).
  await putRecords(STORES.profile, [{ ...blankProfile(), updatedAt: new Date().toISOString() }]);
  await clearStore(STORES.documents);
  setPref(LEGACY_NAME_KEY, '');
}

export function isNamePromptDismissed() {
  return getPref(PROMPT_DISMISSED_KEY, '') === '1';
}

export function dismissNamePrompt() {
  setPref(PROMPT_DISMISSED_KEY, '1');
}

// ---- First-time setup (views/welcome.js) ----

const SETUP_DONE_KEY = 'jt-setup-done';

export function markSetupDone() {
  setPref(SETUP_DONE_KEY, '1');
}

/** True the first time the app opens on a device with nothing saved yet. */
export async function needsSetup(applicationCount) {
  if (getPref(SETUP_DONE_KEY, '') === '1' || applicationCount > 0) return false;
  const [profile, cv] = await Promise.all([getProfile(), getDocument('cv')]);
  return isProfileEmpty(profile) && !cv;
}

// ---- CV and LinkedIn files ----

/** The saved file for 'cv' or 'linkedin', or null. Includes its data. */
export function getDocument(kind) {
  return getRecord(STORES.documents, kind);
}

// When a file was removed, so sync can remove it from your account and other devices.
const deletedMemory = {};
const deletedKey = (kind) => `jt-doc-deleted-${kind}`;

/** When this device last removed the CV or LinkedIn file ('' if it hasn't). */
export function documentDeletedAt(kind) {
  return deletedMemory[kind] ?? getPref(deletedKey(kind), '');
}

export function markDocumentDeleted(kind, at = new Date().toISOString()) {
  deletedMemory[kind] = at;
  setPref(deletedKey(kind), at);
}

export async function saveDocumentFile(kind, file) {
  if (!DOC_KINDS[kind]) throw new Error('Unknown document type');
  if (file.size > MAX_DOC_BYTES) throw new Error('That file is over 10 MB. Try a smaller copy.');
  const data = await file.arrayBuffer();
  const now = new Date().toISOString();
  if (kind === 'cv') {
    const current = await getDocument('cv');
    // The same file again: keep it as it is (and its CV check).
    if (current && sameBytes(current.data, data)) return current;
    // A different CV: the one you had becomes an earlier version (CV history).
    if (current) await archiveCv(current);
  }
  markDocumentDeleted(kind, '');
  const record = {
    id: kind,
    name: String(file.name || DOC_KINDS[kind].label).slice(0, 120),
    type: safeDocType(file.type, file.name),
    size: file.size,
    uploadedAt: now,
    data,
    ...(kind === 'cv' ? { versionId: makeId(), addedAt: now } : {}),
  };
  await putRecords(STORES.documents, [record]);
  return record;
}

function sameBytes(a, b) {
  if (!a || !b || a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return false;
  return true;
}

export async function removeDocument(kind) {
  markDocumentDeleted(kind);
  await deleteRecord(STORES.documents, kind);
  if (kind === 'cv') await deleteRecord(STORES.documents, CV_CHECK_ID);
}

// ---- CV check (version 3) ----
// The last result for your saved CV: its score, how many things to fix, and which
// suggestions you chose to ignore. Kept next to the CV, and removed with it.

export const CV_CHECK_ID = 'cv-check';

/** The saved CV check, or null if there isn't one for the CV you have now. */
export async function getCvCheck(cv) {
  const saved = await getRecord(STORES.documents, CV_CHECK_ID);
  if (!saved || !cv || saved.cvUploadedAt !== cv.uploadedAt) return null;
  // Checks saved since CV history also name the CV's version.
  return !saved.cvVersionId || saved.cvVersionId === cvVersionIdOf(cv) ? saved : null;
}

export async function saveCvCheck(cv, { score, label, toFix, ignored }) {
  await putRecords(STORES.documents, [{
    id: CV_CHECK_ID,
    cvUploadedAt: cv.uploadedAt,
    cvVersionId: cvVersionIdOf(cv),
    checkedAt: new Date().toISOString(),
    score,
    label,
    toFix,
    ignored: [...ignored],
  }]);
}

/** Opens a saved file in a new tab (PDFs show in the browser; Word files download). */
const FILE_TYPES = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/**
 * Only the three kinds of file a CV can be. Anything else (from a damaged or crafted
 * backup, say) becomes a plain download, so it can never open as a web page.
 */
export function safeDocType(type, name = '') {
  if (Object.values(FILE_TYPES).includes(type)) return type;
  return FILE_TYPES[String(name).split('.').pop().toLowerCase()] ?? 'application/octet-stream';
}

/** True only for a real PDF: the right type, and the file starts with %PDF. */
export function isRealPdf(doc) {
  if (doc.type !== FILE_TYPES.pdf || !doc.data || doc.data.byteLength < 4) return false;
  const start = new Uint8Array(doc.data, 0, 4);
  return String.fromCharCode(...start) === '%PDF';
}

export async function openDocument(kind) {
  openFile(await getDocument(kind));
}

/** Opens a saved file record (the CV, the LinkedIn PDF or an earlier CV). */
export function openFile(doc) {
  if (!doc) return;
  const pdf = isRealPdf(doc);
  const url = URL.createObjectURL(new Blob([doc.data], { type: pdf ? FILE_TYPES.pdf : 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  if (!pdf) link.download = doc.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ---- CV history (version 4.2) ----
// Adding a different CV keeps the one before it as an earlier version, with its CV
// check score at the time, so you can look back at what you sent. Earlier versions
// sit in the documents store as 'cv-v:<version id>'; the newest MAX_CV_VERSIONS are
// kept. Each CV has a version id from the moment it's added, so applications can
// say which CV was sent (app.cvVersionId), and every device uses the same ids.

export const MAX_CV_VERSIONS = 10;
const VERSION_PREFIX = 'cv-v:';
export const versionRecordId = (versionId) => `${VERSION_PREFIX}${versionId}`;
export const isCvVersion = (record) => typeof record?.id === 'string' && record.id.startsWith(VERSION_PREFIX);

/** A CV added before CV history existed gets an id from when it was added, the same on every device. */
const legacyVersionId = (cv) => `added-${Date.parse(cv.uploadedAt) || 0}`;

/** The version id of a CV record (the current one, or one from a backup or another device). */
export function cvVersionIdOf(cv) {
  return cv ? cv.versionId || legacyVersionId(cv) : '';
}

/** Earlier CVs, newest first, with their files. */
export async function listCvVersions() {
  const all = await getAllRecords(STORES.documents);
  return all.filter(isCvVersion).sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
}

export function getCvVersion(versionId) {
  return getRecord(STORES.documents, versionRecordId(versionId));
}

/** The current CV or an earlier one, by version id; null if it's been deleted. */
export async function findCv(versionId) {
  if (!versionId) return null;
  const cv = await getDocument('cv');
  if (cv && cvVersionIdOf(cv) === versionId) return { ...cv, versionId, current: true };
  return getCvVersion(versionId);
}

/**
 * Keeps a CV as an earlier version (just before it's replaced), with its CV check.
 * Only the newest MAX_CV_VERSIONS are kept.
 */
export async function archiveCv(cv, knownCheck) {
  if (!cv?.data) return;
  const versionId = cvVersionIdOf(cv);
  const check = knownCheck !== undefined ? knownCheck : await getCvCheck(cv);
  await putRecords(STORES.documents, [{
    id: versionRecordId(versionId),
    versionId,
    name: cv.name,
    type: cv.type,
    size: cv.size,
    addedAt: cv.addedAt || cv.uploadedAt,
    check: check ? { score: check.score, label: check.label, toFix: check.toFix, ignored: check.ignored, checkedAt: check.checkedAt } : null,
    updatedAt: new Date().toISOString(),
    data: cv.data,
  }]);
  forgetVersionDeletions([versionId]);
  await keepNewestCvVersions();
}

/** Deletes earlier CVs beyond the newest MAX_CV_VERSIONS. */
export async function keepNewestCvVersions() {
  for (const old of (await listCvVersions()).slice(MAX_CV_VERSIONS)) await deleteCvVersion(old.versionId);
}

export async function deleteCvVersion(versionId) {
  rememberVersionDeletions([versionId]);
  await deleteRecord(STORES.documents, versionRecordId(versionId));
}

/** Makes an earlier CV your current one again; the current one becomes an earlier version. */
export async function makeCvCurrent(versionId) {
  const version = await getCvVersion(versionId);
  if (!version) return null;
  const current = await getDocument('cv');
  if (current) await archiveCv(current);
  // Stamped now, so it counts as the newest CV on every device.
  const uploadedAt = new Date().toISOString();
  markDocumentDeleted('cv', '');
  const record = { id: 'cv', versionId, name: version.name, type: version.type, size: version.size, addedAt: version.addedAt, uploadedAt, data: version.data };
  await putRecords(STORES.documents, [record]);
  if (version.check) await putRecords(STORES.documents, [{ ...version.check, id: CV_CHECK_ID, cvUploadedAt: uploadedAt, cvVersionId: versionId }]);
  else await deleteRecord(STORES.documents, CV_CHECK_ID);
  await deleteCvVersion(versionId);
  return record;
}

// Deleted earlier versions, until sync has told your account: { versionId: deletedAt }.
const VERSION_DELETIONS_KEY = 'jt-cv-versions-deleted';
let versionDeletions = null; // kept in memory too, for windows that block localStorage

function loadVersionDeletions() {
  if (!versionDeletions) {
    try {
      const saved = JSON.parse(getPref(VERSION_DELETIONS_KEY, '{}'));
      versionDeletions = saved && typeof saved === 'object' ? saved : {};
    } catch {
      versionDeletions = {};
    }
  }
  return versionDeletions;
}

function saveVersionDeletions() {
  setPref(VERSION_DELETIONS_KEY, JSON.stringify(versionDeletions));
}

function rememberVersionDeletions(ids) {
  if (ids.length === 0) return;
  const list = loadVersionDeletions();
  const at = new Date().toISOString();
  for (const id of ids) list[id] = at;
  saveVersionDeletions();
}

function forgetVersionDeletions(ids) {
  const list = loadVersionDeletions();
  if (!ids.some((id) => id in list)) return;
  for (const id of ids) delete list[id];
  saveVersionDeletions();
}

/** Earlier CVs deleted here and not yet sent to the account. */
export function pendingVersionDeletions() {
  return { ...loadVersionDeletions() };
}

/** Called by sync once these deletions have reached the account. */
export function versionDeletionsSent(sent) {
  const list = loadVersionDeletions();
  for (const [id, at] of Object.entries(sent)) if (list[id] === at) delete list[id];
  saveVersionDeletions();
}

// Another tab deleted a version: read the list again next time.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === VERSION_DELETIONS_KEY) versionDeletions = null;
  });
}
