// First-time setup (#/welcome), shown the first time someone opens the app on a
// device with nothing saved yet. Two ways to fill in the profile, both ending on the
// same form, and nothing is saved until you tap Confirm:
//   - Upload your CV: it's read on this device (#/welcome/cv), then the form opens
//     with what was found highlighted.
//   - Fill it in yourself (#/welcome/form).
// Only the first name is required. "Skip for now" goes straight to Home.
// In version 4 this runs straight after signing up.

import { html, icon, createScreen, mount, showToast } from '../ui.js';
import { APP_NAME } from '../config.js';
import { DOC_KINDS, saveDocumentFile, markSetupDone } from '../profile.js';
import { navigate } from '../router.js';

export async function renderWelcome(ctx) {
  const screen = createScreen(html`
    <header class="topbar topbar-large">
      <div class="welcome">
        <p class="welcome-app">${APP_NAME}</p>
        <h1 class="topbar-title" tabindex="-1">Welcome</h1>
      </div>
    </header>
    <main class="content">
      <section class="panel">
        <h2 class="panel-title">Let’s set up your profile</h2>
        <p>It’s used to greet you, to check your CV, and later to fill in cover letters. It’s saved on this device, and in your account if you sign in.</p>
        <div class="stack">
          <label class="btn primary block file-btn">
            ${icon('upload')} Upload your CV
            <input type="file" accept="${DOC_KINDS.cv.accept}" class="visually-hidden" data-action="upload">
          </label>
          <a class="btn block" href="#/welcome/form">${icon('pencil')} Fill it in myself</a>
        </div>
        <p class="hint">A PDF or Word file. It’s read here on your device, and you check everything before it’s saved.</p>
      </section>
      <button type="button" class="link-btn quiet" data-action="skip">Skip for now</button>
    </main>
  `);

  screen.querySelector('[data-action="upload"]').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      await saveDocumentFile('cv', file);
    } catch (error) {
      showToast(error.message || 'Couldn’t save that file. Please try another.');
      return;
    }
    navigate('/welcome/cv');
  });

  screen.querySelector('[data-action="skip"]').addEventListener('click', () => {
    markSetupDone();
    navigate('/', { replace: true });
  });

  mount(screen, ctx);
}
