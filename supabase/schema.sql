-- Applyful's online database (version 4: accounts, sync and online backup).
--
-- Run it once: Supabase → your project → SQL Editor → New query → paste all of this → Run.
-- It's safe to run again: it only adds what's missing.
--
-- Everything is protected by row level security: a signed-in person can only read
-- and change their own rows and files. The publishable key in the app can't get
-- around that.
--
-- What's stored:
--   applications  one row per job application; `data` is the app's own record
--   profiles      one row per person; `data` is their profile
--   consents      what someone agreed to (terms, privacy policy, emails) and when
--   documents     a private file store for the CV and LinkedIn PDF, one folder per person
-- Devices sync by comparing `updated_at` (newest copy wins, as with backups), and fetch
-- only what changed since `synced_at`. Deleted applications are kept as `deleted = true`
-- so the deletion reaches every device.

-- ---- Tables ----

create table if not exists public.applications (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists applications_synced_at on public.applications (user_id, synced_at);

create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now()
);

create table if not exists public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document text not null check (document in ('terms', 'privacy', 'emails')),
  version text not null,
  agreed boolean not null,
  recorded_at timestamptz not null default now()
);

-- synced_at is set by the server on every change, so devices can ask for "what's new".
create or replace function public.touch_synced_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.synced_at := now();
  return new;
end;
$$;

drop trigger if exists applications_touch on public.applications;
create trigger applications_touch before insert or update on public.applications
  for each row execute function public.touch_synced_at();

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before insert or update on public.profiles
  for each row execute function public.touch_synced_at();

-- ---- Access for signed-in people ----
-- New Supabase projects don't open new tables to anyone automatically. Signed-in
-- people get these rights, and row level security (below) then limits them to their
-- own rows. Signed-out visitors get nothing.

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.applications to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert on public.consents to authenticated;

-- ---- Row level security: only your own rows ----

alter table public.applications enable row level security;
alter table public.profiles enable row level security;
alter table public.consents enable row level security;

drop policy if exists "Own applications" on public.applications;
create policy "Own applications" on public.applications
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Own profile" on public.profiles;
create policy "Own profile" on public.profiles
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Consents are a record: they can be added and read, not changed or removed.
drop policy if exists "Read own consents" on public.consents;
create policy "Read own consents" on public.consents
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Add own consents" on public.consents;
create policy "Add own consents" on public.consents
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ---- CV and LinkedIn files: a private bucket, one folder per person ----

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

drop policy if exists "Read own documents" on storage.objects;
create policy "Read own documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Add own documents" on storage.objects;
create policy "Add own documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Replace own documents" on storage.objects;
create policy "Replace own documents" on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Remove own documents" on storage.objects;
create policy "Remove own documents" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---- Deleting your account (FOL-66) ----
-- Removes the sign-in, and with it (on delete cascade) every row above. The app
-- removes the person's files from the documents bucket first.

create or replace function public.delete_my_account() returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- =====================================================================
-- Added 22 Nov 2026: CV and LinkedIn files in your account, and analytics.
-- Run the whole file again in the SQL Editor; everything above is safe to re-run.
-- =====================================================================

-- ---- Which version of each file is newest, plus the CV check for that CV ----
-- The files themselves are in the private 'documents' bucket at <user id>/cv and
-- <user id>/linkedin. A deleted file is kept here as deleted = true, so the deletion
-- reaches every device.

create table if not exists public.documents (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('cv', 'linkedin')),
  name text not null default '',
  type text not null default '',
  size integer not null default 0,
  uploaded_at timestamptz,
  deleted boolean not null default false,
  cv_check jsonb,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, kind)
);

drop trigger if exists documents_touch on public.documents;
create trigger documents_touch before insert or update on public.documents
  for each row execute function public.touch_synced_at();

alter table public.documents enable row level security;
grant select, insert, update, delete on public.documents to authenticated;

drop policy if exists "Own documents" on public.documents;
create policy "Own documents" on public.documents
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---- Analytics, only from people who accepted analytics cookies ----
-- Anonymous: a random device id from the analytics cookie, never a name, email or
-- account id, and never anything from applications, the profile or files.
-- Anyone can add an event; nobody can read them through the app (only you, in the
-- Supabase dashboard).

