// Form field helpers shared by the application form and the profile form.

import { html } from '../ui.js';

/** A labelled field with optional hint and a hidden error line. `control` is the input html. */
export function field(name, label, control, { required = false, hint = '' } = {}) {
  return html`
    <div class="field" data-field="${name}">
      <label for="f-${name}">${label}${required && html`<span class="req" aria-hidden="true"> *</span>`}</label>
      ${control}
      ${hint && html`<p class="hint" id="f-${name}-hint">${hint}</p>`}
      <p class="error" id="f-${name}-error" hidden></p>
    </div>`;
}

/** Links each hint to its input so screen readers read it out. */
export function linkHints(root) {
  for (const fieldEl of root.querySelectorAll('.field')) {
    const hint = fieldEl.querySelector('.hint[id]');
    const control = fieldEl.querySelector('input, select, textarea');
    if (hint && control) control.setAttribute('aria-describedby', hint.id);
  }
}

/** Shows or clears the error message under a field. */
export function setFieldError(fieldEl, message) {
  const control = fieldEl.querySelector(`[name="${fieldEl.dataset.field}"]`);
  const errorEl = fieldEl.querySelector('.error');
  const hintId = fieldEl.querySelector('.hint')?.id;

  errorEl.textContent = message;
  errorEl.hidden = !message;
  if (!control) return;

  if (message) {
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', [errorEl.id, hintId].filter(Boolean).join(' '));
  } else {
    control.removeAttribute('aria-invalid');
    if (hintId) control.setAttribute('aria-describedby', hintId);
    else control.removeAttribute('aria-describedby');
  }
}
