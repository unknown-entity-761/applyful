// "Add to home screen" support.
// Android Chrome (and desktop Chrome/Edge) offer to install the app; we keep that offer
// so Settings can show an Install button. iPhone has no such offer: people use
// Safari's Share > Add to Home Screen, which Settings explains.

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
});

export function canPromptInstall() {
  return deferredPrompt !== null;
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}

/** True when running from the home screen rather than a browser tab. */
export function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
