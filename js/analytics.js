// Usage data to improve the app: the "Help improve the app" switch in Settings.
//
// It's off unless the person switches it on (opt-in consent). Nothing is sent
// in this test version: version 2 connects an analytics service inside track().
//
// Rules for anyone adding tracking later (they match the privacy policy):
//   - Only call track() with an event name and simple, non-personal details,
//     e.g. track('application_added', { portal: 'Workday' }).
//   - Never send application content, notes, company names, job titles, emails,
//     phone numbers, profile details, CV / LinkedIn files, or CV check scores
//     and suggestions (the CV check only sends 'cv_check_run').
//   - Use a random device id, never the person's name or email.

import { getPref, setPref } from './prefs.js';
import { makeId } from './model.js';

const CONSENT_KEY = 'jt-usage-consent';
const DEVICE_ID_KEY = 'jt-usage-device-id';

export function hasUsageConsent() {
  return getPref(CONSENT_KEY, 'no') === 'yes';
}

export function setUsageConsent(on) {
  setPref(CONSENT_KEY, on ? 'yes' : 'no');
  // Switching off forgets the random id, so a later opt-in starts as a new device.
  if (!on) setPref(DEVICE_ID_KEY, '');
}

function deviceId() {
  let id = getPref(DEVICE_ID_KEY, '');
  if (!id) {
    id = makeId();
    setPref(DEVICE_ID_KEY, id);
  }
  return id;
}

/** Records a usage event if the person has agreed. Does nothing until version 2 adds a service. */
export function track(event, details = {}) {
  if (!hasUsageConsent()) return;
  const payload = { event, details, deviceId: deviceId(), at: new Date().toISOString() };
  // Version 2: send `payload` to the analytics service here.
  void payload;
}
