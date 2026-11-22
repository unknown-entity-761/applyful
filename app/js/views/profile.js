// Profile tab: your profile as others would see it, built from what you enter,
// with your CV and LinkedIn files. The ☰ button opens Settings.

import { html, icon, createScreen, mount, formatMonth, formatSize, formatTimestamp, safeHttpUrl, hostOf, showToast, plural } from '../ui.js';
import {
  DOC_KINDS,
  getProfile,
  fullName,
  initials,
  profileStrength,
  getDocument,
  saveDocumentFile,
  removeDocument,
  openDocument,
  getCvCheck,
} from '../profile.js';
import { navigate } from '../router.js';
import { tabBar } from './components.js';
import { currentUser } from '../auth.js';

export async function renderProfile(ctx, scrollY = 0) {
  const [profile, cv, linkedin] = await Promise.all([getProfile(), getDocument('cv'), getDocument('linkedin')]);
  const cvCheck = await getCvCheck(cv);
  const docs = { cv, linkedin };
  const strength = profileStrength(profile, docs);
  const percent = Math.round((strength.done / strength.total) * 100);
  const name = fullName(profile);
  const linkedinUrl = safeHttpUrl(profile.linkedinUrl);
  const roles = profile.targetRoles.split(',').map((role) => role.trim()).filter(Boolean);

  const screen = createScreen(html`
    <header class="topbar topbar-large">
      <h1 class="topbar-title" tabindex="-1">Profile</h1>
      <a class="icon-btn" href="#/settings" aria-label="Settings">${icon('menu')}</a>
    </header>
    <main class="content">
      <section class="panel profile-card" aria-label="Your profile">
        <div class="profile-id">
          <div class="avatar" aria-hidden="true">${initials(profile) || icon('user')}</div>
          <div class="profile-id-text">
            <p class="profile-name">${name || 'Add your name'}</p>
            ${profile.headline
              ? html`<p class="profile-headline">${profile.headline}</p>`
              : html`<p class="profile-headline muted">Add a headline, like “Data analyst · SQL, Python”</p>`}
            ${profile.location && html`<p class="profile-meta">${icon('mapPin')} ${profile.location}</p>`}
          </div>
        </div>
        <div class="strength">
          <div class="strength-row"><span>Profile strength</span><span>${strength.done} of ${strength.total}</span></div>
          <div class="meter" role="progressbar" aria-label="Profile strength"
               aria-valuemin="0" aria-valuemax="${strength.total}" aria-valuenow="${strength.done}">
            <span style="width: ${percent}%"></span>
          </div>
          <p class="hint">${strength.next ? `Next: ${strength.next}` : 'Your profile is complete.'}</p>
        </div>
        <a class="btn block" href="#/profile/edit">${icon('pencil')} Edit profile</a>
      </section>

      <section class="panel">
        <h2 class="panel-title">${icon('file')} CV and LinkedIn</h2>
        ${docRow('cv', docs.cv)}
        ${docRow('linkedin', docs.linkedin)}
        ${(docs.cv || docs.linkedin) && html`
          <div class="stack">
            ${docs.cv && html`<a class="btn block" href="#/profile/import/cv">${icon('pencil')} Fill in my profile from my CV</a>`}
            ${docs.linkedin && html`<a class="btn block" href="#/profile/import/linkedin">${icon('pencil')} Fill in from my LinkedIn PDF</a>`}
          </div>`}
        ${docs.cv && html`
          <a class="summary-link cv-check-link" href="#/cv-check">
            <span class="cv-check-text">
              <strong>${cvCheck ? `CV check: ${cvCheck.score} out of 100` : 'Check your CV'}</strong>
              <span class="muted">${cvCheck ? `${cvCheck.label} · ${plural(cvCheck.toFix, 'thing')} to fix` : 'See what’s strong and what to fix'}</span>
            </span>
            <span class="summary-cta">${cvCheck ? 'Open' : 'Check'} ${icon('chevron')}</span>
          </a>`}
        <p class="hint">Your files stay on this device. Filling in your profile adds what’s missing and never overwrites what you’ve typed, and you check it all before it’s saved.</p>
        <details class="more">
          <summary>How to get your LinkedIn profile as a PDF</summary>
          <p>On a computer, open your LinkedIn profile, select <strong>More</strong> (or <strong>Resources</strong>), then <strong>Save to PDF</strong>.</p>
        </details>
      </section>

      ${section('About', profile.summary && html`<p class="notes">${profile.summary}</p>`,
        'A few sentences about your background and what you’re looking for.')}

      ${section('Roles you want', roles.length > 0 && html`<ul class="skill-chips">${roles.map((role) => html`<li class="skill-chip">${role}</li>`)}</ul>`,
        'The job titles you’re aiming for.')}

      ${section('Experience', profile.experience.length > 0 && html`<ul class="entries">${profile.experience.map(jobEntry)}</ul>`,
        'Your roles, most recent first.')}

      ${section('Education', profile.education.length > 0 && html`<ul class="entries">${profile.education.map(educationEntry)}</ul>`,
        'Degrees, diplomas and courses.')}

      ${section('Projects', profile.projects.length > 0 && html`<ul class="entries">${profile.projects.map(projectEntry)}</ul>`,
        'Things you’ve built or led, with a link if there is one.')}

      ${section('Certifications', profile.certifications.length > 0 && html`<ul class="entries">${profile.certifications.map(certificationEntry)}</ul>`,
        'Certificates and licences, like Google Data Analytics or a CPA.')}

      ${section('Skills', profile.skills.length > 0 && html`<ul class="skill-chips">${profile.skills.map((skill) => html`<li class="skill-chip">${skill}</li>`)}</ul>`,
        'Tools and strengths, like SQL, Excel or stakeholder management.')}

      ${section('Contact', (profile.email || profile.phone || linkedinUrl) && html`
        <ul class="contact-list">
          ${profile.email && html`<li>${icon('mail')} <span>${profile.email}</span></li>`}
          ${profile.phone && html`<li>${icon('phone')} <span>${profile.phone}</span></li>`}
          ${linkedinUrl && html`<li>${icon('link')} <a class="ext-link" href="${linkedinUrl}" target="_blank" rel="noopener noreferrer">${hostOf(linkedinUrl)}${icon('external')}</a></li>`}
        </ul>`,
        'Email, phone and your LinkedIn link, for cover letters.')}
    </main>
    ${tabBar('profile')}
  `);

  screen.addEventListener('change', async (event) => {
    const input = event.target.closest('[data-doc-input]');
    const file = input?.files?.[0];
    if (!file) return;
    input.value = '';
    const kind = input.dataset.docInput;
    try {
      await saveDocumentFile(kind, file);
      showToast(`${DOC_KINDS[kind].label} saved`, {
        actionLabel: 'Fill in profile',
        onAction: () => navigate(`/profile/import/${kind}`),
      });
      await renderProfile(ctx, window.scrollY);
    } catch (error) {
      showToast(error.message);
    }
  });

  screen.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-doc-action]');
    if (!button) return;
    const kind = button.closest('[data-kind]').dataset.kind;
    if (button.dataset.docAction === 'open') {
      await openDocument(kind);
    } else if (button.dataset.docAction === 'remove') {
      if (!window.confirm(`Remove your ${DOC_KINDS[kind].label} ${currentUser() ? 'from your account and every device you’re signed in on' : 'from this device'}?`)) return;
      await removeDocument(kind);
      showToast(`${DOC_KINDS[kind].label} removed`);
      await renderProfile(ctx, window.scrollY);
    }
  });

  mount(screen, ctx, scrollY);
}

