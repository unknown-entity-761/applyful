// CV check (version 3): reads your CV on this device, then lists what to fix,
// most important first, and what's already strong. Opened from the Profile tab.
// Nothing is uploaded; see js/cv/extract.js and js/cv/rules.js.

import { html, raw, icon, createScreen, mount, showToast, plural } from '../ui.js';
import { DOC_KINDS, MAX_DOC_BYTES, getProfile, getDocument, saveDocumentFile, getCvCheck, saveCvCheck } from '../profile.js';
import { extractCv, CvReadError, readErrorMessage } from '../cv/extract.js';
import { checkCv, scoreCv, SEVERITIES } from '../cv/rules.js';
import { track } from '../analytics.js';
import { subHeader, wireBack } from './components.js';

// Fixes whose quotes come from your profile or LinkedIn, not from the CV itself.
const NOT_ON_CV = new Set(['mismatch', 'missing-skills']);

export async function renderCvCheck(ctx) {
  const [cv, linkedin, profile] = await Promise.all([getDocument('cv'), getDocument('linkedin'), getProfile()]);
  if (!cv) {
    showAddCv(ctx);
    return;
  }

  mount(loadingScreen(cv.name), ctx);
  const [saved, outcome] = await Promise.all([getCvCheck(cv), runCheck(cv.data, cv.name, linkedin, profile)]);
  const state = { cv, linkedin, profile, file: cv, other: null, outcome, ignored: new Set(saved?.ignored ?? []) };
  await remember(state);
  showResult(state, ctx);
}

/** Reads the file and runs the rules. Returns { doc, result } or { error }. */
async function runCheck(buffer, name, linkedin, profile) {
  try {
    const doc = await extractCv(buffer, { name });
    const linkedinDoc = linkedin ? await extractCv(linkedin.data, { name: linkedin.name }).catch(() => null) : null;
    track('cv_check_run');
    return { doc, result: checkCv(doc, { profile, linkedin: linkedinDoc }) };
  } catch (error) {
    if (!(error instanceof CvReadError)) console.error(error);
    return { error: error instanceof CvReadError ? error.code : 'damaged' };
  }
}

function scoreOf(state) {
  const { result } = state.outcome;
  if (result.status === 'unreadable') return { score: 0, label: 'Can’t be read' };
  return scoreCv(result.fixes, [...state.ignored]);
}

/** Saves the score and ignored suggestions for your saved CV (not for a one-off file). */
async function remember(state) {
  if (state.other || !state.outcome.result) return;
  const toFix = state.outcome.result.fixes.filter((fix) => !state.ignored.has(fix.id)).length;
  await saveCvCheck(state.cv, { ...scoreOf(state), toFix, ignored: state.ignored });
}

// ---- Screens ----

function loadingScreen(name) {
  return createScreen(html`
    ${subHeader('CV check')}
    <main class="content">
      <div class="panel loading" role="status">
        <span class="spinner" aria-hidden="true"></span>
        <p>Reading ${name}…</p>
      </div>
    </main>
  `);
}

function showAddCv(ctx) {
  const screen = createScreen(html`
    ${subHeader('CV check')}
    <main class="content">
      <div class="empty">
        <div class="empty-icon">${icon('file')}</div>
        <h2>Check your CV</h2>
        <p>See what’s strong and what to fix before a recruiter or job portal does. It’s checked on this device, and your CV isn’t uploaded.</p>
        <label class="btn primary file-btn">
          ${icon('upload')} Add your CV
          <input type="file" class="visually-hidden" accept="${DOC_KINDS.cv.accept}" data-add-cv>
        </label>
        <p class="hint">PDF or Word (.docx). It’s saved to your profile.</p>
      </div>
    </main>
  `);
  wireBack(screen, '/profile');
  screen.querySelector('[data-add-cv]').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await saveDocumentFile('cv', file);
      showToast('CV saved');
      await renderCvCheck(ctx);
    } catch (error) {
      showToast(error.message);
    }
  });
  mount(screen, ctx);
}

