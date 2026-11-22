// Two one-time questions, shown at the bottom of the screen until answered:
//
// 1. The cookie banner. "Accept analytics" and "No thanks" are equally easy, and the
//    choice can be changed later in Settings → Analytics cookies. Things the app needs
//    to work (staying signed in, settings) don't need a yes, so they aren't on it.
// 2. Keeping a copy online without an account, asked once there's something to keep
//    (see sync.js). The answer can be changed later in Settings → Backup, restore and
//    storage. It goes away by itself if that's chosen elsewhere, or you sign in.
//
// Only one shows at a time: the cookie banner first.

import { html } from '../ui.js';
import { consentChoice, setUsageConsent, trackPage } from '../analytics.js';
import { onlineCopyChoice, setOnlineCopy, onlineUser } from '../auth.js';

let copyQuestionWaiting = false;

export function showConsentBanner() {
  if (consentChoice() || document.getElementById('consent')) return;
  const banner = bottomBanner('consent', html`
    <h2 class="consent-title" id="consent-title">Cookies and your privacy</h2>
    <p>Applyful keeps a few things on your device so it works, like keeping you signed in. With your OK, we’d also use analytics cookies to see how the app is used, to improve your experience. They never include your applications, profile or files.</p>
    <div class="consent-actions">
      <button type="button" class="btn" data-choice="yes">Accept analytics</button>
      <button type="button" class="btn" data-choice="no">No thanks</button>
    </div>
    <a class="consent-link" href="#/legal/cookies">Cookie policy</a>
  `, (choice) => {
    setUsageConsent(choice === 'yes');
    if (choice === 'yes') trackPage(location.hash);
    if (copyQuestionWaiting) showOnlineCopyQuestion();
  });
  document.body.append(banner);
}

/** Asks once whether to keep a copy of this device's data online, without an account. */
export function showOnlineCopyQuestion() {
  if (onlineCopyChoice() || onlineUser() || document.getElementById('online-copy')) return;
  if (document.getElementById('consent')) {
    copyQuestionWaiting = true; // after the cookie banner
    return;
  }
  copyQuestionWaiting = false;
  const banner = bottomBanner('online-copy', html`
    <h2 class="consent-title" id="online-copy-title">Keep a copy online?</h2>
    <p>Applyful can keep a copy of your applications, profile, CV and LinkedIn files on its server, linked to this browser. If the app’s storage on this device is lost, they come back. To open them on other devices too, create an account.</p>
    <div class="consent-actions">
      <button type="button" class="btn primary" data-choice="yes">Keep a copy online</button>
      <button type="button" class="btn" data-choice="no">This device only</button>
    </div>
    <a class="consent-link" href="#/legal/privacy">Privacy policy</a>
  `, (choice) => {
    // Chosen elsewhere (Settings, another tab) or signed in meanwhile: nothing to do.
    if (onlineCopyChoice() || onlineUser()) return;
    setOnlineCopy(choice === 'yes');
  });
  const stale = () => {
    if (!banner.isConnected) return;
    if (onlineCopyChoice() || (onlineUser() && !onlineUser().guest)) banner.remove();
  };
  window.addEventListener('applyful:online-copy-changed', stale);
  window.addEventListener('applyful:auth-changed', stale);
  window.addEventListener('storage', (event) => { if (event.key === 'jt-online-copy') stale(); });
  document.body.append(banner);
  // It appears while you're using the app, so move to it (screen readers announce it).
  const title = banner.querySelector('.consent-title');
  title.tabIndex = -1;
  title.focus({ preventScroll: true });
}

function bottomBanner(id, content, onChoice) {
  const banner = document.createElement('section');
  banner.id = id;
  banner.className = 'consent';
  banner.setAttribute('aria-labelledby', `${id}-title`);
  banner.innerHTML = String(content);
  banner.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-choice]')?.dataset.choice;
    if (!choice) {
      if (event.target.closest('a')) banner.classList.add('consent-reading');
      return;
    }
    banner.remove();
    onChoice(choice);
  });
  return banner;
}
