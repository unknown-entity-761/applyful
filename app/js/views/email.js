// Email import screens (version 5):
//   #/settings/email   connect Gmail, check now, disconnect, and what it does
//   emailPanel()       on Activity: Check Gmail, emails that need a look, and every
//                      change made from email, each with Undo
// The work itself is in js/email/ (rules.js, gmail.js, import.js).

import { html, icon, createScreen, mount, showToast, formatTimestamp, plural } from '../ui.js';
import { listApplications } from '../store.js';
import { statusInfo, isOpen } from '../model.js';
import { gmailAvailable, gmailAddress, prepareGmail, requestGmailAccess, rememberGmailAddress, disconnectGmail, gmailLink } from '../email/gmail.js';
import { checkEmail, emailUpdates, emailsToReview, lastEmailCheck, undoUpdate, linkReviewed, addReviewed, dismissReviewed, forgetEmailHistory } from '../email/import.js';
import { subHeader, wireBack } from './components.js';

const KIND_LABEL = { confirmation: 'Application confirmed', assessment: 'Assessment invite', interview: 'Interview invite', offer: 'Offer', rejection: 'Rejection' };

/**
 * Checks Gmail from a tap: asks Google for access first if needed (the tap lets its
 * window open), then reads and applies new emails. Shows what happened.
 */
async function checkFromTap(button, { firstTime = false } = {}) {
  button.disabled = true;
  const label = button.textContent;
  try {
    await requestGmailAccess({ firstTime });
    button.textContent = 'Checking your email…';
    if (firstTime || !gmailAddress()) await rememberGmailAddress();
    const result = await checkEmail();
    const parts = [result.updates ? plural(result.updates, 'change') : 'no changes', result.review ? `${result.review} to look at in Activity` : ''].filter(Boolean);
    showToast(`Checked ${plural(result.read, 'new email')}: ${parts.join(', ')}.`, { duration: 6000 });
    return true;
  } catch (error) {
    showToast(error.message || 'Couldn’t check Gmail just now.', { duration: 6000 });
    return false;
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

const checkedLine = () => (lastEmailCheck() ? `Last checked ${formatTimestamp(lastEmailCheck())}` : 'Not checked yet');

// ---- Settings → Gmail ----

export async function renderEmailSettings(ctx) {
  const available = gmailAvailable();
  const address = gmailAddress();
  const screen = createScreen(html`
    ${subHeader('Gmail')}
    <main class="content">
      <section class="panel">
        <h2 class="panel-title">${icon('mail')} Applications from your email</h2>
        <p>Connect Gmail and Foliofy adds an application when a confirmation email arrives, then moves it on when you hear back: assessments, interviews, offers and rejections. Recruiters who write to you are saved as contacts on the application.</p>
        <ul class="plain-list">
          <li>Read-only: it can’t send, delete or change your email.</li>
          <li>Your email is read here on your device and never sent to Foliofy’s server. Only what’s saved on your applications is kept.</li>
          <li>Every change shows in Activity, with Undo. Anything it can’t match for certain waits there for you to decide.</li>
        </ul>
        ${!available
          ? html`<p class="warning">Gmail isn’t set up for this app yet.</p>`
          : address
            ? html`
              <p>Connected: <strong>${address}</strong></p>
              <p class="muted">${checkedLine()}</p>
              <div class="stack">
                <button type="button" class="btn primary block" data-action="check" disabled>Check Gmail now</button>
                <button type="button" class="btn block" data-action="disconnect">Disconnect Gmail</button>
              </div>`
            : html`
              <div class="stack">
                <button type="button" class="btn primary block" data-action="connect" disabled>Connect Gmail</button>
              </div>
              <p class="hint">Google asks you to choose your account and allow read-only access. The first check looks at the last 90 days.</p>`}
      </section>
    </main>
  `);
  wireBack(screen, '/settings');

  // Google's sign-in library loads now, so the tap can open its window straight away.
  if (available) {
    prepareGmail()
      .then(() => screen.querySelectorAll('[data-action="check"], [data-action="connect"]').forEach((b) => { b.disabled = false; }))
      .catch((error) => showToast(error.message, { duration: 6000 }));
  }

  screen.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    switch (button?.dataset.action) {
      case 'connect':
        if (await checkFromTap(button, { firstTime: true })) renderEmailSettings({ active: true });
        break;
      case 'check':
        await checkFromTap(button);
        renderEmailSettings({ active: true });
        break;
      case 'disconnect':
        if (!window.confirm('Disconnect Gmail? Applications already added stay. The list of email changes on this device is cleared.')) return;
        disconnectGmail();
        forgetEmailHistory();
        showToast('Gmail disconnected');
        renderEmailSettings({ active: true });
        break;
      default:
        break;
    }
  });
  mount(screen, ctx);
}

// ---- On Activity ----

