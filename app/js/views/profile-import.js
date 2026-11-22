// Fill in your profile from your CV or LinkedIn PDF (#/profile/import/cv or /linkedin).
// 1. Reads the file's text on this device (cv/extract.js).
// 2. If it's a scanned image with no text, offers to read it with OCR (cv/ocr.js),
//    which downloads the OCR engine the first time.
// 3. Picks out the profile details with plain rules, no AI (cv/parse.js), adds them
//    to what's already there without overwriting it (mergeIntoProfile), and opens the
//    edit form as a review step. Nothing is saved until you tap Save.
//
// First-time setup uses the same steps (#/welcome/cv, setup: true). There, a file
// that can't be read leads to filling the form in by hand instead.

import { html, icon, createScreen, mount, plural } from '../ui.js';
import { getProfile, getDocument, mergeIntoProfile } from '../profile.js';
import { extractCv, CvReadError, readErrorMessage, hasReadableText } from '../cv/extract.js';
import { parseCv, parseLinkedIn, isLinkedInExport } from '../cv/parse.js';
import { OCR_DOWNLOAD_MB, ocrPdf } from '../cv/ocr.js';
import { track } from '../analytics.js';
import { back, navigate } from '../router.js';
import { subHeader, wireBack } from './components.js';
import { renderProfileEdit } from './profile-edit.js';

const SOURCES = {
  cv: { kind: 'cv', label: 'CV' },
  linkedin: { kind: 'linkedin', label: 'LinkedIn PDF' },
};

export async function renderProfileImport({ source }, ctx, { setup = false } = {}) {
  const from = SOURCES[source] ?? SOURCES.cv;
  const [profile, file] = await Promise.all([getProfile(), getDocument(from.kind)]);
  const showMessage = (title, message) => messageScreen(ctx, title, message, setup);
  if (!file) {
    if (setup) navigate('/welcome', { replace: true });
    else showMessage(`No ${from.label} yet`, `Add your ${from.label} on the Profile tab first, then come back here.`);
    return;
  }

  mount(progressScreen(`Reading ${file.name}…`, false, setup), ctx);
  let doc;
  try {
    doc = await extractCv(file.data, { name: file.name });
  } catch (error) {
    if (!(error instanceof CvReadError)) console.error(error);
    showMessage('This file couldn’t be read', readErrorMessage(error.code));
    return;
  }

  if (!hasReadableText(doc)) {
    if (doc.format !== 'pdf') {
      showMessage('No text found', 'This file has almost no text in it. Try exporting your CV again as a PDF.');
      return;
    }
    const scanned = await readScan(ctx, file, setup, showMessage);
    if (!scanned) return;
    doc = scanned;
  }

  const found = from.kind === 'linkedin' && isLinkedInExport(doc) ? parseLinkedIn(doc) : parseCv(doc);
  const { profile: draft, filled } = mergeIntoProfile(profile, found);
  track('profile_filled_from_file', { source: from.kind, ocr: Boolean(doc.ocr) });
  if (!ctx.active) return;

  await renderProfileEdit(ctx, {
    draft,
    filled,
    sourceLabel: from.label,
    ocr: Boolean(doc.ocr),
    found: describe(found, filled),
  }, { setup });
}

