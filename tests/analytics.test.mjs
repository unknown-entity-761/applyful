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
