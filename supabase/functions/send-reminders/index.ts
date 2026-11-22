// Sends reminders (version 4, notifications): follow-ups due today and no-reply
// nudges, to each device that turned notifications on, at that device's chosen local
// time (outside its quiet hours). Runs every 15 minutes from Supabase Cron.
//
// Also answers a test from Settings → Notifications: a signed-in person (or guest)
// gets a test notification on their own devices only.
//
// What's due is worked out by the app's own rules, imported from the live site
// (app/js/reminders.js), so the app and this job always agree. After changing those
// rules, publish the app first, then deploy this function again.
//
// Secrets it needs (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT. Deploy with "Enforce JWT verification" off: the scheduled call
// doesn't carry a user's token, and the test checks the token itself.
// Set up: see "Notifications" in README.md.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { remindersFor, normalizeNotify, localParts, isSendingTime } from 'https://unknown-entity-761.github.io/applyful/js/reminders.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Subscription = { endpoint: string; user_id: string; p256dh: string; auth: string; settings: Record<string, unknown>; time_zone: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') || 'https://unknown-entity-761.github.io/applyful/',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  );

  // A push service says the address is gone (the browser unsubscribed): forget it.
  const send = async (sub: Subscription, payload: Record<string, unknown>) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 6 * 3600 });
      return true;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      return false;
    }
  };

  const body = await req.json().catch(() => ({}));

  // ---- A test, from Settings → Notifications ----
  if (body?.test) {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
    const { data } = await admin.auth.getUser(token);
    if (!data?.user) return reply({ error: 'Not signed in' }, 401);
    const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', data.user.id);
    let sent = 0;
    for (const sub of (subs ?? []) as Subscription[]) {
      if (await send(sub, { title: 'Applyful', body: 'Notifications are working.', url: '#/settings/notifications', tag: 'test' })) sent += 1;
    }
    return reply({ sent });
  }

  // ---- The scheduled run ----
  const now = new Date();
  const { data: subs, error } = await admin.from('push_subscriptions').select('*');
  if (error) return reply({ error: error.message }, 500);

  const appsByUser = new Map<string, Record<string, unknown>[]>();
  let sent = 0;
  for (const sub of (subs ?? []) as Subscription[]) {
    const settings = normalizeNotify(sub.settings);
    if (!isSendingTime(localParts(now, sub.time_zone).minutes, settings)) continue; // not this device's time
    if (!appsByUser.has(sub.user_id)) {
      const { data: rows } = await admin.from('applications').select('id, data').eq('user_id', sub.user_id).eq('deleted', false).limit(5000);
      appsByUser.set(sub.user_id, (rows ?? []).map((row) => ({ ...(row.data as Record<string, unknown>), id: row.id })));
    }
    const { data: done } = await admin.from('notifications_sent').select('key').eq('endpoint', sub.endpoint);
    const items = remindersFor(appsByUser.get(sub.user_id)!, settings, {
      now, timeZone: sub.time_zone, sent: new Set((done ?? []).map((row) => row.key)),
    });
    for (const item of items) {
      const ok = await send(sub, { title: item.title, body: item.body, url: item.url, ghostUrl: item.ghostUrl, actions: item.actions, tag: item.key });
      if (!ok) break;
      sent += 1;
      const keys = (item.keys ?? [item.key]).map((key: string) => ({ endpoint: sub.endpoint, key }));
      await admin.from('notifications_sent').upsert(keys, { onConflict: 'endpoint,key', ignoreDuplicates: true });
    }
  }

  // Housekeeping: forget what was sent more than 60 days ago.
  await admin.from('notifications_sent').delete().lt('sent_at', new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString());
  return reply({ devices: (subs ?? []).length, sent });
});
