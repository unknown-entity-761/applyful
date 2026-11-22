// Email import (version 5): adds and updates applications from your Gmail.
//
//   checkEmail()      reads new job emails (gmail.js), works out what each means
//                     (rules.js), and applies it:
//                       - a confirmation adds the application (with the email address
//                         you applied with, the portal and the job number),
//                       - assessment, interview, offer and rejection emails move the
//                         matching application on (never backwards),
//                       - a recruiter who writes is saved as a contact on it.
//   emailUpdates()    every change made, newest first, each with a one-tap undo.
//   emailsToReview()  emails it couldn't match for certain: you pick the application
//                     or add a new one. The app never guesses.
//
// Matching an email to an application, first match wins (as the PRD sets out):
//   1. the email is in a conversation already linked to an application,
//   2. its job number, or its exact job title (at the same company), matches one,
//   3. its company matches exactly one application still in play.
//
// Updates and the review list are kept on this device (they're about this device's
// Gmail); the applications themselves sync like any others.

import { readJobEmail } from './rules.js';
import { findMessages, readMessage, gmailAddress } from './gmail.js';
import { listApplications, getApplication, saveApplication, deleteApplication } from '../store.js';
import { normalize, isOpen, makeId } from '../model.js';
import { norm, normCompany } from '../cv/text.js';
import { getPref, setPref } from '../prefs.js';
import { toISODate } from '../ui.js';

const UPDATES_KEY = 'jt-email-updates';
const REVIEW_KEY = 'jt-email-review';
const SEEN_KEY = 'jt-email-seen';
const CHECKED_KEY = 'jt-email-checked';
const MAX_UPDATES = 200;
const MAX_REVIEW = 100;
const MAX_SEEN = 3000;
const FIRST_CHECK_DAYS = 90;
const MAX_PER_CHECK = 150;

// Job emails only: from the usual portals, or with application words in the subject.
// Promotions (job alerts, newsletters) and your own sent emails are left out.
export const GMAIL_QUERY = [
  '-from:me -category:promotions -category:social',
  '{',
  'from:(myworkday.com OR myworkdayjobs.com OR successfactors.com OR successfactors.eu OR greenhouse.io OR greenhouse-mail.io OR lever.co OR icims.com OR taleo.net OR smartrecruiters.com OR jobvite.com OR workable.com OR workablemail.com OR ashbyhq.com OR bamboohr.com OR pageuppeople.com OR livehire.com)',
  'subject:(application OR applying OR applied OR interview OR assessment OR "next steps" OR offer OR candidate OR candidacy OR "your interest")',
  '}',
].join(' ');

// ---- What's kept on this device ----

