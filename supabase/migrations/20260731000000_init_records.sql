-- Sync schema: one table, one security policy, one index.
--
-- This is the canonical definition of the database the app syncs against, and it
-- is applied by Supabase's GitHub integration on push. It is written to be safe
-- to re-run, so applying it to a project where the schema already exists (for
-- example one that was set up by hand before the integration was connected) is a
-- no-op rather than an error.

-- Every synced record lives here. Keeping the app's own shapes in a jsonb payload
-- means adding a field to a workout never needs a migration, and it keeps the
-- security policy down to a single rule.
create table if not exists public.records (
  -- Defaults to the caller's own id, so a client can never omit it and the policy
  -- below can never be satisfied by accident.
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  tbl        text        not null,
  id         text        not null,
  payload    jsonb,
  updated_at timestamptz not null default now(),
  deleted    boolean     not null default false,
  primary key (user_id, tbl, id)
);

-- Row-level security: a signed-in user can only ever see and write their own
-- rows. This is what makes it safe to ship the anon key inside the app.
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
