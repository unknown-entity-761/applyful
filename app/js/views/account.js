// Account screens (version 4), opened from Settings → Account:
//   #/account               signed out: why sign in, and the two ways in; signed in: who you are, sign out
//   #/account/sign-up       email, password, and what you agree to (age, terms, emails)
//   #/account/log-in        email and password, with Forgot password
//   #/account/reset         ask for a password reset email
//   #/account/new-password  set a new password, after opening the reset email
// Signing in is optional: everything works without it.

import { html, icon, createScreen, mount, showToast } from '../ui.js';
import {
  currentUser,
  dataHome,
  signUp,
  resendConfirmation,
  logIn,
  sendPasswordReset,
  setNewPassword,
  signOut,
  MIN_PASSWORD_LENGTH,
  MIN_AGE,
} from '../auth.js';
import { navigate } from '../router.js';
import { syncNow, syncStatus } from '../sync.js';
import { field, setFieldError, linkHints } from './fields.js';
import { subHeader, wireBack } from './components.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function renderAccount(ctx) {
  const user = currentUser();
  const screen = createScreen(html`
    ${subHeader('Account')}
    <main class="content">
      ${user ? html`
        <section class="panel">
          <h2 class="panel-title">${icon('user')} Signed in</h2>
          <p>You’re signed in as <strong>${user.email}</strong>.</p>
          <p class="sync-line" data-sync-status aria-live="polite"></p>
          <p class="hint">Your applications, profile, CV and LinkedIn files and CV check are saved in your account, so they’re the same on every device you sign in on. Each device keeps a copy, so the app still works with no signal.</p>
          <div class="stack">
            <button type="button" class="btn block" data-action="sync-now">Sync now</button>
            <button type="button" class="btn block" data-action="sign-out">Sign out</button>
          </div>
        </section>`
      : html`
        <section class="panel">
          <h2 class="panel-title">${icon('user')} Sign in to Applyful</h2>
          <p>An account will keep your applications and profile the same on your phone and your computer, and back them up for you.</p>
          ${dataHome() === 'online-copy'
            ? html`<p class="hint">It’s optional. Without one, your data is kept on this device, with an online copy that only this browser can open (Settings, Backup, restore and storage).</p>
                <p class="sync-line" data-sync-status aria-live="polite"></p>`
            : html`<p class="hint">It’s optional: without one, everything stays on this device, as now.</p>`}
          <div class="stack">
            <a class="btn primary block" href="#/account/sign-up">Create an account</a>
            <a class="btn block" href="#/account/log-in">Log in</a>
          </div>
        </section>`}
    </main>
  `);
  wireBack(screen, '/settings');
  // Signed in or out from elsewhere (another tab, or Cancel on the first sync): redraw.
  const onAuth = () => {
    window.removeEventListener('applyful:auth-changed', onAuth);
    if (screen.isConnected) renderAccount({ active: true });
  };
  window.addEventListener('applyful:auth-changed', onAuth);
  const line = screen.querySelector('[data-sync-status]');
  if (line) {
    const show = () => {
      const now = syncStatus();
      line.classList.toggle('warning', now.state === 'error');
      line.textContent = now.state === 'syncing' ? 'Syncing…'
        : now.state === 'error' ? now.error
        : now.state === 'off' ? ''
        : now.lastSyncedAt ? `Synced ${formatSyncTime(now.lastSyncedAt)}` : 'Not synced yet';
    };
    show();
    const onChange = () => (line.isConnected ? show() : window.removeEventListener('applyful:sync-changed', onChange));
    window.addEventListener('applyful:sync-changed', onChange);
    screen.querySelector('[data-action="sync-now"]')?.addEventListener('click', () => syncNow());
  }
  screen.querySelector('[data-action="sign-out"]')?.addEventListener('click', async () => {
    await signOut();
    showToast('Signed out. Everything on this device is still here.');
    renderAccount(ctx);
  });
  mount(screen, ctx);
}

/** "just now", "at 3:42 pm", or "on 21 Nov at 3:42 pm". */
function formatSyncTime(iso) {
  const when = new Date(iso);
  if (Date.now() - when.getTime() < 60 * 1000) return 'just now';
  const timeText = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (when.toDateString() === new Date().toDateString()) return `at ${timeText}`;
  return `on ${when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} at ${timeText}`;
}

