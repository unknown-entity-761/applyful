// Cover letters (version 6):
//   #/letters                the Letters tab: every letter, newest first, with search
//   #/letters/new            write a new letter
//   #/letters/new/:appId     write one for an application (it's linked, and its company
//                            and job title are filled in)
//   #/letters/:id            read, edit, link, copy, download for Word, print or save as
//                            PDF, use as a starting point, delete
// Writing with AI is version 5 (on hold). For now: write, paste, or start from a
// template with [prompts] for the parts only you can write.

import { html, raw, icon, createScreen, mount, showToast, formatTimestamp, plural, notFoundScreen } from '../ui.js';
import { listApplications, getApplication } from '../store.js';
import { getProfile } from '../profile.js';
import {
  normalizeLetter, letterLabel, listLetters, getLetter, saveLetter, deleteLetter, searchLetters,
  letterTemplate, unfilledPrompts, downloadWord, printLetter, MAX_LETTER_LENGTH,
} from '../letters.js';
import { makeId } from '../model.js';
import { navigate, back } from '../router.js';
import { tabBar, subHeader } from './components.js';
import { field, linkHints } from './fields.js';

let query = ''; // kept while the app is open, like the Jobs search

// ---- The Letters tab ----

export async function renderLetters(ctx) {
  const [letters, apps] = await Promise.all([listLetters(), listApplications()]);
  const appsById = new Map(apps.map((app) => [app.id, app]));

  const screen = createScreen(html`
    <header class="topbar topbar-large">
      <h1 class="topbar-title" tabindex="-1">Cover letters</h1>
      <a class="btn small primary header-action" href="#/letters/new">${icon('plus')} New</a>
    </header>
    <main class="content">
      ${letters.length === 0
        ? html`
          <div class="empty">
            <div class="empty-icon">${icon('letter')}</div>
            <h2>No cover letters yet</h2>
            <p>Keep every cover letter here, each linked to the applications you sent it with. Write a new one, paste one you’ve sent, or start from a template.</p>
            <a class="btn primary" href="#/letters/new">Write a cover letter</a>
          </div>`
        : html`
          <label class="search">
            ${icon('search')}
            <span class="visually-hidden">Search cover letters</span>
            <input type="search" value="${query}" placeholder="Search company, job title or application" autocomplete="off" enterkeyhint="search">
          </label>
          <ul class="letter-list" aria-live="polite"></ul>`}
    </main>
    ${tabBar('letters')}
  `);

  const list = screen.querySelector('.letter-list');
  const show = () => {
    if (!list) return;
    const found = searchLetters(letters, query, appsById);
    list.innerHTML = found.length
      ? String(html`${found.map((letter) => letterCard(letter, appsById))}`)
      : String(html`<li class="muted">No cover letters match “${query}”.</li>`);
  };
  show();
  screen.querySelector('input[type="search"]')?.addEventListener('input', (event) => {
    query = event.target.value;
    show();
  });
  mount(screen, ctx);
}

function letterCard(letter, appsById) {
  const linked = letter.appIds.map((id) => appsById.get(id)).filter(Boolean);
  const words = letter.body.trim() ? letter.body.trim().split(/\s+/).length : 0;
  return html`
    <li>
      <a class="letter-card" href="#/letters/${encodeURIComponent(letter.id)}">
        <span class="letter-card-title">${letterLabel(letter)}</span>
        <span class="letter-card-meta">${linked.length ? `Linked to ${plural(linked.length, 'application')}` : 'Not linked to an application'} · ${plural(words, 'word')}</span>
        <span class="letter-card-meta">Changed ${formatTimestamp(letter.updatedAt)}</span>
      </a>
    </li>`;
}

// ---- Writing and editing ----

