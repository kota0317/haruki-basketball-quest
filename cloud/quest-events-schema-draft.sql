-- Test-only draft. Apply to production only after backup, restoration and live authorization QA.
create table public.hq_quest_events (
  learner_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null,
  clock bigint not null check (clock between 1 and 9007199254740991),
  kind text not null check (kind in ('menu','completion')),
  target text not null check (length(target) between 1 and 100),
  prior uuid,
  value jsonb,
  created_at timestamptz not null default now(),
  primary key (learner_id,event_id),
  check (value is null or (jsonb_typeof(value) = 'object' and pg_column_size(value) <= 8192)),
  check (kind <> 'menu' or value is not null)
);
create index hq_quest_events_order on public.hq_quest_events (learner_id,clock,event_id);
alter table public.hq_quest_events enable row level security;
revoke all on public.hq_quest_events from public,anon,authenticated;
grant select,insert on public.hq_quest_events to authenticated;
create policy hq_quest_read on public.hq_quest_events for select to authenticated using (hq_private.can_read_learner(learner_id));
create policy hq_quest_insert on public.hq_quest_events for insert to authenticated with check (hq_private.can_write_learner(learner_id));