function emailField(value = '') {
  return field('email', 'Email', html`
    <input id="f-email" name="email" type="email" value="${value}" inputmode="email" autocomplete="email"
           autocapitalize="off" spellcheck="false" required>`);
}

function passwordField(name, label, autocomplete, hint = '') {
  return field(name, label, html`
    <div class="inline-input">
      <input id="f-${name}" name="${name}" type="password" autocomplete="${autocomplete}" minlength="${MIN_PASSWORD_LENGTH}" required>
      <button type="button" class="btn small" data-action="show-password" aria-pressed="false" aria-controls="f-${name}">Show</button>
    </div>`, { hint });
}

/** Shows or hides the password, and clears a field's error as soon as it's edited. */
function wireForm(form) {
  linkHints(form);
  form.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-action="show-password"]');
    if (!toggle) return;
    const input = form.querySelector(`#${toggle.getAttribute('aria-controls')}`);
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    toggle.textContent = showing ? 'Show' : 'Hide';
    toggle.setAttribute('aria-pressed', String(!showing));
  });
  form.addEventListener('input', (event) => {
    const fieldEl = event.target.closest('.field[data-field]');
    if (fieldEl) setFieldError(fieldEl, '');
  });
}

/** Shows field errors; returns true when there were none. */
function showErrors(form, errors) {
  for (const fieldEl of form.querySelectorAll('.field[data-field]')) setFieldError(fieldEl, errors[fieldEl.dataset.field] ?? '');
  const first = form.querySelector('[aria-invalid="true"]');
  first?.focus();
  return !first;
}

/** Runs a request with the button showing it's busy, and shows any error above it. */
async function submitting(form, work) {
  const button = form.querySelector('[type="submit"]');
  const message = form.querySelector('.form-error');
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Please wait…';
  message.hidden = true;
  try {
    return await work();
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
    message.focus();
    return undefined;
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

export async function renderSignUp(ctx) {
  const screen = createScreen(html`
    ${subHeader('Create an account')}
    <main class="content">
      <form class="form panel" novalidate>
        ${emailField()}
        ${passwordField('password', 'Password', 'new-password', `At least ${MIN_PASSWORD_LENGTH} characters.`)}
        <label class="check consent" data-field="age">
          <input type="checkbox" name="age"> I’m ${MIN_AGE} or older
        </label>
        <label class="check consent" data-field="terms">
          <input type="checkbox" name="terms">
          <span>I agree to the <a href="#/legal/terms">Terms of use</a> and the <a href="#/legal/privacy">Privacy policy</a></span>
        </label>
        <label class="check consent">
          <input type="checkbox" name="emails"> Email me now and then about new features (optional)
        </label>
        <p class="error form-error" role="alert" tabindex="-1" hidden></p>
        <button type="submit" class="btn primary block">Create account</button>
      </form>
      <p class="hint">Already have an account? <a href="#/account/log-in">Log in</a></p>
    </main>
  `);
  wireBack(screen, '/account');
  const form = screen.querySelector('form');
  wireForm(form);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const errors = {};
    if (!EMAIL_PATTERN.test(email)) errors.email = 'Add a valid email address.';
    if (password.length < MIN_PASSWORD_LENGTH) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (!showErrors(form, errors)) return;
    const message = form.querySelector('.form-error');
    if (!form.elements.age.checked || !form.elements.terms.checked) {
      message.textContent = !form.elements.age.checked
        ? `Applyful is for people aged ${MIN_AGE} and over. Tick the box to confirm.`
        : 'Tick the box to agree to the Terms of use and Privacy policy.';
      message.hidden = false;
      message.focus();
      return;
    }
    const result = await submitting(form, () => signUp(email, password, { emailsOk: form.elements.emails.checked }));
    if (!result) return;
    if (result.needsConfirmation) renderCheckEmail(ctx, email);
    else {
      showToast('Account created. You’re signed in.');
      navigate('/account', { replace: true });
    }
  });
  mount(screen, ctx);
}

