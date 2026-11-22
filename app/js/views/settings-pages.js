// The pages inside Settings: notifications, backup/restore/storage, and add to home screen.

import { html, raw, icon, createScreen, mount, plural, showToast, formatTimestamp } from '../ui.js';
import { listApplications, clearAll, isPersisted, storageMode } from '../store.js';
import { exportBackup, importBackup, lastBackupAt } from '../backup.js';
import { canPromptInstall, promptInstall, isInstalled } from '../install.js';
import { getProfile, isProfileEmpty, getDocument, deleteProfileAndDocuments } from '../profile.js';
import { currentUser, dataHome, deletionReach, onlineCopyChoice, setOnlineCopy, onlineUser } from '../auth.js';
import { subHeader, wireBack } from './components.js';
import { listLetters, deleteLetter } from '../letters.js';

// ---- Notifications ----

const NOTIFICATION_TYPES = [
  { title: 'Follow-up reminders', desc: 'On the day a follow-up is due', on: true },
  { title: 'No-reply nudges', desc: 'When an application hasn’t had a reply for 3 weeks', on: true },
  { title: 'Email updates', desc: 'When an email changes an application’s status', on: false },
];

export async function renderNotifications(ctx) {
  const screen = createScreen(html`
    ${subHeader('Notifications')}
    <main class="content">
      <div class="callout info" role="note">
        <p class="callout-title">${icon('info')} Coming in version 2</p>
        <p>Phone notifications need the online service that version 2 adds. Until then, follow-ups that are due show on Home.</p>
      </div>

      <section class="panel" aria-label="Notification types">
        ${NOTIFICATION_TYPES.map((type) => html`
          <label class="switch-row">
            <span class="switch-text">
              <span class="switch-title">${type.title}</span>
              <span class="switch-desc">${type.desc}</span>
            </span>
            <input type="checkbox" class="switch" role="switch" ${type.on && raw('checked')} disabled>
          </label>`)}
      </section>

      <section class="panel" aria-label="Timing">
        <div class="switch-row">
          <span class="switch-text">
            <span class="switch-title">Reminder time</span>
            <span class="switch-desc">When reminders arrive each day</span>
          </span>
          <span class="badge">9:00 am</span>
        </div>
        <div class="switch-row">
          <span class="switch-text">
            <span class="switch-title">Quiet hours</span>
            <span class="switch-desc">No notifications overnight</span>
          </span>
          <span class="badge">10 pm – 7 am</span>
        </div>
      </section>
    </main>
  `);

  wireBack(screen, '/settings');
  mount(screen, ctx);
}

// ---- Backup, restore and storage ----

