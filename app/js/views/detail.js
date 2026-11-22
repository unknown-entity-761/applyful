// Details screen: everything about one application, one-tap status changes,
// follow-up actions, copy login email, open the posting, delete with undo.

import {
  html,
  bool,
  icon,
  createScreen,
  mount,
  notFoundScreen,
  todayISO,
  addDays,
  formatDate,
  formatTimestamp,
  relativeDays,
  safeHttpUrl,
  hostOf,
  showToast,
} from '../ui.js';
import { getApplication, saveApplication, deleteApplication } from '../store.js';
import { findCv, openFile } from '../profile.js';
import { gmailLink, gmailAddress } from '../email/gmail.js';
import { listLetters, lettersFor } from '../letters.js';
import { lettersPanel } from './letters.js';
import { nudgesFor, markGhosted, keepWaiting, weeksText } from './nudges.js';
import { STATUSES, statusInfo, withStatus, isOpen, isFollowUpDue, followUpText } from '../model.js';
import { back, refresh } from '../router.js';
import { googleCalendarUrl, openCalendarFile } from '../calendar.js';

export async function renderDetail({ id }, ctx, scrollY = 0) {
  const app = await getApplication(id);
  if (!app) {
    mount(notFoundScreen(), ctx);
    return;
  }

  const today = todayISO();
  const status = statusInfo(app.status);
  const postingUrl = safeHttpUrl(app.postingUrl);
  const timeline = [...app.statusHistory].reverse();
  const cvSent = await findCv(app.cvVersionId);
  const letters = lettersFor(app.id, await listLetters());
  const nudge = nudgesFor([app]).length > 0;

  const screen = createScreen(html`
    <header class="topbar">
      <button type="button" class="icon-btn" data-action="back" aria-label="Back">${icon('back')}</button>
      <h1 class="topbar-title" tabindex="-1">${app.company}</h1>
      <a class="text-btn" href="#/a/${encodeURIComponent(app.id)}/edit">Edit</a>
    </header>
    <main class="content">
      <div class="detail-head">
        <p class="detail-title">${app.title}</p>
        <span class="pill status-${status.id}">${status.label}</span>
      </div>

      ${isFollowUpDue(app, today) && html`
        <div class="callout" role="note">
          <p class="callout-title">${icon('clock')} ${followUpText(app, today)}</p>
          <div class="callout-actions">
            <button type="button" class="btn small" data-action="followup-done">${icon('check')} Done</button>
            <button type="button" class="btn small" data-action="followup-snooze">Snooze 1 week</button>
          </div>
        </div>`}

      ${nudge && html`
        <div class="callout" role="note">
          <p class="callout-title">${icon('clock')} ${weeksText(app)}</p>
          <p>Still no word from ${app.company}? You can mark it as Ghosted, and change it back any time.</p>
          <div class="callout-actions">
            <button type="button" class="btn small" data-action="mark-ghosted">Mark as Ghosted</button>
            <button type="button" class="btn small" data-action="still-waiting">Still waiting</button>
          </div>
        </div>`}

      <section class="panel" aria-labelledby="status-heading">
        <h2 class="panel-title" id="status-heading">Status</h2>
        <div class="status-picker" role="group" aria-labelledby="status-heading">
          ${STATUSES.map((s) => html`
            <button type="button" class="status-option status-${s.id}" data-status="${s.id}"
                    aria-pressed="${bool(s.id === app.status)}">${s.label}</button>`)}
        </div>
      </section>

      <section class="panel">
        <h2 class="panel-title">Details</h2>
        <dl class="facts">
          ${fact('Portal', app.portal)}
          ${fact('Login email', app.loginEmail && html`
            <span class="fact-row">
              <span>${app.loginEmail}</span>
              <button type="button" class="icon-btn small" data-action="copy-email" aria-label="Copy login email">${icon('copy')}</button>
            </span>`)}
          ${fact('Job posting', postingUrl && html`
            <a class="ext-link" href="${postingUrl}" target="_blank" rel="noopener noreferrer">
              ${hostOf(postingUrl)} ${icon('external')}<span class="visually-hidden"> (opens in a new tab)</span>
            </a>`)}
          ${fact('CV sent', app.cvVersionId && (cvSent
            ? html`
              <span class="fact-row">
                <span>${cvSent.name}${cvSent.current ? html` <span class="muted">· current</span>` : ''}</span>
                <button type="button" class="text-btn small" data-action="open-cv">View</button>
              </span>`
            : html`<span class="muted">A CV you’ve since deleted</span>`))}
          ${fact('Date applied', app.appliedOn && html`${formatDate(app.appliedOn)} <span class="muted">· ${relativeDays(app.appliedOn, today)}</span>`)}
          ${fact('Follow-up', app.followUpOn && html`${formatDate(app.followUpOn)} <span class="muted">· ${relativeDays(app.followUpOn, today)}</span>`)}
        </dl>
        ${app.followUpOn && isOpen(app) && html`
          <div class="calendar-row">
            <p class="calendar-label">Get a reminder in your calendar</p>
            <div class="callout-actions">
              <button type="button" class="btn small" data-action="calendar-file">${icon('clock')} Calendar app</button>
              <a class="btn small" href="${googleCalendarUrl(app)}" target="_blank" rel="noopener noreferrer">Google Calendar<span class="visually-hidden"> (opens in a new tab)</span></a>
            </div>
          </div>`}
      </section>

      ${lettersPanel(app, letters)}

      ${(app.contacts ?? []).length > 0 && html`
        <section class="panel">
          <h2 class="panel-title">Contacts</h2>
          <ul class="contact-cards">
            ${app.contacts.map((c) => html`
              <li class="contact-card">
                <p class="entry-title">${c.name || c.email}</p>
                ${c.title && html`<p class="entry-sub">${c.title}</p>`}
                <ul class="contact-list">
                  ${c.email && html`<li>${icon('mail')} <a href="mailto:${c.email}">${c.email}</a></li>`}
                  ${c.phone && html`<li>${icon('phone')} <a href="tel:${c.phone.replace(/[^\d+]/g, '')}">${c.phone}</a></li>`}
                </ul>
                ${c.lastAt && html`<p class="muted small">Last wrote ${formatDate(c.lastAt.slice(0, 10))}</p>`}
              </li>`)}
          </ul>
        </section>`}

      ${(app.emailThreads ?? []).length > 0 && gmailAddress() && html`
        <a class="btn block" href="${gmailLink(app.emailThreads[app.emailThreads.length - 1])}" target="_blank" rel="noopener noreferrer">
          ${icon('mail')} View its emails in Gmail<span class="visually-hidden"> (opens Gmail)</span>
        </a>`}

      ${app.notes && html`
        <section class="panel">
          <h2 class="panel-title">Notes</h2>
          <p class="notes">${app.notes}</p>
        </section>`}

      ${timeline.length > 0 && html`
        <section class="panel">
          <h2 class="panel-title">History</h2>
          <ol class="timeline">
            ${timeline.map((entry, i) => html`
              <li>
                <span>${i === timeline.length - 1 ? 'Added as' : 'Moved to'} ${statusInfo(entry.status).label}</span>
                <span class="muted">${formatTimestamp(entry.at)}</span>
              </li>`)}
          </ol>
        </section>`}

      <button type="button" class="btn danger-ghost block" data-action="delete">${icon('trash')} Delete application</button>
    </main>
  `);

  screen.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action], [data-status]');
    if (!target) return;

    if (target.dataset.status) {
      await changeStatus(app, target.dataset.status, ctx);
      return;
    }
    switch (target.dataset.action) {
      case 'back':
        back('/applications');
        break;
      case 'copy-email':
        await copyText(app.loginEmail);
        break;
      case 'mark-ghosted':
        await markGhosted(app, () => renderDetail({ id: app.id }, { active: true }, window.scrollY));
        break;
      case 'still-waiting':
        keepWaiting(app);
        renderDetail({ id: app.id }, { active: true }, window.scrollY);
        break;
      case 'open-cv':
        openFile(cvSent);
        break;
      case 'calendar-file':
        openCalendarFile(app);
        showToast('Open the file to add it to your calendar');
        break;
      case 'followup-done':
        await update({ ...app, followUpOn: '' }, 'Follow-up done', ctx);
        break;
      case 'followup-snooze': {
        const next = addDays(today, 7);
        await update({ ...app, followUpOn: next }, `Follow-up moved to ${formatDate(next)}`, ctx);
        break;
      }
      case 'delete':
        await remove(app);
        break;
      default:
        break;
    }
  });

  mount(screen, ctx, scrollY);
}

function fact(label, value) {
  return html`
    <div class="fact">
      <dt>${label}</dt>
      <dd>${value || html`<span class="not-set">Not added</span>`}</dd>
    </div>`;
}

/** Saves a change and redraws this screen in place, keeping the scroll position. */
async function update(next, message, ctx) {
  const scrollY = window.scrollY;
  await saveApplication(next);
  showToast(message);
  await renderDetail({ id: next.id }, ctx, scrollY);
}

async function changeStatus(app, statusId, ctx) {
  if (statusId === app.status) return;
  let next = withStatus(app, statusId);
  // Moving on from Saved means you've applied: fill in today if there's no date yet.
  if (app.status === 'saved' && !next.appliedOn) next = { ...next, appliedOn: todayISO() };
  await update(next, `Moved to ${statusInfo(statusId).label}`, ctx);
}

async function remove(app) {
  await deleteApplication(app.id);
  back('/applications');
  showToast(`Deleted ${app.company}`, {
    actionLabel: 'Undo',
    onAction: async () => {
      await saveApplication(app); // saved again as new, so the undo also reaches your other devices
      refresh();
      showToast('Application restored');
    },
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Login email copied');
  } catch {
    showToast('Couldn’t copy. Press and hold the email to copy it.');
  }
}
