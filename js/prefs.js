// Small per-device preferences (theme, sort order, first name), kept in localStorage.
// Some private windows block it, so every read and write is guarded and falls back quietly.

export function getPref(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function setPref(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not saved. That's fine: it's only a preference.
  }
}
