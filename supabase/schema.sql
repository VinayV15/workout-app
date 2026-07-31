-- Forge sync schema.
-- Run this once in your Supabase project: SQL Editor -> New query -> paste -> Run.
-- Safe to re-run; it drops and recreates the policy only.

-- One table holds every synced record. Keeping the app's own shapes in a jsonb
-- payload means adding a field to a workout never needs a migration here, and
-- the security policy stays a single rule.
create table if not exists public.records (
  -- Defaults to the caller's own id, so a client can never omit it and the
  -- policy below can never be satisfied by accident.
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  tbl        text        not null,
  id         text        not null,
  payload    jsonb,
  updated_at timestamptz not null default now(),
  deleted    boolean     not null default false,
  primary key (user_id, tbl, id)
);

-- Row-level security: a signed-in user can only ever see and write their own
-- rows. This is what makes it safe to ship the anon key in the app.
alter table public.records enable row level security;

drop policy if exists "records are private to their owner" on public.records;
create policy "records are private to their owner"
  on public.records
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Supports the sync read path.
create index if not exists records_user_updated_idx
  on public.records (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- Sharing the app with other people
-- ---------------------------------------------------------------------------
-- Nothing below needs to run — this schema is already multi-user. The policy
-- above scopes every row to `auth.uid()`, so any number of people can sign into
-- the same project from the same deployed app and each one sees only their own
-- training log. Nobody can read anyone else's rows, including through the API.
--
-- Two things worth doing in the dashboard before you share the link:
--
--   1. Authentication -> Sign In / Providers -> turn OFF "Allow new users to
--      sign up", then add each person with Authentication -> Users -> Invite.
--      Otherwise anyone who finds your URL can create an account in your
--      project. (Their data would still be private from everyone else — this is
--      about not hosting strangers.)
--
--   2. Authentication -> Emails -> consider your own SMTP. The built-in sender
--      is rate-limited to a few messages an hour, which is fine for occasional
--      sign-ins but easy to trip if several people set up on the same evening.
--
-- To check who is using it and how much space it takes:
--
--   select user_id, count(*) as records, max(updated_at) as last_active
--   from public.records group by user_id order by last_active desc;
--
-- Note that as the project owner you *can* read everyone's rows from the SQL
-- editor. Row-level security constrains the API, not the owner. Anyone who
-- would rather you not have that access should run their own free project and
-- point the app at it in Settings -> Cross-device sync -> Change project.
