-- Applied to the new HARUKI project as migration haruki_study_plans.
create table public.hq_study_plans (
 learner_id uuid not null references auth.users(id) on delete cascade,
 plan_id uuid not null,
 title text not null check (length(title) between 1 and 120),
 subject text not null check (length(subject) between 1 and 40),
 target_minutes integer not null check (target_minutes between 1 and 300),
 active boolean not null default true,
 updated_at timestamptz not null default now(),
 primary key (learner_id,plan_id)
);
create index hq_study_plans_learner on public.hq_study_plans(learner_id);
alter table public.hq_study_plans enable row level security;
revoke all on public.hq_study_plans from anon, authenticated;
grant select, insert, update on public.hq_study_plans to authenticated;
create policy hq_plans_read on public.hq_study_plans for select to authenticated using (
(select auth.uid())=learner_id or exists(select 1 from public.hq_parent_links l where l.learner_id=hq_study_plans.learner_id and l.parent_id=(select auth.uid())));
create policy hq_plans_add on public.hq_study_plans for insert to authenticated with check (
(select auth.uid())=learner_id or exists(select 1 from public.hq_parent_links l where l.learner_id=hq_study_plans.learner_id and l.parent_id=(select auth.uid())));
create policy hq_plans_edit on public.hq_study_plans for update to authenticated using (
(select auth.uid())=learner_id or exists(select 1 from public.hq_parent_links l where l.learner_id=hq_study_plans.learner_id and l.parent_id=(select auth.uid()))) with check (
(select auth.uid())=learner_id or exists(select 1 from public.hq_parent_links l where l.learner_id=hq_study_plans.learner_id and l.parent_id=(select auth.uid())));
