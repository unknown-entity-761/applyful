// No-reply nudges in the app (version 4, notifications): Home lists applications
// still at Applied with no change for the weeks you chose (Settings → Notifications),
// and each application shows the same nudge. One tap marks it Ghosted, with Undo;
// "Still waiting" hides the nudge until its status changes.

import { html, showToast } from '../ui.js';
import { saveApplication, getApplication } from '../store.js';
import { withStatus } from '../model.js';
import { getPref, setPref } from '../prefs.js';
import { needsNudge, weeksWaiting, lastChangeAt } from '../reminders.js';
import { notificationSettings } from '../push.js';

const DISMISSED_KEY = 'jt-nudges-dismissed';

function dismissed() {
  try {
    const saved = JSON.parse(getPref(DISMISSED_KEY, '{}'));
    return saved && typeof saved === 'object' ? saved : {};
  } catch {
    return {};
  }
}

/** Applications to nudge about now, oldest first (none when nudges are switched off). */
export function nudgesFor(apps, now = new Date()) {
  const settings = notificationSettings();
  if (!settings.nudges) return [];
  const hidden = dismissed();
  return apps
    .filter((app) => needsNudge(app, now, settings.nudgeWeeks) && hidden[app.id] !== lastChangeAt(app))
    .sort((a, b) => lastChangeAt(a).localeCompare(lastChangeAt(b)));
}

/** "Still waiting": hide the nudge until the application's status changes. */
export function keepWaiting(app) {
  const hidden = dismissed();
  hidden[app.id] = lastChangeAt(app);
  setPref(DISMISSED_KEY, JSON.stringify(Object.fromEntries(Object.entries(hidden).slice(-500))));
}

/** Marks it Ghosted, with Undo. `after` redraws the screen. */
export async function markGhosted(app, after = () => {}) {
  const before = app;
  await saveApplication(withStatus(app, 'ghosted'));
  after();
  showToast(`${app.company} marked as Ghosted`, {
    actionLabel: 'Undo',
    onAction: async () => {
      const now = await getApplication(before.id);
      if (now) await saveApplication({ ...now, status: before.status, statusHistory: before.statusHistory });
      after();
    },
  });
}

export const weeksText = (app) => {
  const weeks = weeksWaiting(app);
  return `No reply for ${weeks} week${weeks === 1 ? '' : 's'}`;
};

/** The nudge card used on Home. */
export function nudgeCard(app) {
  return html`
    <li class="nudge-card" data-nudge-id="${app.id}">
      <a class="nudge-link" href="#/a/${encodeURIComponent(app.id)}"><strong>${app.company}</strong> <span class="muted">· ${app.title}</span></a>
      <p class="muted">${weeksText(app)}.</p>
      <div class="callout-actions">
        <button type="button" class="btn small" data-nudge="ghost">Mark as Ghosted</button>
        <button type="button" class="btn small" data-nudge="wait">Still waiting</button>
      </div>
    </li>`;
}