/** A profile section with an Edit/Add link. Shows `emptyText` when there's nothing yet. */
function section(title, body, emptyText) {
  return html`
    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-title">${title}</h2>
        <a class="text-btn small" href="#/profile/edit">${body ? 'Edit' : 'Add'}<span class="visually-hidden"> ${title}</span></a>
      </div>
      ${body || html`<p class="muted">${emptyText}</p>`}
    </section>`;
}

function dateRange(start, end, current) {
  const to = current ? 'Present' : end && formatMonth(end);
  return [start && formatMonth(start), to].filter(Boolean).join(' – ');
}

function jobEntry(job) {
  const sub = [job.company, dateRange(job.start, job.end, job.current)].filter(Boolean).join(' · ');
  return html`
    <li class="entry">
      <p class="entry-title">${job.title || 'Role'}</p>
      ${sub && html`<p class="entry-sub">${sub}</p>`}
      ${job.description && html`<p class="entry-desc">${job.description}</p>`}
    </li>`;
}

function educationEntry(item) {
  const sub = [item.school, dateRange(item.start, item.end, false)].filter(Boolean).join(' · ');
  return html`
    <li class="entry">
      <p class="entry-title">${item.qualification || item.school}</p>
      ${item.qualification && sub && html`<p class="entry-sub">${sub}</p>`}
    </li>`;
}

function projectEntry(item) {
  const link = safeHttpUrl(item.link);
  const dates = dateRange(item.start, item.end, false);
  return html`
    <li class="entry">
      <p class="entry-title">${item.name}</p>
      ${(dates || link) && html`<p class="entry-sub">${dates}${dates && link && ' · '}${link && html`<a class="ext-link" href="${link}" target="_blank" rel="noopener noreferrer">${hostOf(link)}${icon('external')}</a>`}</p>`}
      ${item.description && html`<p class="entry-desc">${item.description}</p>`}
    </li>`;
}

function certificationEntry(item) {
  const link = safeHttpUrl(item.link);
  const sub = [item.issuer, item.issued && formatMonth(item.issued)].filter(Boolean).join(' · ');
  return html`
    <li class="entry">
      <p class="entry-title">${item.name}</p>
      ${(sub || link) && html`<p class="entry-sub">${sub}${sub && link && ' · '}${link && html`<a class="ext-link" href="${link}" target="_blank" rel="noopener noreferrer">View credential${icon('external')}</a>`}</p>`}
    </li>`;
}

function docRow(kind, doc) {
  const { label, accept } = DOC_KINDS[kind];
  return html`
    <div class="doc-row" data-kind="${kind}">
      <span class="doc-icon">${icon('file')}</span>
      <span class="doc-text">
        <span class="doc-label">${label}</span>
        <span class="doc-meta">${doc ? `${doc.name} · ${formatSize(doc.size)} · added ${formatTimestamp(doc.uploadedAt)}` : 'Not added yet'}</span>
      </span>
      <span class="doc-actions">
        ${doc && html`<button type="button" class="text-btn small" data-doc-action="open">View</button>`}
        <label class="text-btn small file-btn">
          ${doc ? 'Replace' : 'Add file'}
          <input type="file" class="visually-hidden" accept="${accept}" data-doc-input="${kind}">
        </label>
        ${doc && html`<button type="button" class="text-btn small danger-text" data-doc-action="remove">Remove</button>`}
      </span>
    </div>`;
}
