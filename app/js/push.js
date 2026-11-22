// Notifications on this device (version 4, web notifications for now; decided
// 23 Nov 2026). The browser gives the app a private "push address"; it's saved with
// your reminder settings on Foliofy's server, and a small job there
// (supabase/functions/send-reminders) sends reminders at your chosen time.
//
// That job can only see what's online, so notifications need an account or the online
// copy. On iPhone they only work once Foliofy is on the Home Screen.
//
// Settings are also kept on the device: Home and each application use them to show
// nudges in the app itself, with or without notifications.

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, VAPID_PUBLIC_KEY } from './config.js';
import { accessToken, onlineUser, setBeforeSignOut } from './auth.js';
import { getPref, setPref } from './prefs.js';
import { normalizeNotify } from './reminders.js';

const SETTINGS_KEY = 'jt-notify';
const ON_KEY = 'jt-push-on';

export function notificationSettings() {
  try {
    return normalizeNotify(JSON.parse(getPref(SETTINGS_KEY, '{}')));
  } catch {
    return normalizeNotify({});
  }
}

const isIos = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true);

/**
 * Where notifications stand on this device:
 * 'not-set-up' | 'unsupported' | 'needs-home-screen' | 'needs-data-online' | 'blocked' | 'off' | 'on'
 */
export function pushState() {
  if (!VAPID_PUBLIC_KEY) return 'not-set-up';
  if (isIos() && !isStandalone()) return 'needs-home-screen';
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (!onlineUser()) return 'needs-data-online';
  if (Notification.permission === 'denied') return 'blocked';
  return getPref(ON_KEY, '') === 'on' ? 'on' : 'off';
}

const keyBytes = (base64url) => {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
};
const toBase64url = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function rpc(name, body) {
  const token = await accessToken();
  if (!token) throw new Error('Sign in, or keep a copy online, to use notifications.');
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Couldn’t reach Foliofy’s server. Check your connection and try again.');
  }
  if (!response.ok) throw new Error('Couldn’t save your notification settings just now. Try again in a minute.');
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function saveOnServer(subscription, settings) {
  const json = subscription.toJSON();
  await rpc('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh ?? toBase64url(subscription.getKey('p256dh')),
    p_auth: json.keys?.auth ?? toBase64url(subscription.getKey('auth')),
    p_settings: settings,
    p_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
}

/** Asks the browser for permission (call it from a tap), then turns notifications on. */
export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied'
    ? 'Notifications are blocked for Foliofy. Allow them in your browser’s site settings, then try again.'
    : 'Notifications weren’t turned on.');
  const registration = await navigator.serviceWorker.ready;
  const subscription = (await registration.pushManager.getSubscription())
    ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
  await saveOnServer(subscription, notificationSettings());
  setPref(ON_KEY, 'on');
}

/** Turns notifications off on this device, and removes its push address from the server. */
export async function disablePush() {
  const subscription = await currentSubscription().catch(() => null);
  setPref(ON_KEY, '');
  if (!subscription) return;
  await rpc('remove_push_subscription', { p_endpoint: subscription.endpoint }).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
}

/** Saves new settings here, and on the server when notifications are on. */
export async function saveNotificationSettings(next) {
  const settings = normalizeNotify(next);
  setPref(SETTINGS_KEY, JSON.stringify(settings));
  if (pushState() !== 'on') return settings;
  const subscription = await currentSubscription();
  if (subscription) await saveOnServer(subscription, settings);
  return settings;
}

/** Asks the server to send a test notification to this account's devices. */
export async function sendTestNotification() {
  const token = await accessToken();
  if (!token) throw new Error('Sign in, or keep a copy online, to use notifications.');
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/send-reminders`, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true }),
    });
  } catch {
    throw new Error('Couldn’t reach Foliofy’s server. Check your connection and try again.');
  }
  if (response.status === 404) throw new Error('The reminders job isn’t set up on the server yet.');
  if (!response.ok) throw new Error('The test notification couldn’t be sent just now.');
}

// Signing out: this device's push address shouldn't keep getting that account's
// reminders. (auth.js calls this while the session is still good.)
setBeforeSignOut(async () => {
  if (getPref(ON_KEY, '') !== 'on') return;
  await disablePush().catch(() => {});
});