/** The email section for Activity, or '' when Gmail isn't available and nothing's there. */
export async function emailPanel() {
  const updates = emailUpdates().slice(0, 20);
  const review = emailsToReview();
  if (!gmailAvailable() && !updates.length && !review.length) return '';
  const apps = (await listApplications()).sort((a, b) => a.company.localeCompare(b.company));
  const byId = new Map(apps.map((app) => [app.id, app]));
  const connected = Boolean(gmailAddress());

  return html`
    <section class="panel email-panel" aria-labelledby="email-heading">
      <h2 class="panel-title" id="email-heading">${icon('mail')} From your email</h2>
      ${connected
        ? html`
          <p class="muted">${gmailAddress()} · ${checkedLine()}</p>
          <button type="button" class="btn block" data-email-action="check" disabled>Check Gmail now</button>`
        : gmailAvailable()
          ? html`<p>Connect Gmail to add and update applications from your emails.</p><a class="btn block" href="#/settings/email">Connect Gmail</a>`
          : ''}

      ${review.length > 0 && html`
        <h3 class="subhead">Needs a look (${review.length})</h3>
        <ul class="email-list">
          ${review.map((item) => {
            const candidates = item.candidates.map((id) => byId.get(id)).filter(Boolean);
            const choices = candidates.length ? candidates : apps.filter(isOpen);
            return html`
              <li class="email-item" data-review="${item.id}">
                <p class="email-what"><strong>${KIND_LABEL[item.kind] ?? 'Job email'}</strong>${item.company && html` · ${item.company}`}</p>
                <p class="email-meta">${item.email.subject} · ${formatTimestamp(item.email.date)}</p>
                <p class="hint">${candidates.length ? 'It could be one of these. Which is it?' : 'It doesn’t match an application yet.'}</p>
                ${choices.length > 0 && html`
                  <div class="inline-input">
                    <label class="visually-hidden" for="link-${item.id}">Application</label>
                    <select id="link-${item.id}" data-link-select>
                      ${choices.map((app) => html`<option value="${app.id}">${app.company} · ${app.title}</option>`)}
                    </select>
                    <button type="button" class="btn small" data-email-action="link">Link</button>
                  </div>`}
                <details class="more">
                  <summary>Add it as a new application</summary>
                  <div class="email-new">
                    <label>Company <input type="text" data-new="company" value="${item.company}" autocomplete="off"></label>
                    <label>Job title <input type="text" data-new="title" value="${item.title}" autocomplete="off"></label>
                    <button type="button" class="btn small primary" data-email-action="add">Add application</button>
                  </div>
                </details>
                <div class="callout-actions">
                  <a class="btn small" href="${gmailLink(item.email.threadId)}" target="_blank" rel="noopener noreferrer">View email<span class="visually-hidden"> (opens Gmail)</span></a>
                  <button type="button" class="btn small" data-email-action="dismiss">Not a job email</button>
                </div>
              </li>`;
          })}
        </ul>`}

      ${updates.length > 0 && html`
        <h3 class="subhead">Changes made from email</h3>
        <ul class="email-list">
          ${updates.map((update) => html`
            <li class="email-item${update.undone ? ' undone' : ''}" data-update="${update.id}">
              <p class="email-what">${updateText(update)}</p>
              <p class="email-meta">${update.company} · ${update.title} · ${update.email.subject}</p>
              <div class="callout-actions">
                ${!update.undone && html`<a class="btn small" href="#/a/${encodeURIComponent(update.appId)}">Open</a>`}
                <a class="btn small" href="${gmailLink(update.email.threadId)}" target="_blank" rel="noopener noreferrer">View email<span class="visually-hidden"> (opens Gmail)</span></a>
                ${update.undone ? html`<span class="muted">Undone</span>` : html`<button type="button" class="btn small" data-email-action="undo">Undo</button>`}
              </div>
            </li>`)}
        </ul>`}
    </section>`;
}

function updateText(update) {
  if (update.action === 'added') return html`<strong>Added</strong> from a confirmation email`;
  if (update.action === 'status') return html`<strong>Moved to ${statusInfo(update.to).label}</strong> (was ${statusInfo(update.from).label})`;
  return html`<strong>Saved ${update.contact?.name || 'a recruiter'}</strong> as a contact`;
}

/** Wires the Activity email section; `redraw` redraws the screen after a change. */
export function wireEmailPanel(screen, redraw) {
  const panel = screen.querySelector('.email-panel');
  if (!panel) return;
  if (gmailAvailable() && gmailAddress()) {
    prepareGmail()
      .then(() => { const button = panel.querySelector('[data-email-action="check"]'); if (button) button.disabled = false; })
      .catch(() => {});
  }
  panel.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-email-action]');
    if (!button) return;
    const reviewId = button.closest('[data-review]')?.dataset.review;
    const updateId = button.closest('[data-update]')?.dataset.update;
    switch (button.dataset.emailAction) {
      case 'check':
        await checkFromTap(button);
        break;
      case 'undo': {
        const message = await undoUpdate(updateId);
        if (message) showToast(message);
        break;
      }
      case 'link': {
        const appId = button.closest('[data-review]').querySelector('[data-link-select]').value;
        if (await linkReviewed(reviewId, appId)) showToast('Linked to the application');
        break;
      }
      case 'add': {
        const item = button.closest('[data-review]');
        const company = item.querySelector('[data-new="company"]').value.trim();
        const title = item.querySelector('[data-new="title"]').value.trim();
        if (!company || !title) {
          showToast('Add the company and the job title first.');
          return;
        }
        if (await addReviewed(reviewId, { company, title })) showToast('Application added');
        break;
      }
      case 'dismiss':
        dismissReviewed(reviewId);
        break;
      default:
        return;
    }
    redraw();
  });
}
