-- Applied to the dedicated HARUKI project as migration haruki_initial_events.
-- Parent/learner links must be created by a trusted project administrator after
-- verifying both account IDs out of band. No client can create or modify a link.
create table public.hq_parent_links (
  learner_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (learner_id, parent_id),
  check (learner_id <> parent_id)
);
create index hq_parent_links_parent_idx on public.hq_parent_links(parent_id, learner_id);
alter table public.hq_parent_links enable row level security;
revoke all on public.hq_parent_links from anon, authenticated;
grant select on public.hq_parent_links to authenticated;
create policy hq_links_visible_to_participants on public.hq_parent_links
  for select to authenticated using (
    (select auth.uid()) = learner_id or (select auth.uid()) = parent_id
  );

-- Immutable client-generated event IDs make retries idempotent; duplicates must
-- be reconciled by fetching the existing event and comparing payloads.
create table public.hq_learning_events (
  learner_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  event_type text not null check (event_type in ('study_session','answer','match','mock_exam')),
  occurred_at timestamptz,
  occurred_on date not null, -- Japan-local date, also used for legacy date-only records
  schema_version integer not null default 1 check (schema_version = 1),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 16384),
  created_at timestamptz not null default now(),
  primary key (learner_id,event_id)
);
create index hq_events_time_idx on public.hq_learning_events(learner_id, occurred_at desc);
alter table public.hq_learning_events enable row level security;
revoke all on public.hq_learning_events from anon, authenticated;
grant select, insert on public.hq_learning_events to authenticated;
create policy hq_child_insert_own_events on public.hq_learning_events
  for insert to authenticated with check ((select auth.uid()) = learner_id);
create policy hq_child_and_linked_parent_read on public.hq_learning_events
  for select to authenticated using (
    (select auth.uid()) = learner_id or exists (
      select 1 from public.hq_parent_links l
      where l.learner_id = hq_learning_events.learner_id
        and l.parent_id = (select auth.uid())
    )
  );