create table if not exists public.events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event text not null check (char_length(event) between 1 and 60),
  page text check (char_length(page) <= 80),
  details jsonb not null default '{}'::jsonb check (pg_column_size(details) <= 2000),
  device_id text check (char_length(device_id) <= 64),
  app_version text check (char_length(app_version) <= 40),
  layout text check (layout in ('phone', 'computer')),
  signed_in boolean not null default false
);

create index if not exists events_created_at on public.events (created_at);

alter table public.events enable row level security;
grant insert on public.events to anon, authenticated;

drop policy if exists "Anyone can add an event" on public.events;
create policy "Anyone can add an event" on public.events
  for insert to anon, authenticated
  with check (true);

-- ---- The newest copy always wins, on the server too ----
-- A device sends its copy with the time it was last changed. If the account already
-- has a newer copy (changed on another device), the older one is quietly ignored
-- instead of overwriting it. Runs before the synced_at stamp ("0_" sorts first).

create or replace function public.keep_newest() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at < old.updated_at then
    return null; -- skip this update: the account's copy is newer
  end if;
  return new;
end;
$$;

drop trigger if exists applications_0_keep_newest on public.applications;
create trigger applications_0_keep_newest before update on public.applications
  for each row execute function public.keep_newest();

drop trigger if exists profiles_0_keep_newest on public.profiles;
create trigger profiles_0_keep_newest before update on public.profiles
  for each row execute function public.keep_newest();

drop trigger if exists documents_0_keep_newest on public.documents;
create trigger documents_0_keep_newest before update on public.documents
  for each row execute function public.keep_newest();

-- =====================================================================
-- Added 22 Nov 2026 (later): online copies without an account (guest sessions).
-- Needs Authentication → Sign In / Providers → "Allow anonymous sign-ins" on.
-- Guests use the same tables and rules as accounts: only their own rows and files.
-- =====================================================================

-- ---- Guests nobody has used for a year ----
-- A guest's online copy can only be opened from the browser that made it. If that
-- browser hasn't opened Applyful for 12 months, the copy is deleted. The scheduled job
-- in supabase/functions/delete-unused-guests asks for the list, deletes each guest's
-- files, then the guest (which removes its rows). Activity = signing in or refreshing
-- the session, which the app does whenever it's opened after an hour or more.

create or replace function public.unused_guests(unused_for interval default interval '12 months')
returns table (id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where u.is_anonymous
    and greatest(
      u.created_at,
      coalesce(u.last_sign_in_at, u.created_at),
      coalesce((select max(r.created_at) from auth.refresh_tokens r where r.user_id = u.id::text), u.created_at)
    ) < now() - unused_for
  order by u.created_at
  limit 500;
$$;

revoke all on function public.unused_guests(interval) from public, anon, authenticated;
grant execute on function public.unused_guests(interval) to service_role;

-- =====================================================================
-- Added 22 Nov 2026 (version 4.2): CV history.
-- =====================================================================

-- Which version the current CV is, and when it was first added, so every device
-- uses the same version ids (applications can say which CV was sent).
alter table public.documents add column if not exists version_id text check (char_length(version_id) <= 64);
alter table public.documents add column if not exists added_at timestamptz;

-- ---- Earlier CVs ----
-- One row per earlier CV; the file is in the private 'documents' bucket at
-- <user id>/cv-versions/<id>. A deleted one is kept as deleted = true, so the
-- deletion reaches every device. The app keeps the newest 10.

create table if not exists public.cv_versions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  name text not null default '',
  type text not null default '',
  size integer not null default 0,
  added_at timestamptz,
  cv_check jsonb check (cv_check is null or pg_column_size(cv_check) <= 20000),
  deleted boolean not null default false,
  updated_at timestamptz not null,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

drop trigger if exists cv_versions_touch on public.cv_versions;
create trigger cv_versions_touch before insert or update on public.cv_versions
  for each row execute function public.touch_synced_at();

drop trigger if exists cv_versions_0_keep_newest on public.cv_versions;
create trigger cv_versions_0_keep_newest before update on public.cv_versions
  for each row execute function public.keep_newest();

alter table public.cv_versions enable row level security;
grant select, insert, update, delete on public.cv_versions to authenticated;

drop policy if exists "Own CV versions" on public.cv_versions;
create policy "Own CV versions" on public.cv_versions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- =====================================================================
-- Added 22 Nov 2026 (review): sensible size limits.
-- Guests can be created without an email, so nobody should be able to store huge
-- amounts through the app's tables. These are far above what the app ever sends.
-- ("not valid" = they apply to new and changed rows; nothing already stored is checked.)
-- =====================================================================

alter table public.applications drop constraint if exists applications_data_size;
alter table public.applications add constraint applications_data_size check (pg_column_size(data) <= 200000) not valid;

alter table public.profiles drop constraint if exists profiles_data_size;
alter table public.profiles add constraint profiles_data_size check (pg_column_size(data) <= 500000) not valid;

alter table public.documents drop constraint if exists documents_cv_check_size;
alter table public.documents add constraint documents_cv_check_size check (cv_check is null or pg_column_size(cv_check) <= 20000) not valid;

-- At most 5,000 applications per person (deleted ones included).
create or replace function public.applications_limit() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.applications where user_id = new.user_id) >= 5000 then
    raise exception 'Too many applications for one person';
  end if;
  return new;
