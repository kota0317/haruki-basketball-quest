-- Recovery draft; keeps existing and newly recorded data. Use only after independent verification.
begin;
revoke execute on function public.hq_family_learner(),public.hq_family_create(text),public.hq_family_join(text),public.hq_family_invite(text) from public,anon,authenticated;
revoke execute on function hq_private.hq_family_learner(),hq_private.hq_family_create(text),hq_private.hq_family_join(text),hq_private.hq_family_invite(text) from public,anon,authenticated;
revoke all on public.hq_family_quest_events from public,anon,authenticated;
drop policy if exists hq_family_events_read on public.hq_learning_events;
drop policy if exists hq_family_events_insert on public.hq_learning_events;
drop policy if exists hq_family_plans_read on public.hq_study_plans;
drop policy if exists hq_family_plans_insert on public.hq_study_plans;
drop policy if exists hq_family_plans_update on public.hq_study_plans;
commit;
