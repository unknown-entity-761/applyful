// The cookie banner: shown until someone chooses. "Accept analytics" and "No thanks"
// are equally easy, and the choice can be changed later in Settings → Analytics
// cookies. Things the app needs to work (staying signed in, settings) don't need a
// yes, so they aren't on the banner.

import { html } from '../ui.js';
import { consentChoice, setUsageConsent, trackPage } from '../analytics.js';

export function showConsentBanner() {
  if (consentChoice() || document.getElementById('consent')) return;
  const banner = document.createElement('section');
  banner.id = 'consent';
  banner.className = 'consent';
  banner.setAttribute('aria-labelledby', 'consent-title');
  banner.innerHTML = String(html`
    <h2 class="consent-title" id="consent-title">Cookies and your privacy</h2>
    <p>Foliofy keeps a few things on your device so it works, like keeping you signed in. With your OK, we’d also use analytics cookies to see how the app is used, to improve your experience. They never include your applications, profile or files.</p>
    <div class="consent-actions">
      <button type="button" class="btn" data-choice="yes">Accept analytics</button>
      <button type="button" class="btn" data-choice="no">No thanks</button>
    </div>
    <a class="consent-link" href="#/legal/cookies">Cookie policy</a>
  `);
  banner.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-choice]')?.dataset.choice;
    if (!choice) {
      if (event.target.closest('a')) banner.classList.add('consent-reading');
      return;
    }
    setUsageConsent(choice === 'yes');
    banner.remove();
    if (choice === 'yes') trackPage(location.hash);
  });
  document.body.append(banner);
}