export async function renderLetterEditor({ id, appId } = {}, ctx) {
  const isNew = !id;
  const [existing, apps, profile] = await Promise.all([isNew ? null : getLetter(id), listApplications(), getProfile()]);
  if (!isNew && !existing) {
    mount(notFoundScreen(), ctx);
    return;
  }
  const forApp = appId ? await getApplication(appId) : null;
  const letter = existing ?? normalizeLetter({ company: forApp?.company, jobTitle: forApp?.title, appIds: forApp ? [forApp.id] : [] });
  const sorted = [...apps].sort((a, b) => a.company.localeCompare(b.company) || a.title.localeCompare(b.title));
  const backTo = forApp ? `/a/${encodeURIComponent(forApp.id)}` : '/letters';

  const screen = createScreen(html`
    ${subHeader(isNew ? 'New cover letter' : 'Cover letter', html`<button type="submit" form="letter-form" class="text-btn">Save</button>`)}
    <main class="content">
      <form class="form" id="letter-form" novalidate>
        ${field('company', 'Company', html`<input id="f-company" name="company" type="text" value="${letter.company}" autocomplete="off">`)}
        ${field('jobTitle', 'Job title', html`<input id="f-jobTitle" name="jobTitle" type="text" value="${letter.jobTitle}" autocomplete="off">`)}

        <details class="more link-apps" ${letter.appIds.length > 0 && raw('open')}>
          <summary>Linked applications (<span data-linked-count>${letter.appIds.length}</span>)</summary>
          ${sorted.length
            ? html`
              <div class="checklist" role="group" aria-label="Applications this letter was sent with">
                ${sorted.map((app) => html`
                  <label class="check">
                    <input type="checkbox" name="appIds" value="${app.id}" ${letter.appIds.includes(app.id) && raw('checked')}>
                    <span>${app.company} · ${app.title}</span>
                  </label>`)}
              </div>`
            : html`<p class="muted">No applications yet. Add one in Jobs, then link it here.</p>`}
        </details>

        ${field('body', 'Letter', html`
          <textarea id="f-body" name="body" rows="16" maxlength="${MAX_LETTER_LENGTH}"
                    placeholder="Write or paste your cover letter here.">${letter.body}</textarea>`,
          { hint: 'Blank lines start new paragraphs.' })}
        <p class="warning prompts-left" data-prompts hidden></p>

        <div class="stack">
          <button type="button" class="btn block" data-action="template">${icon('pencil')} Start from a template</button>
          <button type="submit" class="btn primary block">Save cover letter</button>
        </div>
        <p class="hint">The template uses your profile and the job’s details. The parts only you can write are in [square brackets]. Writing letters with AI comes later.</p>
      </form>

      ${!isNew && html`
        <section class="panel" aria-labelledby="letter-actions">
          <h2 class="panel-title" id="letter-actions">Use it</h2>
          <div class="stack">
            <button type="button" class="btn block" data-action="copy">${icon('copy')} Copy the text</button>
            <button type="button" class="btn block" data-action="word">${icon('download')} Download for Word</button>
            <button type="button" class="btn block" data-action="print">${icon('file')} Print or save as PDF</button>
            <button type="button" class="btn block" data-action="duplicate">${icon('plus')} Use as a starting point</button>
            <button type="button" class="btn danger-outline block" data-action="delete">${icon('trash')} Delete</button>
          </div>
          <p class="muted">Written ${formatTimestamp(letter.createdAt)} · changed ${formatTimestamp(letter.updatedAt)}</p>
        </section>`}
    </main>
  `);

  const form = screen.querySelector('form');
  linkHints(form);
  let dirty = false;
  const body = form.elements.body;
  const prompts = screen.querySelector('[data-prompts]');
  const showPrompts = () => {
    const left = unfilledPrompts(body.value);
    prompts.hidden = left.length === 0;
    prompts.textContent = left.length ? `${plural(left.length, 'part')} in [square brackets] still to fill in.` : '';
  };
  showPrompts();

  const current = () => normalizeLetter({
    ...letter,
    company: form.elements.company.value,
    jobTitle: form.elements.jobTitle.value,
    body: body.value,
    appIds: [...form.querySelectorAll('input[name="appIds"]:checked')].map((input) => input.value),
  });

  form.addEventListener('input', () => {
    dirty = true;
    showPrompts();
  });
  form.addEventListener('change', (event) => {
    if (event.target.name !== 'appIds') return;
    dirty = true;
    screen.querySelector('[data-linked-count]').textContent = String(form.querySelectorAll('input[name="appIds"]:checked').length);
    // Linking the first application fills in its company and job title, if they're empty.
    const app = event.target.checked && apps.find((a) => a.id === event.target.value);
    if (app && !form.elements.company.value.trim()) form.elements.company.value = app.company;
    if (app && !form.elements.jobTitle.value.trim()) form.elements.jobTitle.value = app.title;
  });

  screen.querySelector('[data-action="back"]').addEventListener('click', () => {
    if (dirty && !window.confirm('Leave without saving your changes?')) return;
    back(backTo);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const draft = current();
    if (!draft.body.trim() && !draft.company && !draft.jobTitle) {
      showToast('Write something first.');
      return;
    }
    const saved = await saveLetter(draft);
    dirty = false;
    showToast('Cover letter saved');
    if (isNew) navigate(`/letters/${encodeURIComponent(saved.id)}`, { replace: true });
    else renderLetterEditor({ id: saved.id }, { active: true });
  });

  screen.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    switch (action) {
      case 'template': {
        if (body.value.trim() && !window.confirm('Replace what’s in the letter with the template?')) return;
        const job = { company: form.elements.company.value.trim(), title: form.elements.jobTitle.value.trim() };
        body.value = letterTemplate(profile, job);
        dirty = true;
        showPrompts();
        body.focus();
        break;
      }
      case 'copy':
        try {
          await navigator.clipboard.writeText(current().body);
          showToast('Copied');
        } catch {
          showToast('Couldn’t copy. Select the text and copy it instead.');
        }
        break;
      case 'word':
        downloadWord(current());
        break;
      case 'print':
        if (!printLetter(current())) showToast('Your browser blocked the print window. Allow pop-ups for Foliofy and try again.', { duration: 6000 });
        break;
      case 'duplicate': {
        const copyOf = await saveLetter({ ...current(), id: makeId(), appIds: [], createdAt: undefined });
        showToast('A copy is ready to edit');
        navigate(`/letters/${encodeURIComponent(copyOf.id)}`);
        break;
      }
      case 'delete':
        if (!window.confirm(`Delete this cover letter (${letterLabel(letter)})? This can’t be undone.`)) return;
        await deleteLetter(letter.id);
        showToast('Cover letter deleted');
        navigate('/letters', { replace: true });
        break;
      default:
        break;
    }
  });

  mount(screen, ctx);
}

/** The Cover letters part of an application's page. */
export function lettersPanel(app, letters) {
  return html`
    <section class="panel" aria-labelledby="app-letters">
      <h2 class="panel-title" id="app-letters">Cover letters</h2>
      ${letters.length
        ? html`<ul class="letter-links">${letters.map((letter) => html`
            <li><a href="#/letters/${encodeURIComponent(letter.id)}">${letterLabel(letter)}</a> <span class="muted">· ${formatTimestamp(letter.updatedAt)}</span></li>`)}</ul>`
        : html`<p class="muted">None linked yet.</p>`}
      <a class="btn block" href="#/letters/new/${encodeURIComponent(app.id)}">${icon('letter')} Write a cover letter</a>
    </section>`;
}
