// CV history (version 4.2), opened from the CV on Profile: your current CV and every
// earlier one (the newest 10), with when each was added, its CV check score at the
// time, and how many applications it was sent with. View one, make an earlier one
// your current CV again, or delete it.

import { html, icon, createScreen, mount, formatSize, formatTimestamp, plural, showToast } from '../ui.js';
import { getDocument, getCvCheck, listCvVersions, cvVersionIdOf, openFile, makeCvCurrent, deleteCvVersion, MAX_CV_VERSIONS } from '../profile.js';
import { listApplications } from '../store.js';
import { deletionReach } from '../auth.js';
import { subHeader, wireBack } from './components.js';

export async function renderCvHistory(ctx) {
  const [current, versions, apps] = await Promise.all([getDocument('cv'), listCvVersions(), listApplications()]);
  const currentCheck = await getCvCheck(current);
  const sentWith = new Map();
  for (const app of apps) if (app.cvVersionId) sentWith.set(app.cvVersionId, (sentWith.get(app.cvVersionId) ?? 0) + 1);

  const meta = (cv, check) => [
    `Added ${formatTimestamp(cv.addedAt || cv.uploadedAt)}`,
    formatSize(cv.size),
    check ? `CV check ${check.score} out of 100` : '',
  ].filter(Boolean).join(' · ');
  const sent = (versionId) => {
    const count = sentWith.get(versionId) ?? 0;
    return count ? `Sent with ${plural(count, 'application')}` : '';
  };

  const screen = createScreen(html`
    ${subHeader('CV history')}
    <main class="content">
      <p class="hint">Each time you add a different CV, the one before it is kept here with its CV check score, so you can see what you sent. The newest ${MAX_CV_VERSIONS} are kept.</p>

      <section class="panel" aria-labelledby="current-cv">
        <h2 class="panel-title" id="current-cv">Current CV</h2>
        ${current
          ? html`
            <div class="doc-row">
              <span class="doc-icon">${icon('file')}</span>
              <span class="doc-text">
                <span class="doc-label">${current.name}</span>
                <span class="doc-meta">${meta(current, currentCheck)}</span>
                ${sent(cvVersionIdOf(current)) && html`<span class="doc-meta">${sent(cvVersionIdOf(current))}</span>`}
              </span>
              <span class="doc-actions">
                <button type="button" class="text-btn small" data-action="view-current">View</button>
              </span>
            </div>`
          : html`<p class="muted">No CV added. Add one on Profile, or use an earlier one below.</p>`}
      </section>

      <section class="panel" aria-labelledby="earlier-cvs">
        <h2 class="panel-title" id="earlier-cvs">Earlier CVs</h2>
        ${versions.length
          ? versions.map((cv) => html`
            <div class="doc-row" data-version="${cv.versionId}">
              <span class="doc-icon">${icon('file')}</span>
              <span class="doc-text">
                <span class="doc-label">${cv.name}</span>
                <span class="doc-meta">${meta(cv, cv.check)}</span>
                ${sent(cv.versionId) && html`<span class="doc-meta">${sent(cv.versionId)}</span>`}
              </span>
              <span class="doc-actions">
                <button type="button" class="text-btn small" data-action="view">View<span class="visually-hidden"> ${cv.name}</span></button>
                <button type="button" class="text-btn small" data-action="use">Make current<span class="visually-hidden">: ${cv.name}</span></button>
                <button type="button" class="text-btn small danger-text" data-action="delete">Delete<span class="visually-hidden"> ${cv.name}</span></button>
              </span>
            </div>`)
          : html`<p class="muted">None yet. When you add a different CV, your current one moves here.</p>`}
      </section>
    </main>
  `);
  wireBack(screen, '/profile');

  screen.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || button.dataset.action === 'back') return;
    if (button.dataset.action === 'view-current') {
      openFile(current);
      return;
    }
    const version = versions.find((cv) => cv.versionId === button.closest('[data-version]')?.dataset.version);
    if (!version) return;
    switch (button.dataset.action) {
      case 'view':
        openFile(version);
        break;
      case 'use':
        if (!window.confirm(`Make “${version.name}” your current CV?${current ? ' Your current CV moves to your earlier CVs.' : ''}`)) return;
        await makeCvCurrent(version.versionId);
        showToast(`${version.name} is now your current CV`);
        await renderCvHistory({ active: true });
        break;
      case 'delete':
        if (!window.confirm(`Delete “${version.name}” ${deletionReach()}? Applications sent with it will say it’s been deleted. This can’t be undone.`)) return;
        await deleteCvVersion(version.versionId);
        showToast('Earlier CV deleted');
        await renderCvHistory({ active: true });
        break;
      default:
        break;
    }
  });

  mount(screen, ctx);
}