export async function renderData(ctx) {
  const [apps, persisted, profile, cv, linkedin, letters] = await Promise.all([
    listApplications(),
    isPersisted(),
    getProfile(),
    getDocument('cv'),
    getDocument('linkedin'),
    listLetters(),
  ]);
  const count = apps.length;
  const hasProfile = !isProfileEmpty(profile) || Boolean(cv || linkedin);

  const screen = createScreen(html`
    ${subHeader('Backup, restore and storage')}
    <main class="content">
      <section class="panel">
        <h2 class="panel-title">Backup</h2>
        ${{
          account: html`<p>You’re signed in, so everything is also backed up to your account automatically. A backup file is still handy to keep your own copy.</p>`,
          'online-copy': html`<p>Your applications and profile are saved on this device, with an online copy that only this browser can open. Clearing your browser loses the way to it, so back up to a file now and then, and before you switch phones. Or <a href="#/account">create an account</a> to back up automatically.</p>`,
          device: html`<p>Your applications and profile are saved only on this device. Back up now and then, and before you clear your browser or switch phones. Or <a href="#/account">create an account</a> to back up automatically.</p>`,
        }[dataHome()]}
        ${lastBackupAt() ? html`<p class="muted">Last backup: ${formatTimestamp(lastBackupAt())}</p>` : html`<p class="muted">You haven’t backed up on this device yet.</p>`}
        <div class="stack">
          <button type="button" class="btn primary block" data-action="export" ${count === 0 && !hasProfile && raw('disabled')}>
            ${icon('download')} Back up to a file
          </button>
          <label class="btn block">
            ${icon('upload')} Restore from a backup
            <input type="file" accept=".json,application/json" class="visually-hidden">
          </label>
        </div>
        <p class="hint">Backups include your applications, profile, CV and LinkedIn files, and your last CV check.</p>
        <p class="result" aria-live="polite" hidden></p>
      </section>

      ${!currentUser() && storageMode() !== 'memory' && html`
        <section class="panel">
          <label class="switch-row">
            <span class="switch-text">
              <span class="switch-title">Keep a copy online</span>
              <span class="switch-desc">Your applications, profile, CV and LinkedIn files and CV check, kept on Foliofy’s server and linked to this browser. If the app’s storage on this device is lost, they come back. Turning this off deletes the online copy.</span>
            </span>
            <input type="checkbox" class="switch" role="switch" data-setting="online-copy" ${onlineCopyChoice() === 'on' && raw('checked')}>
          </label>
        </section>`}

      <section class="panel">
        <h2 class="panel-title">Storage</h2>
        <p>${plural(count, 'application')} saved on this device${hasProfile ? ', plus your profile' : ''}.</p>
        ${storageMode() === 'memory'
          ? html`<p class="warning">This browser is blocking storage, so changes are lost when you close the page. Use a normal (not private) window.</p>`
          : html`<p class="muted">${persisted
              ? 'Your browser has agreed to keep this data, even when space runs low.'
              : 'Your browser may clear this data if your device runs low on space. Adding the app to your home screen and backing up both help.'}</p>`}
      </section>

      <section class="panel">
        <h2 class="panel-title">Delete data</h2>
        <p class="muted">These can’t be undone. Back up first if you might want anything again.</p>
        <div class="stack">
          <button type="button" class="btn danger block" data-action="clear-apps" ${count === 0 && raw('disabled')}>Delete all applications</button>
          <button type="button" class="btn danger-outline block" data-action="clear-profile" ${!hasProfile && raw('disabled')}>Delete profile, CV and LinkedIn files</button>
          <button type="button" class="btn danger-outline block" data-action="clear-letters" ${letters.length === 0 && raw('disabled')}>Delete all cover letters</button>
        </div>
      </section>
    </main>
  `);

  wireBack(screen, '/settings');

  const result = screen.querySelector('.result');
  const showResult = (message, isError = false) => {
    result.textContent = message;
    result.classList.toggle('error', isError);
    result.hidden = false;
  };

  screen.addEventListener('click', async (event) => {
    switch (event.target.closest('[data-action]')?.dataset.action) {
      case 'export': {
        const { count: exported, saved } = await exportBackup();
        if (saved) showResult(`Backup created with ${plural(exported, 'application')}${hasProfile ? ', your profile and files' : ''}. Keep the file somewhere safe, like Google Drive or iCloud.`);
        break;
      }
      case 'clear-apps':
        if (!window.confirm(`Delete all ${plural(count, 'application')} ${deletionReach()}? This can’t be undone.`)) return;
        await clearAll();
        showToast('All applications deleted');
        await renderData(ctx);
        break;
      case 'clear-letters':
        if (!window.confirm(`Delete all ${plural(letters.length, 'cover letter')} ${deletionReach()}? This can’t be undone.`)) return;
        for (const letter of letters) await deleteLetter(letter.id);
        showToast('Cover letters deleted');
        await renderData(ctx);
        break;
      case 'clear-profile':
        if (!window.confirm(`Delete your profile, CV and LinkedIn files ${deletionReach()}? This can’t be undone.`)) return;
        await deleteProfileAndDocuments();
        showToast('Profile deleted');
        await renderData(ctx);
        break;
      default:
        break;
    }
  });

  screen.querySelector('[data-setting="online-copy"]')?.addEventListener('change', async (event) => {
    const on = event.target.checked;
    if (!on && onlineUser()?.guest && !window.confirm('Turn off the online copy? It will be deleted from Foliofy’s server. Everything stays on this device.')) {
      event.target.checked = true;
      return;
    }
    event.target.disabled = true;
    const result = await setOnlineCopy(on);
    if (on) showToast(result ? 'Online copy on' : 'Couldn’t start the online copy just now. It will try again next time the app opens.', { duration: result ? 3000 : 6000 });
    else showToast(result ? 'Online copy turned off and deleted' : 'Online copy turned off. It will be deleted from the server when you’re back online.', { duration: 6000 });
    await renderData(ctx);
  });

  screen.querySelector('input[type="file"]').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // lets the same file be picked again later
    if (!file) return;
    try {
      const r = await importBackup(file);
      const parts = [`${r.added} added`, `${r.updated} updated`];
      if (r.unchanged > 0) parts.push(`${r.unchanged} already up to date`);
      if (r.skipped > 0) parts.push(`${r.skipped} skipped`);
      if (r.profileRestored) parts.push('profile restored');
      if (r.filesRestored > 0) parts.push(`${plural(r.filesRestored, 'file')} restored`);
      if (r.lettersRestored > 0) parts.push(`${plural(r.lettersRestored, 'cover letter')} restored`);
      await renderData(ctx);
      showToast(`Restored: ${parts.join(', ')}`, { duration: 6000 });
    } catch (error) {
      showResult(error.message, true);
    }
  });

  mount(screen, ctx);
}

// ---- Add to home screen ----

export async function renderInstall(ctx) {
  const screen = createScreen(html`
    ${subHeader('Add to home screen')}
    <main class="content">
      <section class="panel">
        ${isInstalled()
          ? html`<p class="success">${icon('check')} You’re using the home screen app.</p>`
          : html`
            <p>Add the app to your home screen so it opens full screen, works offline, and is less likely to have its data cleared.</p>
            ${canPromptInstall() && html`<button type="button" class="btn primary block" data-action="install">Install app</button>`}
            <ul class="steps">
              <li><strong>iPhone:</strong> open this page in Safari, tap the Share button, then <em>Add to Home Screen</em>.</li>
              <li><strong>Android:</strong> open this page in Chrome, tap the ⋮ menu, then <em>Install app</em> or <em>Add to Home screen</em>.</li>
            </ul>`}
      </section>
    </main>
  `);

  wireBack(screen, '/settings');
  screen.querySelector('[data-action="install"]')?.addEventListener('click', async () => {
    await promptInstall();
    await renderInstall(ctx);
  });

  mount(screen, ctx);
}