const readList = (key) => {
  try {
    const list = JSON.parse(getPref(key, '[]'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};
const writeList = (key, list, max) => setPref(key, JSON.stringify(list.slice(0, max)));

export const emailUpdates = () => readList(UPDATES_KEY);
export const emailsToReview = () => readList(REVIEW_KEY);
export const lastEmailCheck = () => getPref(CHECKED_KEY, '');

function changed() {
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent('foliofy:email-changed'));
}

// ---- Deciding (no network or saving, so it can be tested) ----

const RANK = { saved: 0, applied: 1, assessment: 2, interview: 3, offer: 4 };
const STATUS_FOR = { confirmation: 'applied', assessment: 'assessment', interview: 'interview', offer: 'offer', rejection: 'rejected' };

/** Whether an email saying `status` should move an application that's at `current`. */
export function movesForward(current, status) {
  if (current === status || current === 'rejected') return false;
  if (status === 'rejected' || current === 'ghosted') return true;
  return (RANK[status] ?? 0) > (RANK[current] ?? 0);
}

/** { app } for a certain match, { candidates } when several fit, or null. */
export function matchApplication(email, info, apps) {
  const one = (list) => (list.length === 1 ? { app: list[0] } : null);
  const inThread = apps.filter((app) => app.emailThreads.includes(email.threadId));
  if (inThread.length) return one(inThread) ?? { candidates: inThread };
  if (info.jobId) {
    const byJob = apps.filter((app) => app.jobId === info.jobId || (app.postingUrl && app.postingUrl.toUpperCase().includes(info.jobId)));
    if (byJob.length === 1) return { app: byJob[0] };
  }
  const sameCompany = (app) => !info.company || !app.company || normCompany(app.company) === normCompany(info.company);
  if (info.title) {
    const byTitle = apps.filter((app) => norm(app.title) === norm(info.title) && sameCompany(app));
    if (byTitle.length === 1) return { app: byTitle[0] };
  }
  if (info.company) {
    const byCompany = apps.filter((app) => isOpen(app) && normCompany(app.company) === normCompany(info.company));
    if (byCompany.length === 1) return { app: byCompany[0] };
    if (byCompany.length > 1) return { candidates: byCompany };
  }
  return null;
}

/** Adds or refreshes a contact (one per email address), keeping the first and latest dates. */
export function withContact(app, contact, at) {
  if (!contact?.email) return app;
  const contacts = [...app.contacts];
  const i = contacts.findIndex((c) => c.email === contact.email);
  if (i >= 0) {
    const old = contacts[i];
    contacts[i] = {
      ...old,
      name: contact.name || old.name,
      title: contact.title || old.title,
      phone: contact.phone || old.phone,
      firstAt: old.firstAt && old.firstAt < at ? old.firstAt : at,
      lastAt: old.lastAt && old.lastAt > at ? old.lastAt : at,
    };
  } else {
    contacts.push({ name: contact.name, title: contact.title, email: contact.email, phone: contact.phone, firstAt: at, lastAt: at });
  }
  return { ...app, contacts };
}

const withThread = (app, threadId) => (app.emailThreads.includes(threadId) ? app : { ...app, emailThreads: [...app.emailThreads, threadId] });

const emailSummary = (email) => ({ id: email.id, threadId: email.threadId, date: email.date, subject: String(email.subject).slice(0, 200), from: email.from?.name || email.from?.email || '' });

/**
 * Works out what a batch of emails (oldest first) does to the applications.
 * Returns { apps: Map of changed applications, updates, review }.
 */
export function planEmails(emails, applications, { myAddress = '' } = {}) {
  const apps = new Map(applications.map((app) => [app.id, normalize(app)]));
  const changedIds = new Set();
  const updates = [];
  const review = [];
  const now = new Date().toISOString();
  const record = (entry) => updates.push({ id: makeId(), at: now, undone: false, ...entry });

  for (const email of emails) {
    if (myAddress && email.from?.email === myAddress) continue;
    const info = readJobEmail(email);
    if (!info.kind && !info.person) continue;
    const match = matchApplication(email, info, [...apps.values()]);
    const summary = emailSummary(email);
    const appliedWith = (email.to ?? []).find((to) => to && to !== email.from?.email) || myAddress;

    if (match?.app) {
      let app = withThread(match.app, email.threadId);
      const before = match.app;
      const status = STATUS_FOR[info.kind];
      if (info.kind === 'confirmation') {
        app = {
          ...app,
          loginEmail: app.loginEmail || appliedWith,
          portal: app.portal || info.portal,
          jobId: app.jobId || info.jobId,
          appliedOn: app.appliedOn || toISODate(new Date(email.date)),
        };
      }
      if (status && movesForward(app.status, status)) {
        app = { ...app, status, statusHistory: [...app.statusHistory, { status, at: email.date }] };
        record({ action: 'status', email: summary, appId: app.id, company: app.company, title: app.title, from: before.status, to: status, before: { status: before.status, statusHistory: before.statusHistory } });
      }
      if (info.contact) {
        const withIt = withContact(app, info.contact, email.date);
        if (!before.contacts.some((c) => c.email === info.contact.email)) {
          record({ action: 'contact', email: summary, appId: app.id, company: app.company, title: app.title, contact: info.contact });
        }
        app = withIt;
      }
      if (app !== match.app) {
        apps.set(app.id, app);
        changedIds.add(app.id);
      }
      continue;
    }

    if (info.kind === 'confirmation' && !match?.candidates && info.company && info.title) {
      const created = normalize({
        company: info.company,
        title: info.title,
        portal: info.portal,
        loginEmail: appliedWith,
        jobId: info.jobId,
        appliedOn: toISODate(new Date(email.date)),
        status: 'applied',
        statusHistory: [{ status: 'applied', at: email.date }],
        emailThreads: [email.threadId],
        contacts: info.contact ? [{ ...info.contact, firstAt: email.date, lastAt: email.date }] : [],
        createdAt: email.date,
      });
      apps.set(created.id, created);
      changedIds.add(created.id);
      record({ action: 'added', email: summary, appId: created.id, company: created.company, title: created.title, to: 'applied' });
      continue;
    }

    if (info.kind) {
      review.push({
        id: makeId(), at: now, email: summary, kind: info.kind, company: info.company, title: info.title, jobId: info.jobId,
        portal: info.portal, appliedWith, contact: info.contact, candidates: (match?.candidates ?? []).map((app) => app.id),
      });
    }
  }
  return { apps: new Map([...changedIds].map((id) => [id, apps.get(id)])), updates, review };
}

// ---- Checking Gmail ----

/**
 * Reads new job emails and applies them. Gmail access must already be granted
 * (requestGmailAccess, from a tap). Resolves to { read, updates, review }.
 */
export async function checkEmail() {
  const last = lastEmailCheck();
  // A day of overlap, so nothing that arrived during the last check is missed.
  const since = last ? Date.parse(last) - 24 * 3600 * 1000 : Date.now() - FIRST_CHECK_DAYS * 24 * 3600 * 1000;
  const startedAt = new Date().toISOString();
  const ids = await findMessages(`${GMAIL_QUERY} after:${Math.floor(since / 1000)}`, MAX_PER_CHECK);
  const seen = new Set(readList(SEEN_KEY));
  const fresh = ids.filter((id) => !seen.has(id));
  const emails = [];
  for (const id of fresh) emails.push(await readMessage(id));
  emails.sort((a, b) => a.date.localeCompare(b.date));

  const plan = planEmails(emails, await listApplications(), { myAddress: gmailAddress() });
  for (const app of plan.apps.values()) await saveApplication(app);
  writeList(UPDATES_KEY, [...plan.updates.reverse(), ...emailUpdates()], MAX_UPDATES);
  writeList(REVIEW_KEY, [...plan.review.reverse(), ...emailsToReview()], MAX_REVIEW);
  writeList(SEEN_KEY, [...fresh, ...seen], MAX_SEEN);
  setPref(CHECKED_KEY, startedAt);
  changed();
  return { read: emails.length, updates: plan.updates.length, review: plan.review.length };
}

// ---- Undo ----

/** Undoes one update. Resolves to a message for the toast. */
export async function undoUpdate(updateId) {
  const updates = emailUpdates();
  const update = updates.find((u) => u.id === updateId);
  if (!update || update.undone) return '';
  const saved = await getApplication(update.appId);
  const app = saved && normalize(saved);
  if (update.action === 'added') {
    if (app) await deleteApplication(app.id);
  } else if (update.action === 'status' && app) {
    await saveApplication({ ...app, status: update.before.status, statusHistory: update.before.statusHistory });
  } else if (update.action === 'contact' && app) {
    await saveApplication({ ...app, contacts: app.contacts.filter((c) => c.email !== update.contact.email) });
  }
  writeList(UPDATES_KEY, updates.map((u) => (u.id === updateId ? { ...u, undone: true } : u)), MAX_UPDATES);
  changed();
  return { added: 'Application removed', status: 'Status put back', contact: 'Contact removed' }[update.action];
}

// ---- Needs a look ----

function dropReview(reviewId) {
  writeList(REVIEW_KEY, emailsToReview().filter((item) => item.id !== reviewId), MAX_REVIEW);
}

/** Applies a reviewed email to the application you picked. */
export async function linkReviewed(reviewId, appId) {
  const item = emailsToReview().find((r) => r.id === reviewId);
  const saved = item && (await getApplication(appId));
  if (!item || !saved) return null;
  const app = normalize(saved);
  let next = withThread(app, item.email.threadId);
  const status = STATUS_FOR[item.kind];
  const updates = [];
  const now = new Date().toISOString();
  if (status && movesForward(next.status, status)) {
    updates.push({ id: makeId(), at: now, undone: false, action: 'status', email: item.email, appId: app.id, company: app.company, title: app.title, from: app.status, to: status, before: { status: app.status, statusHistory: app.statusHistory } });
    next = { ...next, status, statusHistory: [...next.statusHistory, { status, at: item.email.date }] };
  }
  if (item.kind === 'confirmation') next = { ...next, loginEmail: next.loginEmail || item.appliedWith, portal: next.portal || item.portal, jobId: next.jobId || item.jobId };
  if (item.contact) next = withContact(next, item.contact, item.email.date);
  await saveApplication(next);
  writeList(UPDATES_KEY, [...updates, ...emailUpdates()], MAX_UPDATES);
  dropReview(reviewId);
  changed();
  return next;
}

/** Adds a reviewed email as a new application, with the company and title you confirmed. */
export async function addReviewed(reviewId, { company, title }) {
  const item = emailsToReview().find((r) => r.id === reviewId);
  if (!item) return null;
  const status = STATUS_FOR[item.kind] ?? 'applied';
  const created = normalize({
    company, title, portal: item.portal, loginEmail: item.appliedWith, jobId: item.jobId,
    appliedOn: toISODate(new Date(item.email.date)), status,
    statusHistory: [{ status: 'applied', at: item.email.date }, ...(status === 'applied' ? [] : [{ status, at: item.email.date }])],
    emailThreads: [item.email.threadId],
    contacts: item.contact ? [{ ...item.contact, firstAt: item.email.date, lastAt: item.email.date }] : [],
  });
  if (!created.company || !created.title) return null;
  await saveApplication(created);
  const update = { id: makeId(), at: new Date().toISOString(), undone: false, action: 'added', email: item.email, appId: created.id, company: created.company, title: created.title, to: status };
  writeList(UPDATES_KEY, [update, ...emailUpdates()], MAX_UPDATES);
  dropReview(reviewId);
  changed();
  return created;
}

export function dismissReviewed(reviewId) {
  dropReview(reviewId);
  changed();
}

/** Forgets this device's email history (on disconnecting Gmail). Applications stay. */
export function forgetEmailHistory() {
  for (const key of [UPDATES_KEY, REVIEW_KEY, SEEN_KEY, CHECKED_KEY]) setPref(key, '');
  changed();
}
