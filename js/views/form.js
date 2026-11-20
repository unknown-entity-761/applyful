// Add / Edit screen: one short form. Only company and job title are required.

import { html, raw, createScreen, mount, notFoundScreen, todayISO, addDays, showToast } from '../ui.js';
import { getApplication, listApplications, saveApplication, requestPersistence } from '../store.js';
import { STATUSES, PORTALS, blankApplication, normalize, validate, withStatus, recentValues } from '../model.js';
import { back, navigate } from '../router.js';
import { field, setFieldError, linkHints } from './fields.js';

export async function renderForm({ id } = {}, ctx) {
  const isEdit = Boolean(id);
  const [existing, all] = await Promise.all([isEdit ? getApplication(id) : null, listApplications()]);
  if (isEdit && !existing) {
    mount(notFoundScreen(), ctx);
    return;
  }

  const original = existing ?? blankApplication();
  // Keep a portal name from an older backup selectable even if it isn't in today's list.
  const portals = original.portal && !PORTALS.includes(original.portal) ? [...PORTALS, original.portal] : PORTALS;
  const detailPath = `/a/${encodeURIComponent(original.id)}`;

  const screen = createScreen(html`
    <header class="topbar">
      <button type="button" class="text-btn" data-action="cancel">Cancel</button>
      <h1 class="topbar-title" tabindex="-1">${isEdit ? 'Edit application' : 'New application'}</h1>
      <span aria-hidden="true"></span>
    </header>
    <main class="content">
      <form class="form" novalidate>
        ${field('company', 'Company', html`
          <input id="f-company" name="company" type="text" value="${original.company}" required
                 autocomplete="organization" autocapitalize="words" list="company-options" enterkeyhint="next">`,
          { required: true })}

        ${field('title', 'Job title', html`
          <input id="f-title" name="title" type="text" value="${original.title}" required
                 autocapitalize="words" enterkeyhint="next">`,
          { required: true })}

        ${field('status', 'Status', html`
          <select id="f-status" name="status">
            ${STATUSES.map((s) => html`<option value="${s.id}" ${s.id === original.status && raw('selected')}>${s.label}</option>`)}
          </select>`)}

        ${field('portal', 'Portal', html`
          <select id="f-portal" name="portal">
            <option value="">Not set</option>
            ${portals.map((p) => html`<option value="${p}" ${p === original.portal && raw('selected')}>${p}</option>`)}
          </select>`,
          { hint: 'Where you applied, like Workday or SuccessFactors.' })}

        ${field('loginEmail', 'Login email used', html`
          <input id="f-loginEmail" name="loginEmail" type="email" value="${original.loginEmail}"
                 inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" list="email-options">`,
          { hint: 'The email you signed up to this portal with. Keep passwords in a password manager, not here.' })}

        ${field('postingUrl', 'Job posting link', html`
          <input id="f-postingUrl" name="postingUrl" type="url" value="${original.postingUrl}"
                 inputmode="url" autocapitalize="off" spellcheck="false" placeholder="https://">`)}

        ${field('appliedOn', 'Date applied', html`
          <input id="f-appliedOn" name="appliedOn" type="date" value="${original.appliedOn}">`)}

        ${field('followUpOn', 'Follow-up date', html`
          <input id="f-followUpOn" name="followUpOn" type="date" value="${original.followUpOn}">
          <div class="quick-picks" role="group" aria-label="Quick follow-up dates">
            <button type="button" class="chip" data-days="3">In 3 days</button>
            <button type="button" class="chip" data-days="7">In 1 week</button>
            <button type="button" class="chip" data-days="14">In 2 weeks</button>
            <button type="button" class="chip" data-days="clear">Clear</button>
          </div>`)}

        ${field('notes', 'Notes', html`
          <textarea id="f-notes" name="notes" rows="4"
                    placeholder="Recruiter name, referral, interview prep…">${original.notes}</textarea>`)}

        <div class="form-actions">
          <button type="submit" class="btn primary block">${isEdit ? 'Save changes' : 'Save application'}</button>
        </div>
      </form>
      <datalist id="company-options">${recentValues(all, 'company').map((v) => html`<option value="${v}"></option>`)}</datalist>
      <datalist id="email-options">${recentValues(all, 'loginEmail').map((v) => html`<option value="${v}"></option>`)}</datalist>
    </main>
  `);

  const form = screen.querySelector('form');
  const submitButton = form.querySelector('[type="submit"]');
  let dirty = false;

  linkHints(form);

  form.addEventListener('input', (event) => {
    dirty = true;
    const fieldEl = event.target.closest('.field');
    if (fieldEl && event.target.getAttribute('aria-invalid') === 'true') setFieldError(fieldEl, '');
  });

  form.querySelector('.quick-picks').addEventListener('click', (event) => {
    const button = event.target.closest('[data-days]');
    if (!button) return;
    form.elements.followUpOn.value = button.dataset.days === 'clear' ? '' : addDays(todayISO(), Number(button.dataset.days));
    dirty = true;
  });

  screen.querySelector('[data-action="cancel"]').addEventListener('click', () => {
    if (dirty && !window.confirm('Discard your changes?')) return;
    back(isEdit ? detailPath : '/');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const draft = normalize({ ...original, ...Object.fromEntries(new FormData(form)) });
    const errors = validate(draft);

    for (const fieldEl of form.querySelectorAll('.field')) setFieldError(fieldEl, errors[fieldEl.dataset.field] ?? '');
    if (Object.keys(errors).length > 0) {
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    const record = isEdit
      ? withStatus({ ...draft, status: original.status }, draft.status) // records a status change in history
      : { ...draft, statusHistory: [{ status: draft.status, at: draft.createdAt }] };

    submitButton.disabled = true;
    try {
      await saveApplication(record);
    } catch (error) {
      console.error(error);
      submitButton.disabled = false;
      showToast('Couldn’t save. Please try again.');
      return;
    }

    dirty = false;
    if (!isEdit && all.length === 0) requestPersistence().catch(() => {}); // first application: ask to keep data
    showToast(isEdit ? 'Changes saved' : 'Application added');
    if (isEdit) back(detailPath);
    else navigate(detailPath, { replace: true });
  });

  mount(screen, ctx);
}
