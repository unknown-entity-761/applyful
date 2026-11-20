// Edit profile: about you, summary, experience, education, skills and contact.
// Experience and education are lists you can add to and remove from.

import { html, raw, icon, createScreen, mount, showToast } from '../ui.js';
import {
  getProfile,
  saveProfile,
  normalizeProfile,
  validateProfile,
  blankJob,
  blankEducation,
  MAX_NAME_LENGTH,
} from '../profile.js';
import { back } from '../router.js';
import { field, setFieldError, linkHints } from './fields.js';

export async function renderProfileEdit(ctx) {
  const profile = await getProfile();

  const screen = createScreen(html`
    <header class="topbar">
      <button type="button" class="text-btn" data-action="cancel">Cancel</button>
      <h1 class="topbar-title" tabindex="-1">Edit profile</h1>
      <span aria-hidden="true"></span>
    </header>
    <main class="content">
      <form class="form" novalidate>
        ${group('about', 'About you', html`
          <div class="two-col">
            ${field('firstName', 'First name', html`
              <input id="f-firstName" name="firstName" type="text" value="${profile.firstName}"
                     autocomplete="given-name" autocapitalize="words" maxlength="${MAX_NAME_LENGTH}">`)}
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

        ${group('experience', 'Experience', html`
          <div class="repeat-list" data-list="experience">${profile.experience.map(jobFields)}</div>
          <button type="button" class="btn block" data-add="experience">${icon('plus')} Add a role</button>`)}

        ${group('education', 'Education', html`
          <div class="repeat-list" data-list="education">${profile.education.map(educationFields)}</div>
          <button type="button" class="btn block" data-add="education">${icon('plus')} Add education</button>`)}

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
          <button type="submit" class="btn primary block">Save profile</button>
        </div>
      </form>
    </main>
  `);

  const form = screen.querySelector('form');
  let dirty = false;
  linkHints(form);

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
      const kind = addButton.dataset.add;
      const list = form.querySelector(`[data-list="${kind}"]`);
      const markup = kind === 'experience' ? jobFields(blankJob()) : educationFields(blankEducation());
      list.insertAdjacentHTML('beforeend', String(markup));
      list.lastElementChild.querySelector('input')?.focus();
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
    if (dirty && !window.confirm('Discard your changes?')) return;
    back('/profile');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const draft = normalizeProfile({
      ...profile,
      ...Object.fromEntries(new FormData(form)),
      experience: readItems(form, 'experience'),
      education: readItems(form, 'education'),
    });
    const errors = validateProfile(draft);

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
    showToast('Profile saved');
    back('/profile');
  });

  mount(screen, ctx);
}

function group(id, title, body) {
  return html`
    <div class="form-section" role="group" aria-labelledby="sec-${id}">
      <h2 class="panel-title" id="sec-${id}">${title}</h2>
      ${body}
    </div>`;
}

/** Reads every entry in an experience or education list from its inputs. */
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

function jobFields(job) {
  const p = `exp-${job.id}`;
  return html`
    <div class="repeat-item" data-id="${job.id}">
      <div class="repeat-head">
        <span class="repeat-title">Role</span>
        <button type="button" class="text-btn small danger-text" data-remove>Remove</button>
      </div>
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
        <textarea id="${p}-description" data-key="description" rows="3" maxlength="2000"
                  placeholder="Main responsibilities and results, with numbers if you can">${job.description}</textarea>`)}
    </div>`;
}

function educationFields(item) {
  const p = `edu-${item.id}`;
  return html`
    <div class="repeat-item" data-id="${item.id}">
      <div class="repeat-head">
        <span class="repeat-title">Education</span>
        <button type="button" class="text-btn small danger-text" data-remove>Remove</button>
      </div>
      ${subField(p, 'qualification', 'Qualification', textInput(p, 'qualification', item.qualification, 'maxlength="120" placeholder="Bachelor of Commerce"'))}
      ${subField(p, 'school', 'School or university', textInput(p, 'school', item.school, 'autocapitalize="words" maxlength="120"'))}
      <div class="two-col">
        ${subField(p, 'start', 'Start', monthInput(p, 'start', item.start))}
        ${subField(p, 'end', 'End', monthInput(p, 'end', item.end))}
      </div>
    </div>`;
}
