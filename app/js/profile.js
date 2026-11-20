// Your profile: who you are, your experience, education, projects, certifications
// and skills, plus your CV and LinkedIn files. You can fill it in yourself, or have
// the app read your CV or LinkedIn PDF into it (cv/parse.js), then check it before
// saving. Cover letters and job matches will use it later.

import { STORES, getRecord, putRecords, deleteRecord, clearStore } from './store.js';
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
    education: (a, b) => (a.school && norm(a.school) === norm(b.school)) || (a.qualification && norm(a.qualification) === norm(b.qualification)),
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
  await deleteRecord(STORES.profile, PROFILE_ID);
  await clearStore(STORES.documents);
  setPref(LEGACY_NAME_KEY, '');
}

export function isNamePromptDismissed() {
  return getPref(PROMPT_DISMISSED_KEY, '') === '1';
}

export function dismissNamePrompt() {
  setPref(PROMPT_DISMISSED_KEY, '1');
}

// ---- CV and LinkedIn files ----

/** The saved file for 'cv' or 'linkedin', or null. Includes its data. */
export function getDocument(kind) {
  return getRecord(STORES.documents, kind);
}

export async function saveDocumentFile(kind, file) {
  if (!DOC_KINDS[kind]) throw new Error('Unknown document type');
  if (file.size > MAX_DOC_BYTES) throw new Error('That file is over 10 MB. Try a smaller copy.');
  const data = await file.arrayBuffer();
  await putRecords(STORES.documents, [{
    id: kind,
    name: String(file.name || DOC_KINDS[kind].label).slice(0, 120),
    type: file.type || 'application/octet-stream',
    size: file.size,
    uploadedAt: new Date().toISOString(),
    data,
  }]);
}

export async function removeDocument(kind) {
  await deleteRecord(STORES.documents, kind);
  if (kind === 'cv') await deleteRecord(STORES.documents, CV_CHECK_ID);
}

// ---- CV check (version 3) ----
// The last result for your saved CV: its score, how many things to fix, and which
// suggestions you chose to ignore. Kept next to the CV, and removed with it.

const CV_CHECK_ID = 'cv-check';

/** The saved CV check, or null if there isn't one for the CV you have now. */
export async function getCvCheck(cv) {
  const saved = await getRecord(STORES.documents, CV_CHECK_ID);
  return saved && cv && saved.cvUploadedAt === cv.uploadedAt ? saved : null;
}

export async function saveCvCheck(cv, { score, label, toFix, ignored }) {
  await putRecords(STORES.documents, [{
    id: CV_CHECK_ID,
    cvUploadedAt: cv.uploadedAt,
    checkedAt: new Date().toISOString(),
    score,
    label,
    toFix,
    ignored: [...ignored],
  }]);
}

/** Opens a saved file in a new tab (PDFs show in the browser; Word files download). */
export async function openDocument(kind) {
  const doc = await getDocument(kind);
  if (!doc) return;
  const url = URL.createObjectURL(new Blob([doc.data], { type: doc.type }));
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  if (!doc.type.includes('pdf')) link.download = doc.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
