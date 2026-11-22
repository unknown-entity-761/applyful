// Edit profile: about you, summary, experience, education, projects, certifications,
// skills and contact. The lists can be added to and removed from.
//
// The same screen is the review step after reading a CV or LinkedIn PDF
// (views/profile-import.js): it opens with what was found already filled in and
// highlighted, and nothing is saved until you tap Save.
//
// It's also the form at the end of first-time setup (views/welcome.js, setup: true):
// first name is required, the button says Confirm, and it goes to Home afterwards.

import { html, raw, icon, createScreen, mount, showToast } from '../ui.js';
import {
  getProfile,
  saveProfile,
  normalizeProfile,
  validateProfile,
  blankJob,
  blankEducation,
  blankProject,
  blankCertification,
  MAX_NAME_LENGTH,
  markSetupDone,
} from '../profile.js';
import { back, navigate } from '../router.js';
import { field, setFieldError, linkHints } from './fields.js';

const LISTS = {
  experience: { blank: blankJob, fields: jobFields, add: 'Add a role' },
  education: { blank: blankEducation, fields: educationFields, add: 'Add education' },
  projects: { blank: blankProject, fields: projectFields, add: 'Add a project' },
  certifications: { blank: blankCertification, fields: certificationFields, add: 'Add a certification' },
};

/**
 * review (optional): { draft, filled, sourceLabel, fileName, found, ocr }
 *   draft  the profile with what was read already merged in (not saved yet)
 *   filled what came from the file: { fields: [...], skills: [...], items: Set of ids }
 */