function showResult(state, ctx, scrollY = 0) {
  const screen = createScreen(html`
    ${subHeader('CV check')}
    <main class="content">
      ${state.other && html`
        <div class="callout info">
          <p class="callout-title">${icon('file')} Checking a different file</p>
          <p>“${state.other.name}” isn’t saved. Your profile still has ${state.cv ? 'your saved CV' : 'no CV'}.</p>
          <div class="callout-actions">
            ${!state.outcome.error && html`<button type="button" class="btn small primary" data-action="use-file">Use as my CV</button>`}
            ${state.cv && html`<button type="button" class="btn small" data-action="back-to-cv">Back to my CV</button>`}
          </div>
        </div>`}
      ${state.outcome.error ? errorBody(state) : resultBody(state)}
      <label class="btn block file-btn">
        ${icon('upload')} Check a different file
        <input type="file" class="visually-hidden" accept="${DOC_KINDS.cv.accept}" data-check-file>
      </label>
      <p class="hint center">PDF or Word (.docx). It’s checked here and not saved.</p>
    </main>
  `);

  wireBack(screen, '/profile');

  screen.addEventListener('click', async (event) => {
    const ignore = event.target.closest('[data-ignore]');
    const restore = event.target.closest('[data-restore]');
    const action = event.target.closest('[data-action]')?.dataset.action;

    if (ignore || restore) {
      const id = ignore ? ignore.dataset.ignore : restore.dataset.restore;
      if (ignore) state.ignored.add(id);
      else state.ignored.delete(id);
      await remember(state);
      showResult(state, ctx, window.scrollY);
      if (ignore) {
        showToast('Ignored. It no longer counts against your score.', {
          actionLabel: 'Undo',
          onAction: async () => {
            state.ignored.delete(id);
            await remember(state);
            showResult(state, ctx, window.scrollY);
          },
        });
      }
    } else if (action === 'use-file') {
      try {
        await saveDocumentFile('cv', state.other.file);
        showToast('Saved as your CV');
        await renderCvCheck(ctx);
      } catch (error) {
        showToast(error.message);
      }
    } else if (action === 'back-to-cv') {
      await renderCvCheck(ctx);
    }
  });

  screen.querySelector('[data-check-file]').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_DOC_BYTES) {
      showToast('That file is over 10 MB. Try a smaller copy.');
      return;
    }
    mount(loadingScreen(file.name), ctx);
    const outcome = await runCheck(await file.arrayBuffer(), file.name, state.linkedin, state.profile);
    showResult({ ...state, other: { name: file.name, file }, file, outcome, ignored: new Set() }, ctx);
  });

  mount(screen, ctx, scrollY);
}

function errorBody(state) {
  return html`
    <section class="panel">
      <h2 class="callout-title danger-text">${icon('info')} This file couldn’t be checked</h2>
      <p>${readErrorMessage(state.outcome.error)}</p>
      <p class="hint">${state.file.name}</p>
    </section>`;
}

