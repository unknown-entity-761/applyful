// Deletes online copies made without an account (guests) that nobody has opened for
// 12 months: first each guest's files (CV, LinkedIn PDF and earlier CVs), then the
// guest itself, which removes its applications, profile and other rows (on delete cascade).
//
// Runs once a day from Supabase Cron (Integrations → Cron), with "Enforce JWT
// verification" off. That's safe: whoever starts it, it only deletes what the privacy
// policy says is deleted after 12 months.
// Set up: see "Deleting unused guest copies" in README.md.

import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async () => {
  // Supabase provides these to every Edge Function; the key never leaves the server.
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: guests, error } = await admin.rpc('unused_guests');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let deleted = 0;
  const failed: string[] = [];
  for (const { id } of guests ?? []) {
    const { data: earlier } = await admin.storage.from('documents').list(`${id}/cv-versions`, { limit: 100 });
    const earlierCvs = (earlier ?? []).map((file) => `${id}/cv-versions/${file.name}`);
    const files = await admin.storage.from('documents').remove([`${id}/cv`, `${id}/linkedin`, ...earlierCvs]);
    const user = files.error ? files : await admin.auth.admin.deleteUser(id);
    if (user.error) failed.push(id);
    else deleted += 1;
  }
  return Response.json({ deleted, failed: failed.length });
});