end;
$$;

drop trigger if exists applications_limit on public.applications;
create trigger applications_limit before insert on public.applications
  for each row execute function public.applications_limit();

-- =====================================================================
-- Added 22 Nov 2026 (version 6): cover letters.
-- =====================================================================

-- One row per cover letter; `data` is the app's own record (company, job title, the
-- letter, which applications it's linked to). Deleted ones are kept as deleted = true.
create table if not exists public.cover_letters (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  data jsonb not null check (pg_column_size(data) <= 100000),
  updated_at timestamptz not null,
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (user_id, id)
);

drop trigger if exists cover_letters_touch on public.cover_letters;
create trigger cover_letters_touch before insert or update on public.cover_letters
  for each row execute function public.touch_synced_at();

drop trigger if exists cover_letters_0_keep_newest on public.cover_letters;
create trigger cover_letters_0_keep_newest before update on public.cover_letters
  for each row execute function public.keep_newest();

alter table public.cover_letters enable row level security;
grant select, insert, update, delete on public.cover_letters to authenticated;

drop policy if exists "Own cover letters" on public.cover_letters;
create policy "Own cover letters" on public.cover_letters
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- =====================================================================
-- Added 23 Nov 2026 (version 4): notifications.
-- Each device that turns notifications on saves its push address (from the browser's
-- push service) and its reminder settings here. The send-reminders job reads them
-- every 15 minutes and sends what's due. A push address belongs to whoever turned it
-- on last on that device, so a shared browser never gets someone else's reminders.
-- =====================================================================

create table if not exists public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) <= 1000),
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  settings jsonb not null default '{}'::jsonb check (pg_column_size(settings) <= 2000),
  time_zone text not null default 'UTC' check (char_length(time_zone) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
grant select, delete on public.push_subscriptions to authenticated;

drop policy if exists "Own push subscriptions" on public.push_subscriptions;
create policy "Own push subscriptions" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Remove own push subscriptions" on public.push_subscriptions;
create policy "Remove own push subscriptions" on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Saving goes through this function, so a device moves to whoever signed in last.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_settings jsonb, p_time_zone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, settings, time_zone, updated_at)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, coalesce(p_settings, '{}'::jsonb), coalesce(nullif(p_time_zone, ''), 'UTC'), now())
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        settings = excluded.settings, time_zone = excluded.time_zone, updated_at = now();
end;
$$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke all on function public.save_push_subscription(text, text, text, jsonb, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, jsonb, text) to authenticated;
revoke all on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- What's been sent to each device, so nothing is sent twice. Only the job uses it.
create table if not exists public.notifications_sent (
  endpoint text not null references public.push_subscriptions (endpoint) on delete cascade,
  key text not null check (char_length(key) <= 200),
  sent_at timestamptz not null default now(),
  primary key (endpoint, key)
);

alter table public.notifications_sent enable row level security;
-- No grants: only the send-reminders job (with the service role) reads and writes it.
