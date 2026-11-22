// Cover letters (version 6): every letter you write, kept in one place, each linked to
// the applications you sent it with. Writing them with AI is version 5 (on hold), so
// for now you write or paste them, or start from a template filled with your profile
// and the job's details.
//
// A letter: { id, company, jobTitle, body, appIds: [application ids], createdAt, updatedAt }
// Letters sync like applications (sync.js, the cover_letters table) and are in backups.

import { STORES, getAllRecords, getRecord, putRecords, deleteRecord } from './store.js';
import { makeId } from './model.js';
import { norm } from './cv/text.js';
import { getPref, setPref } from './prefs.js';

export const MAX_LETTER_LENGTH = 20000;

const isTimestamp = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const text = (value, max) => String(value ?? '').trim().slice(0, max);

export function normalizeLetter(input = {}) {
  const now = new Date().toISOString();
  return {
    id: typeof input.id === 'string' && input.id ? input.id.slice(0, 64) : makeId(),
    company: text(input.company, 120),
    jobTitle: text(input.jobTitle, 160),
    body: String(input.body ?? '').replace(/\s+$/, '').slice(0, MAX_LETTER_LENGTH),
    appIds: Array.isArray(input.appIds) ? [...new Set(input.appIds.filter((id) => typeof id === 'string' && id))].slice(0, 50) : [],
    createdAt: isTimestamp(input.createdAt) ? input.createdAt : now,
    updatedAt: isTimestamp(input.updatedAt) ? input.updatedAt : now,
  };
}

/** "Contoso · Data Analyst", or a fallback when they're not filled in. */
export function letterLabel(letter) {
  return [letter.company, letter.jobTitle].filter(Boolean).join(' · ') || 'Untitled cover letter';
}

/** Every letter, most recently changed first. */
export async function listLetters() {
  return (await getAllRecords(STORES.letters)).map(normalizeLetter).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getLetter(id) {
  const saved = await getRecord(STORES.letters, id);
  return saved ? normalizeLetter(saved) : null;
}

/** Saves a letter, stamped as changed now. Returns the saved letter. */
export async function saveLetter(letter) {
  const record = { ...normalizeLetter(letter), updatedAt: new Date().toISOString() };
  forgetLetterDeletions([record.id]);
  await putRecords(STORES.letters, [record]);
  return record;
}

export async function deleteLetter(id) {
  rememberLetterDeletions([id]);
  await deleteRecord(STORES.letters, id);
}

/** Letters linked to an application. */
export const lettersFor = (appId, letters) => letters.filter((letter) => letter.appIds.includes(appId));

/** Letters whose company, job title, words, or linked applications match the search. */
export function searchLetters(letters, query, appsById = new Map()) {
  const words = norm(query).trim().split(' ').filter(Boolean);
  if (!words.length) return letters;
  return letters.filter((letter) => {
    const linked = letter.appIds.map((id) => appsById.get(id)).filter(Boolean).map((app) => `${app.company} ${app.title}`).join(' ');
    const haystack = norm(`${letter.company} ${letter.jobTitle} ${linked} ${letter.body.slice(0, 2000)}`);
    return words.every((word) => haystack.includes(` ${word}`));
  });
}

// ---- Starting from a template (no AI) ----

/**
 * A first draft from your profile and the job: the parts only you can write are
 * [in square brackets], so nothing is made up.
 */
export function letterTemplate(profile = {}, job = {}) {
  const company = job.company || '[company]';
  const role = job.title || job.jobTitle || '[job title]';
  const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || '[your name]';
  const latest = (profile.experience ?? []).find((item) => item.title || item.company);
  const skills = (profile.skills ?? []).slice(0, 4);
  const contact = [profile.email, profile.phone].filter(Boolean).join(' · ');
  return [
    'Dear Hiring Manager,',
    '',
    `I’m writing to apply for the ${role} role at ${company}. [Say what draws you to ${company} and to this role.]`,
    '',
    latest
      ? `In my ${latest.current || !latest.end ? 'current' : 'recent'} role as ${latest.title || '[job title]'}${latest.company ? ` at ${latest.company}` : ''}, I [one or two achievements, with numbers, that match what the job asks for].`
      : '[One or two achievements, with numbers, that match what the job asks for.]',
    '',
    skills.length
      ? `I’d bring ${skills.join(', ')}. [Say how these meet the job’s main requirements.]`
      : '[The skills you’d bring, and how they meet the job’s main requirements.]',
    '',
    `Thank you for considering my application. I’d welcome the chance to talk about how I could help ${company}.`,
    '',
    'Kind regards,',
    name,
    ...(contact ? [contact] : []),
  ].join('\n');
}

/** Square-bracket prompts still left in a letter, like "[company]". */
export const unfilledPrompts = (body) => (String(body).match(/\[[^\]\n]{2,160}\]/g) ?? []);

// ---- Copy, Word and PDF ----

export function letterFileName(letter, extension) {
  const base = letterLabel(letter).replace(/[^\w\s-]+/g, '').replace(/\s+/g, ' ').trim().replace(/ /g, '-').slice(0, 60) || 'cover-letter';
  return `Cover-letter-${base}.${extension}`;
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The letter as a simple HTML page: paragraphs from blank lines, line breaks kept. */
export function letterHtml(letter, { forPrint = false } = {}) {
  const paragraphs = letter.body.split(/\n\s*\n/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('\n');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(letterLabel(letter))}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.45; color: #111; max-width: 17cm; margin: ${forPrint ? '2cm auto' : '0'}; }
  p { margin: 0 0 10pt; }
  @page { margin: 2cm; }
</style></head>
<body>
${paragraphs}
</body></html>`;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Downloads a .doc file that Word (and Google Docs, Pages) opens. */
export function downloadWord(letter) {
  download(new Blob([letterHtml(letter)], { type: 'application/msword' }), letterFileName(letter, 'doc'));
}

/** Opens the letter on its own and asks the browser to print it (choose "Save as PDF"). */
export function printLetter(letter) {
  const page = window.open('', '_blank');
  if (!page) return false; // blocked
  page.document.write(letterHtml(letter, { forPrint: true }));
  page.document.close();
  page.focus();
  setTimeout(() => page.print(), 300);
  return true;
}

// ---- Deleted letters, until sync has told your account ----

const DELETIONS_KEY = 'jt-letters-deleted';
let deletions = null; // kept in memory too, for windows that block localStorage

function loadDeletions() {
  if (!deletions) {
    try {
      const saved = JSON.parse(getPref(DELETIONS_KEY, '{}'));
      deletions = saved && typeof saved === 'object' ? saved : {};
    } catch {
      deletions = {};
    }
  }
  return deletions;
}

const saveDeletions = () => setPref(DELETIONS_KEY, JSON.stringify(deletions));

function rememberLetterDeletions(ids) {
  const list = loadDeletions();
  const at = new Date().toISOString();
  for (const id of ids) list[id] = at;
  saveDeletions();
}

function forgetLetterDeletions(ids) {
  const list = loadDeletions();
  if (!ids.some((id) => id in list)) return;
  for (const id of ids) delete list[id];
  saveDeletions();
}

export const pendingLetterDeletions = () => ({ ...loadDeletions() });

export function letterDeletionsSent(sent) {
  const list = loadDeletions();
  for (const [id, at] of Object.entries(sent)) if (list[id] === at) delete list[id];
  saveDeletions();
}

// Another tab deleted a letter: read the list again next time.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === DELETIONS_KEY) deletions = null;
  });
}