/** Asks before using OCR, then runs it with a progress bar. Returns the read document, or null. */
function readScan(ctx, file, setup, showMessage) {
  return new Promise((resolve) => {
    const screen = createScreen(html`
      ${subHeader(setup ? 'Your details' : 'Fill in from file')}
      <main class="content">
        <section class="panel">
          <h2 class="callout-title">${icon('file')} This CV is a scanned image</h2>
          <p>Its words are a picture, so the app needs to read them with OCR (text recognition). It happens on this device and takes about half a minute.</p>
          <p class="hint">The first time, this downloads about ${OCR_DOWNLOAD_MB} MB. Job portals usually can’t read scanned CVs, so it’s worth sending a PDF exported from Word or Google Docs instead.</p>
          <div class="stack">
            <button type="button" class="btn primary block" data-action="ocr">Read it with OCR</button>
            <button type="button" class="btn block" data-action="cancel">${setup ? 'Fill it in myself' : 'Not now'}</button>
          </div>
        </section>
      </main>
    `);
    wireBack(screen, setup ? '/welcome' : '/profile');
    screen.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      resolve(null);
      if (setup) navigate('/welcome/form', { replace: true });
      else back('/profile');
    });
    screen.querySelector('[data-action="ocr"]').addEventListener('click', async () => {
      const progress = progressScreen('Getting the text reader ready…', true, setup);
      mount(progress, ctx);
      const bar = progress.querySelector('.meter span');
      const label = progress.querySelector('[data-label]');
      try {
        const doc = await ocrPdf(file.data, {
          onProgress: ({ stage, page, pages, progress: done }) => {
            if (stage === 'reading') label.textContent = pages > 1 ? `Reading page ${page} of ${pages}…` : 'Reading your CV…';
            bar.style.width = `${Math.round((done ?? 0) * 100)}%`;
          },
        });
        if (!hasReadableText(doc)) {
          showMessage('No text found', 'Even with OCR, almost no text could be read. Try a sharper scan, or export your CV as a PDF from Word or Google Docs.');
          resolve(null);
          return;
        }
        resolve(doc);
      } catch (error) {
        if (!(error instanceof CvReadError)) console.error(error);
        showMessage('This file couldn’t be read', readErrorMessage(error.code));
        resolve(null);
      }
    });
    mount(screen, ctx);
  });
}

/** "Found your name, email, 2 jobs and 7 skills." */
function describe(found, filled) {
  const parts = [];
  if (found.firstName) parts.push('your name');
  for (const [key, label] of [['email', 'email'], ['phone', 'phone number'], ['location', 'location'], ['linkedinUrl', 'LinkedIn link'], ['summary', 'summary']]) {
    if (found[key]) parts.push(label);
  }
  for (const [key, word] of [['experience', 'job'], ['education', 'qualification'], ['projects', 'project'], ['certifications', 'certification']]) {
    if (found[key].length) parts.push(plural(found[key].length, word));
  }
  if (found.skills.length) parts.push(plural(found.skills.length, 'skill'));
  if (!parts.length) return 'Very little could be picked out of this file, so you may need to fill most of it in yourself.';

  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  const added = filled.fields.length + filled.items.size + filled.skills.length;
  const kept = added === 0 ? ' Everything found was already in your profile, so nothing new was added.' : '';
  return `Found ${list}.${kept}`;
}

function progressScreen(text, withBar = false, setup = false) {
  return createScreen(html`
    ${subHeader(setup ? 'Your details' : 'Fill in from file')}
    <main class="content">
      <div class="panel loading-block" role="status">
        <div class="loading">
          <span class="spinner" aria-hidden="true"></span>
          <p data-label>${text}</p>
        </div>
        ${withBar && html`<div class="meter" aria-hidden="true"><span style="width: 0%"></span></div>`}
      </div>
    </main>
  `);
}

function messageScreen(ctx, title, message, setup) {
  const screen = createScreen(html`
    ${subHeader(setup ? 'Your details' : 'Fill in from file')}
    <main class="content">
      <section class="panel">
        <h2 class="callout-title">${icon('info')} ${title}</h2>
        <p>${message}</p>
        ${setup
          ? html`<div class="stack">
              <a class="btn primary block" href="#/welcome/form">Fill it in myself</a>
              <a class="btn block" href="#/welcome">Try another file</a>
            </div>`
          : html`<a class="btn block" href="#/profile">Back to profile</a>`}
      </section>
    </main>
  `);
  wireBack(screen, setup ? '/welcome' : '/profile');
  mount(screen, ctx);
}
