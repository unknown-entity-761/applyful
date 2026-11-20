// Light / dark mode. The choice is 'system' (match the phone), 'light' or 'dark'.
// The page's <html data-theme="..."> attribute is always 'light' or 'dark';
// styles.css picks its colors from that. index.html sets it before the page draws.

import { getPref, setPref } from './prefs.js';

const KEY = 'jt-theme'; // keep in sync with the small script in index.html
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

export const THEMES = [
  { id: 'system', label: 'Match phone' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export function getThemeChoice() {
  const choice = getPref(KEY, 'system');
  return THEMES.some((theme) => theme.id === choice) ? choice : 'system';
}

export function setThemeChoice(choice) {
  setPref(KEY, choice);
  applyTheme();
}

export function applyTheme() {
  const choice = getThemeChoice();
  const dark = choice === 'dark' || (choice === 'system' && systemDark.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#101215' : '#f5f6f8');
}

// Follow the phone when it switches between light and dark (only matters for 'system').
systemDark.addEventListener?.('change', applyTheme);