function renderCheckEmail(ctx, email) {
  const screen = createScreen(html`
    ${subHeader('Check your email')}
    <main class="content">
      <section class="panel">
        <h2 class="panel-title">${icon('mail')} One more step</h2>
        <p>We’ve sent a link to <strong>${email}</strong>. Open it to confirm your address, and you’ll be signed in.</p>
        <p class="hint">Open it on this device if you can. It can take a few minutes; check your spam folder too.</p>
        <button type="button" class="btn block" data-action="resend">Send the link again</button>
      </section>
    </main>
  `);
  wireBack(screen, '/account');
  screen.querySelector('[data-action="resend"]').addEventListener('click', async (event) => {
    event.target.disabled = true;
    try {
      await resendConfirmation(email);
      showToast('Sent again');
    } catch (error) {
      showToast(error.message, { duration: 6000 });
      event.target.disabled = false;
    }
  });
  mount(screen, ctx);
}

export async function renderLogIn(ctx) {
  const screen = createScreen(html`
    ${subHeader('Log in')}
    <main class="content">
      <form class="form panel" novalidate>
        ${emailField()}
        ${passwordField('password', 'Password', 'current-password')}
        <p class="error form-error" role="alert" tabindex="-1" hidden></p>
        <button type="submit" class="btn primary block">Log in</button>
        <a class="link-btn quiet" href="#/account/reset">Forgot your password?</a>
      </form>
      <p class="hint">New to Applyful? <a href="#/account/sign-up">Create an account</a></p>
    </main>
  `);
  wireBack(screen, '/account');
  const form = screen.querySelector('form');
  wireForm(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const errors = {};
    if (!EMAIL_PATTERN.test(email)) errors.email = 'Add a valid email address.';
    if (!password) errors.password = 'Add your password.';
    if (!showErrors(form, errors)) return;
    const user = await submitting(form, () => logIn(email, password));
    if (!user) return;
    showToast(`Signed in as ${user.email}`);
    navigate('/account', { replace: true });
  });
  mount(screen, ctx);
}

export async function renderReset(ctx) {
  const screen = createScreen(html`
    ${subHeader('Reset your password')}
    <main class="content">
      <form class="form panel" novalidate>
        <p>Enter your account’s email, and we’ll send a link to set a new password.</p>
        ${emailField()}
        <p class="error form-error" role="alert" tabindex="-1" hidden></p>
        <button type="submit" class="btn primary block">Send the link</button>
      </form>
    </main>
  `);
  wireBack(screen, '/account/log-in');
  const form = screen.querySelector('form');
  wireForm(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = form.elements.email.value.trim();
    if (!showErrors(form, EMAIL_PATTERN.test(email) ? {} : { email: 'Add a valid email address.' })) return;
    const sent = await submitting(form, async () => { await sendPasswordReset(email); return true; });
    if (!sent) return;
    form.replaceChildren(...createScreen(html`
      <p class="callout-title">${icon('mail')} Check your email</p>
      <p>If there’s an account for <strong>${email}</strong>, a link to set a new password is on its way. Open it on this device if you can.</p>`).childNodes);
  });
  mount(screen, ctx);
}

export async function renderNewPassword(ctx) {
  if (!currentUser()) {
    navigate('/account/reset', { replace: true });
    return;
  }
  const screen = createScreen(html`
    ${subHeader('Set a new password')}
    <main class="content">
      <form class="form panel" novalidate>
        ${passwordField('password', 'New password', 'new-password', `At least ${MIN_PASSWORD_LENGTH} characters.`)}
        <p class="error form-error" role="alert" tabindex="-1" hidden></p>
        <button type="submit" class="btn primary block">Save new password</button>
      </form>
    </main>
  `);
  wireBack(screen, '/account');
  const form = screen.querySelector('form');
  wireForm(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = form.elements.password.value;
    if (!showErrors(form, password.length >= MIN_PASSWORD_LENGTH ? {} : { password: `Use at least ${MIN_PASSWORD_LENGTH} characters.` })) return;
    const done = await submitting(form, async () => { await setNewPassword(password); return true; });
    if (!done) return;
    showToast('Password changed');
    navigate('/account', { replace: true });
  });
  mount(screen, ctx);
}
