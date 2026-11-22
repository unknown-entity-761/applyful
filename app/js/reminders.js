// What's due, for reminders (version 4, notifications). Pure functions with no
// imports, so the same rules run in the app (Home and the application page show
// nudges) and in the server job that sends notifications
// (supabase/functions/send-reminders imports this file from the live site).
//
//   follow-up  an application still in play whose follow-up date is today
//   nudge      an application still at Applied with no change for N weeks
//              (you choose N), offering to mark it Ghosted

export const DEFAULT_NOTIFY = Object.freeze({
  followUps: true,
  nudges: true,
  nudgeWeeks: 3,
  time: '09:00', // when reminders arrive, local time
  quietStart: '22:00',
  quietEnd: '07:00',
});

export const NUDGE_WEEK_CHOICES = [2, 3, 4, 6, 8];
const OPEN = new Set(['saved', 'applied', 'assessment', 'interview', 'offer']);
const DAY_MS = 24 * 3600 * 1000;

const isTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function normalizeNotify(input = {}) {
  const value = input && typeof input === 'object' ? input : {};
  return {
    followUps: value.followUps !== false,
    nudges: value.nudges !== false,
    nudgeWeeks: NUDGE_WEEK_CHOICES.includes(Number(value.nudgeWeeks)) ? Number(value.nudgeWeeks) : DEFAULT_NOTIFY.nudgeWeeks,
    time: isTime(value.time) ? value.time : DEFAULT_NOTIFY.time,
    quietStart: isTime(value.quietStart) ? value.quietStart : DEFAULT_NOTIFY.quietStart,
    quietEnd: isTime(value.quietEnd) ? value.quietEnd : DEFAULT_NOTIFY.quietEnd,
  };
}

export const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** When the application last changed status (or was added). */
export function lastChangeAt(app) {
  const history = Array.isArray(app.statusHistory) ? app.statusHistory : [];
  return history.length ? history[history.length - 1].at : app.createdAt || app.updatedAt || '';
}

/** Still at Applied, with nothing new for `weeks` weeks. */
export function needsNudge(app, now = new Date(), weeks = DEFAULT_NOTIFY.nudgeWeeks) {
  if (!app || app.deleted || app.status !== 'applied') return false;
  const since = Date.parse(lastChangeAt(app));
  return Number.isFinite(since) && now.getTime() - since >= weeks * 7 * DAY_MS;
}

/** Whole weeks since the last change, for "no reply for 3 weeks". */
export const weeksWaiting = (app, now = new Date()) => Math.floor((now.getTime() - Date.parse(lastChangeAt(app))) / (7 * DAY_MS));

export function followUpDue(app, today) {
  return Boolean(app) && !app.deleted && OPEN.has(app.status) && app.followUpOn === today;
}

/** The local date ('YYYY-MM-DD') and minutes past midnight in a time zone. */
export function localParts(date, timeZone) {
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
  } catch {
    zone = 'UTC';
  }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function inQuietHours(minutes, settings) {
  const start = toMinutes(settings.quietStart);
  const end = toMinutes(settings.quietEnd);
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/** When today's reminders go out: the chosen time, or when quiet hours end if it falls inside them. */
export function sendingMinute(settings) {
  const chosen = toMinutes(settings.time);
  return inQuietHours(chosen, settings) ? toMinutes(settings.quietEnd) : chosen;
}

/** True during the `windowMinutes` after today's sending time (the job runs every 15 minutes). */
export function isSendingTime(minutes, settings, windowMinutes = 15) {
  const at = sendingMinute(settings);
  return minutes >= at && minutes < at + windowMinutes;
}

/**
 * The notifications to send now for one device: [{ key, kind, appId, title, body, url, actions }].
 * `sent` holds keys already sent to it, so nothing is sent twice. More than two of a
 * kind become one summary notification.
 */
export function remindersFor(apps, rawSettings, { now = new Date(), timeZone = 'UTC', sent = new Set(), windowMinutes = 15 } = {}) {
  const settings = normalizeNotify(rawSettings);
  const { date, minutes } = localParts(now, timeZone);
  if (!isSendingTime(minutes, settings, windowMinutes)) return [];
  const out = [];

  if (settings.followUps) {
    const due = apps.filter((app) => followUpDue(app, date)).map((app) => ({ app, key: `follow-up:${app.id}:${date}` })).filter((item) => !sent.has(item.key));
    if (due.length > 2) {
      out.push({ key: `follow-ups:${date}`, keys: due.map((item) => item.key), kind: 'follow-up', title: `${due.length} follow-ups are due today`, body: due.map((item) => item.app.company).join(', '), url: '#/' });
    } else {
      for (const { app, key } of due) {
        out.push({ key, kind: 'follow-up', appId: app.id, title: `Follow up with ${app.company}`, body: `${app.title}: your follow-up is due today.`, url: `#/a/${encodeURIComponent(app.id)}` });
      }
    }
  }

  if (settings.nudges) {
    const quiet = apps
      .filter((app) => needsNudge(app, now, settings.nudgeWeeks))
      .map((app) => ({ app, key: `nudge:${app.id}:${lastChangeAt(app)}` }))
      .filter((item) => !sent.has(item.key));
    if (quiet.length > 2) {
      out.push({ key: `nudges:${date}`, keys: quiet.map((item) => item.key), kind: 'nudge', title: `${quiet.length} applications have had no reply`, body: 'Open Applyful to mark any as Ghosted.', url: '#/' });
    } else {
      for (const { app, key } of quiet) {
        const weeks = weeksWaiting(app, now);
        out.push({
          key, kind: 'nudge', appId: app.id,
          title: `No reply from ${app.company}?`,
          body: `${app.title}: no reply for ${weeks} week${weeks === 1 ? '' : 's'}. Mark it as Ghosted?`,
          url: `#/a/${encodeURIComponent(app.id)}`,
          ghostUrl: `#/a/${encodeURIComponent(app.id)}/ghosted`,
          actions: [{ action: 'ghost', title: 'Mark as Ghosted' }],
        });
      }
    }
  }
  return out;
}
