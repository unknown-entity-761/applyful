// Analytics: nothing is sent without consent, and screen names never carry ids or tokens.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenName, track, hasUsageConsent } from '../app/js/analytics.js';

test('screen names drop application ids and sign-in tokens', () => {
  assert.equal(screenName('#/a/3f2a9c1e-5b7d/edit'), '/a/:id/edit');
  assert.equal(screenName('#/a/3f2a9c1e-5b7d'), '/a/:id');
  assert.equal(screenName('#/legal/privacy'), '/legal/privacy');
  assert.equal(screenName('#access_token=secret&refresh_token=also-secret&type=signup'), '/email-link');
  assert.equal(screenName(''), '/');
});

test('without consent, nothing is sent', () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(null, { status: 201 }); };
  try {
    assert.equal(hasUsageConsent(), false, 'not asked yet means no');
    track('page_view', {}, '#/applications');
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('cookies from when the app was called Foliofy move to the new names, keeping the choice', async () => {
  const { moveOldCookies } = await import('../app/js/analytics.js');
  const { setPref } = await import('../app/js/prefs.js');
  const jar = new Map();
  const realDocument = globalThis.document;
  const realStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const saved = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, String(value)) } });
  globalThis.document = {
    get cookie() { return [...jar].map(([name, value]) => `${name}=${value}`).join('; '); },
    set cookie(text) {
      const [pair, ...attributes] = text.split('; ');
      const name = pair.slice(0, pair.indexOf('='));
      const maxAge = attributes.find((part) => part.startsWith('Max-Age='));
      if (maxAge && Number(maxAge.slice('Max-Age='.length)) <= 0) jar.delete(name);
      else jar.set(name, pair.slice(name.length + 1));
    },
  };
  try {
    jar.set('foliofy_consent', 'yes');
    jar.set('foliofy_id', 'device-1');
    setPref('jt-usage-consent', `yes:${Date.now() - 30 * 86400 * 1000}`);
    moveOldCookies();
    assert.equal(jar.get('applyful_consent'), 'yes');
    assert.equal(jar.get('applyful_id'), 'device-1', 'the same device id, so it is not counted twice');
    assert.equal(jar.has('foliofy_consent') || jar.has('foliofy_id'), false, 'the old cookies are removed');
    assert.equal(hasUsageConsent(), true, 'nobody is asked again');

    // A choice older than 12 months isn't carried over: the banner asks again.
    jar.clear();
    jar.set('foliofy_consent', 'yes');
    setPref('jt-usage-consent', `yes:${Date.now() - 400 * 86400 * 1000}`);
    moveOldCookies();
    assert.equal(jar.has('applyful_consent'), false);
    assert.equal(jar.has('foliofy_consent'), false);
  } finally {
    globalThis.document = realDocument;
    if (realStorage) Object.defineProperty(globalThis, 'localStorage', realStorage);
    else delete globalThis.localStorage;
  }
});