export async function renderProfileEdit(ctx, review = null, { setup = false } = {}) {
  const profile = review ? review.draft : await getProfile();
  const saveLabel = setup ? 'Confirm' : 'Save profile';

  const screen = createScreen(html`
    <header class="topbar">
      <button type="button" class="text-btn" data-action="cancel">${setup ? 'Back' : 'Cancel'}</button>
      <h1 class="topbar-title" tabindex="-1">${setup ? 'Your details' : review ? 'Check your profile' : 'Edit profile'}</h1>
      <span aria-hidden="true"></span>
    </header>
    <main class="content">
      ${review && html`
        <div class="callout info" role="note">
          <p class="callout-title">${icon('file')} Filled in from your ${review.sourceLabel}</p>
          <p>${review.found}</p>
          <p>Check the highlighted parts and fix anything that’s wrong. Nothing is saved until you tap <strong>${saveLabel}</strong>.${review.ocr ? ' This CV was a scanned image, so look out for misread letters.' : ''}</p>
        </div>`}
      ${setup && !review && html`
        <div class="callout info" role="note">
          <p class="callout-title">${icon('pencil')} Add your details</p>
          <p>Only your first name is needed now. You can add the rest any time on the Profile tab.</p>
        </div>`}
      <form class="form" novalidate>
        ${group('about', 'About you', html`
          <div class="two-col">
            ${field('firstName', 'First name', html`
              <input id="f-firstName" name="firstName" type="text" value="${profile.firstName}"
                     autocomplete="given-name" autocapitalize="words" maxlength="${MAX_NAME_LENGTH}">`, { required: setup })}
            ${field('lastName', 'Last name', html`
              <input id="f-lastName" name="lastName" type="text" value="${profile.lastName}"
                     autocomplete="family-name" autocapitalize="words" maxlength="60">`)}
          </div>
          ${field('headline', 'Headline', html`
            <input id="f-headline" name="headline" type="text" value="${profile.headline}" maxlength="140"
                   placeholder="Data analyst · SQL, Python, Tableau">`,
            { hint: 'One line that sums up what you do.' })}
          ${field('location', 'Location', html`
            <input id="f-location" name="location" type="text" value="${profile.location}" maxlength="80"
                   autocomplete="address-level2" placeholder="City, country">`)}`)}

        ${group('summary', 'Summary', html`
          ${field('summary', 'About you', html`
            <textarea id="f-summary" name="summary" rows="5"
                      placeholder="A few sentences about your background and what you’re looking for.">${profile.summary}</textarea>`)}
          ${field('targetRoles', 'Roles you want', html`
            <input id="f-targetRoles" name="targetRoles" type="text" value="${profile.targetRoles}" maxlength="300"
                   placeholder="Data analyst, Business analyst">`,
            { hint: 'Job titles you’re aiming for, separated by commas.' })}`)}

        ${Object.entries(LISTS).map(([kind, list]) => group(kind, heading(kind), html`
          <div class="repeat-list" data-list="${kind}">${profile[kind].map(list.fields)}</div>
          <button type="button" class="btn block" data-add="${kind}">${icon('plus')} ${list.add}</button>`))}

        ${group('skills', 'Skills', html`
          ${field('skills', 'Skills', html`
            <textarea id="f-skills" name="skills" rows="3"
                      placeholder="SQL, Excel, Stakeholder management">${profile.skills.join(', ')}</textarea>`,
            { hint: 'Separate skills with commas.' })}`)}

        ${group('contact', 'Contact', html`
          ${field('email', 'Email', html`
            <input id="f-email" name="email" type="email" value="${profile.email}" inputmode="email"
                   autocomplete="email" autocapitalize="off" spellcheck="false">`)}
          ${field('phone', 'Phone', html`
            <input id="f-phone" name="phone" type="tel" value="${profile.phone}" inputmode="tel" autocomplete="tel">`)}
          ${field('linkedinUrl', 'LinkedIn profile link', html`
            <input id="f-linkedinUrl" name="linkedinUrl" type="url" value="${profile.linkedinUrl}" inputmode="url"
                   autocapitalize="off" spellcheck="false" placeholder="https://www.linkedin.com/in/your-name">`)}
          <p class="hint">Saved only on this device. Used later to fill in cover letters.</p>`)}

        <div class="form-actions">
          <button type="submit" class="btn primary block">${saveLabel}</button>
        </div>
      </form>
    </main>
  `);

  const form = screen.querySelector('form');
  let dirty = Boolean(review);
  linkHints(form);
  if (review) markFromFile(form, review);

  form.addEventListener('input', (event) => {
    dirty = true;
    const fieldEl = event.target.closest('.field[data-field]');
    if (fieldEl && event.target.getAttribute('aria-invalid') === 'true') setFieldError(fieldEl, '');
  });

  // "I work here now" turns off the end date.
  form.addEventListener('change', (event) => {
    if (event.target.dataset.key !== 'current') return;
    const end = event.target.closest('.repeat-item').querySelector('[data-key="end"]');
    end.disabled = event.target.checked;
    if (event.target.checked) end.value = '';
    dirty = true;
  });

  form.addEventListener('click', (event) => {
    const addButton = event.target.closest('[data-add]');
    if (addButton) {
      const list = LISTS[addButton.dataset.add];
      const listEl = form.querySelector(`[data-list="${addButton.dataset.add}"]`);
      listEl.insertAdjacentHTML('beforeend', String(list.fields(list.blank())));
      listEl.lastElementChild.querySelector('input')?.focus();
      dirty = true;
      return;
    }
    const removeButton = event.target.closest('[data-remove]');
    if (removeButton) {
      const item = removeButton.closest('.repeat-item');
      const next = item.nextElementSibling ?? item.parentElement.nextElementSibling;
      item.remove();
      next?.focus?.();
      dirty = true;
    }
  });

  screen.querySelector('[data-action="cancel"]').addEventListener('click', () => {
    const question = review ? 'Discard what was read from your file? Your profile stays as it was.' : 'Discard your changes?';
    if (dirty && !window.confirm(question)) return;
    back(setup ? '/welcome' : '/profile');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const draft = normalizeProfile({
      ...profile,
      ...Object.fromEntries(new FormData(form)),
      ...Object.fromEntries(Object.keys(LISTS).map((kind) => [kind, readItems(form, kind)])),
    });
    const errors = validateProfile(draft);
    if (setup && !draft.firstName) errors.firstName = 'Add your first name.';

    for (const fieldEl of form.querySelectorAll('.field[data-field]')) setFieldError(fieldEl, errors[fieldEl.dataset.field] ?? '');
    if (Object.keys(errors).length > 0) {
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    try {
      await saveProfile(draft);
    } catch (error) {
      console.error(error);
      showToast('Couldn’t save. Please try again.');
      return;
    }
    dirty = false;
    if (setup) {
      markSetupDone();
      showToast(`Welcome, ${draft.firstName}. You’re all set.`);
      navigate('/', { replace: true });
      return;
    }
    showToast('Profile saved');
    back('/profile');
  });

  mount(screen, ctx);
}

function heading(kind) {
  return { experience: 'Experience', education: 'Education', projects: 'Projects', certifications: 'Certifications' }[kind];
}

/** Highlights everything that came from the CV or LinkedIn file. */
function markFromFile(form, review) {
  const tag = () => {
    const span = document.createElement('span');
    span.className = 'from-tag';
    span.textContent = `From your ${review.sourceLabel}`;
    return span;
  };
  for (const key of review.filled.fields) {
    const fieldEl = form.querySelector(`.field[data-field="${key}"]`);
    if (!fieldEl) continue;
    fieldEl.classList.add('from-file');
    fieldEl.querySelector('label')?.append(' ', tag());
  }
  if (review.filled.skills.length) {
    const fieldEl = form.querySelector('.field[data-field="skills"]');
    fieldEl.classList.add('from-file');
    fieldEl.querySelector('label')?.append(' ', tag());
  }
  for (const id of review.filled.items) {
    const item = form.querySelector(`.repeat-item[data-id="${CSS.escape(id)}"]`);
    if (!item) continue;
    item.classList.add('from-file');
    item.querySelector('.repeat-title')?.append(' ', tag());
  }
}

function group(id, title, body) {
  return html`
    <div class="form-section" role="group" aria-labelledby="sec-${id}">
      <h2 class="panel-title" id="sec-${id}">${title}</h2>
      ${body}
    </div>`;
}

/** Reads every entry in one of the lists from its inputs. */
function readItems(form, kind) {
  return [...form.querySelectorAll(`[data-list="${kind}"] .repeat-item`)].map((item) => ({
    id: item.dataset.id,
    ...Object.fromEntries(
      [...item.querySelectorAll('[data-key]')].map((el) => [el.dataset.key, el.type === 'checkbox' ? el.checked : el.value]),
    ),
  }));
}

function subField(prefix, key, label, control) {
  return html`
    <div class="field">
      <label for="${prefix}-${key}">${label}</label>
      ${control}
    </div>`;
}

function textInput(prefix, key, value, extra = '') {
  return html`<input id="${prefix}-${key}" data-key="${key}" type="text" value="${value}" ${raw(extra)}>`;
}

function monthInput(prefix, key, value, disabled = false) {
  return html`<input id="${prefix}-${key}" data-key="${key}" type="month" value="${value}" placeholder="YYYY-MM" ${disabled && raw('disabled')}>`;
}

function itemHead(title) {
  return html`
    <div class="repeat-head">
      <span class="repeat-title">${title}</span>
      <button type="button" class="text-btn small danger-text" data-remove>Remove</button>
    </div>`;
}

function jobFields(job) {
  const p = `exp-${job.id}`;
  return html`
    <div class="repeat-item" data-id="${job.id}">
      ${itemHead('Role')}
      ${subField(p, 'title', 'Job title', textInput(p, 'title', job.title, 'autocapitalize="words" maxlength="120"'))}
      ${subField(p, 'company', 'Company', textInput(p, 'company', job.company, 'autocapitalize="words" maxlength="120"'))}
      <div class="two-col">
        ${subField(p, 'start', 'Start', monthInput(p, 'start', job.start))}
        ${subField(p, 'end', 'End', monthInput(p, 'end', job.end, job.current))}
      </div>
      <label class="check">
        <input type="checkbox" data-key="current" ${job.current && raw('checked')}> I work here now
      </label>
      ${subField(p, 'description', 'What you did', html`
        <textarea id="${p}-description" data-key="description" rows="4" maxlength="2000"
                  placeholder="Main responsibilities and results, with numbers if you can">${job.description}</textarea>`)}
    </div>`;
}

function educationFields(item) {
  const p = `edu-${item.id}`;
  return html`
    <div class="repeat-item" data-id="${item.id}">
      ${itemHead('Education')}
      ${subField(p, 'qualification', 'Qualification', textInput(p, 'qualification', item.qualification, 'maxlength="120" placeholder="Bachelor of Commerce"'))}
      ${subField(p, 'school', 'School or university', textInput(p, 'school', item.school, 'autocapitalize="words" maxlength="120"'))}
      <div class="two-col">
        ${subField(p, 'start', 'Start', monthInput(p, 'start', item.start))}
        ${subField(p, 'end', 'End', monthInput(p, 'end', item.end))}
      </div>
    </div>`;
}

function projectFields(item) {
  const p = `prj-${item.id}`;
  return html`
    <div class="repeat-item" data-id="${item.id}">
      ${itemHead('Project')}
      ${subField(p, 'name', 'Project name', textInput(p, 'name', item.name, 'maxlength="120" placeholder="Sales dashboard"'))}
      ${subField(p, 'link', 'Link (optional)', html`
        <input id="${p}-link" data-key="link" type="url" value="${item.link}" inputmode="url" autocapitalize="off"
               spellcheck="false" maxlength="300" placeholder="https://github.com/you/project">`)}
      <div class="two-col">
        ${subField(p, 'start', 'Start', monthInput(p, 'start', item.start))}
        ${subField(p, 'end', 'End', monthInput(p, 'end', item.end))}
      </div>
      ${subField(p, 'description', 'What it was and what you did', html`
        <textarea id="${p}-description" data-key="description" rows="3" maxlength="2000"
                  placeholder="The problem, what you built, and the result">${item.description}</textarea>`)}
    </div>`;
}

function certificationFields(item) {
  const p = `crt-${item.id}`;
  return html`
    <div class="repeat-item" data-id="${item.id}">
      ${itemHead('Certification')}
      ${subField(p, 'name', 'Certification', textInput(p, 'name', item.name, 'maxlength="160" placeholder="Google Data Analytics Certificate"'))}
      <div class="two-col">
        ${subField(p, 'issuer', 'Issued by', textInput(p, 'issuer', item.issuer, 'autocapitalize="words" maxlength="120" placeholder="Coursera"'))}
        ${subField(p, 'issued', 'Issued', monthInput(p, 'issued', item.issued))}
      </div>
      ${subField(p, 'link', 'Credential link (optional)', html`
        <input id="${p}-link" data-key="link" type="url" value="${item.link}" inputmode="url" autocapitalize="off"
               spellcheck="false" maxlength="300">`)}
    </div>`;
}