function resultBody(state) {
  const { doc, result } = state.outcome;
  const unreadable = result.status === 'unreadable';
  const active = result.fixes.filter((fix) => !state.ignored.has(fix.id));
  const hidden = result.fixes.filter((fix) => state.ignored.has(fix.id));
  const { score, label } = scoreOf(state);
  const tone = unreadable || score < 50 ? 'low' : score < 70 ? 'mid' : score < 85 ? 'good' : 'top';
  const meta = [state.file.name, doc.pages ? plural(doc.pages, 'page') : '', `about ${result.stats.words} words`].filter(Boolean).join(' · ');
  const strongCount = result.strengths.length;

  return html`
    <section class="panel score-card tone-${tone}" aria-label="CV score">
      <div class="score-ring" style="--score: ${score}" role="img" aria-label="${score} out of 100">
        <span class="score-value" aria-hidden="true">${score}</span>
        <span class="score-max" aria-hidden="true">out of 100</span>
      </div>
      <div class="score-text">
        <p class="score-label">${label}</p>
        <p class="score-counts">${plural(active.length, 'thing')} to fix${strongCount > 0 && ` · ${strongCount} strong`}</p>
        <p class="score-file">${meta}</p>
      </div>
    </section>
    <p class="privacy-note">${icon('info')} The score is a guide to how easily job portals and recruiters can read your CV, not a prediction of whether you’ll get the job. What works best differs by country and industry.</p>
    <p class="privacy-note">${icon('shield')} Checked on this device with ${result.checks} checks. Your CV wasn’t uploaded.</p>

    ${active.length > 0 && html`
      <section class="group" aria-labelledby="fix-heading">
        <h2 class="group-title" id="fix-heading">To fix, most important first</h2>
        <ul class="check-list">${active.map((fix, i) => fixItem(fix, i === 0, unreadable, doc.pages))}</ul>
      </section>`}
    ${active.length === 0 && html`
      <div class="panel calm">
        <p><strong>Nothing left to fix.</strong></p>
        <p class="muted">Your CV passed every check that runs on this device.</p>
      </div>`}

    ${strongCount > 0 && html`
      <section class="group" aria-labelledby="strong-heading">
        <h2 class="group-title" id="strong-heading">What’s strong</h2>
        <ul class="panel strong-list">
          ${result.strengths.map((item) => html`
            <li>${icon('check')}<span><strong>${item.title}</strong><span class="muted">${item.detail}</span></span></li>`)}
        </ul>
      </section>`}

    ${hidden.length > 0 && html`
      <details class="more ignored">
        <summary>Ignored suggestions (${hidden.length})</summary>
        <ul class="ignored-list">
          ${hidden.map((fix) => html`
            <li><span>${fix.title}</span><button type="button" class="text-btn small" data-restore="${fix.id}">Bring back</button></li>`)}
        </ul>
      </details>`}

    <section class="panel">
      <h2 class="panel-title">${icon('info')} Coming with the AI review</h2>
      <ul class="plain-list">
        <li>Rewrites of weak lines that you can accept or ignore</li>
        <li>A full spelling and grammar check</li>
        <li>Checking your CV against a job you want</li>
      </ul>
      <p class="hint">These need the app’s online AI service, which isn’t switched on yet. Your CV will only be sent to it if you agree.</p>
    </section>`;
}

function fixItem(fix, open, unreadable, pages) {
  const severity = SEVERITIES[fix.severity];
  return html`
    <li>
      <details class="check-item sev-${fix.severity}" ${open && raw('open')}>
        <summary class="check-summary">
          <span class="sev-dot" aria-hidden="true"></span>
          <span class="check-head">
            <span class="check-title">${fix.title}</span>
            <span class="sev-label">${severity.label}</span>
          </span>
          <span class="day-chevron">${icon('chevronDown')}</span>
        </summary>
        <div class="check-body">
          <p>${fix.detail}</p>
          ${fix.quotes.length > 0 && html`
            <p class="quote-label">${NOT_ON_CV.has(fix.id) ? 'Not on your CV' : 'In your CV'}</p>
            <ul class="quotes">
              ${fix.quotes.map((quote) => html`
                <li>${quote.text}${quote.page > 0 && pages > 1 && html` <span class="quote-page">(page ${quote.page})</span>`}</li>`)}
            </ul>
            ${fix.more > 0 && html`<p class="hint">…and ${fix.more} more like ${fix.more === 1 ? 'this' : 'these'}.</p>`}`}
          <div class="tip">
            <p class="tip-title">Try this</p>
            <p>${fix.tip}</p>
          </div>
          ${!unreadable && html`<button type="button" class="text-btn small" data-ignore="${fix.id}">Ignore this suggestion</button>`}
        </div>
      </details>
    </li>`;
}
