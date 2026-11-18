-- Recovery draft: preserves all tables and data. Test before use.
begin;
drop policy if exists "hq_links_device_read" on public."hq_parent_links";
drop policy if exists "hq_events_device_read" on public."hq_learning_events";
drop policy if exists "hq_events_family_write" on public."hq_learning_events";
drop policy if exists "hq_plans_device_read" on public."hq_study_plans";
drop policy if exists "hq_plans_family_add" on public."hq_study_plans";
drop policy if exists "hq_plans_family_edit" on public."hq_study_plans";
create policy "hq_child_and_linked_parent_read" on "public"."hq_learning_events" as PERMISSIVE for SELECT to "authenticated" using (((( SELECT auth.uid() AS uid) = learner_id) OR (EXISTS ( SELECT 1
   FROM hq_parent_links l
  WHERE ((l.learner_id = hq_learning_events.learner_id) AND (l.parent_id = ( SELECT auth.uid() AS uid)))))));
create policy "hq_child_insert_own_events" on "public"."hq_learning_events" as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT auth.uid() AS uid) = learner_id));
create policy "hq_links_visible_to_participants" on "public"."hq_parent_links" as PERMISSIVE for SELECT to "authenticated" using (((( SELECT auth.uid() AS uid) = learner_id) OR (( SELECT auth.uid() AS uid) = parent_id)));
create policy "hq_plans_add" on "public"."hq_study_plans" as PERMISSIVE for INSERT to "authenticated" with check (((( SELECT auth.uid() AS uid) = learner_id) OR (EXISTS ( SELECT 1
   FROM hq_parent_links l
  WHERE ((l.learner_id = hq_study_plans.learner_id) AND (l.parent_id = ( SELECT auth.uid() AS uid)))))));
create policy "hq_plans_edit" on "public"."hq_study_plans" as PERMISSIVE for UPDATE to "authenticated" using (((( SELECT auth.uid() AS uid) = learner_id) OR (EXISTS ( SELECT 1
   FROM hq_parent_links l
  WHERE ((l.learner_id = hq_study_plans.learner_id) AND (l.parent_id = ( SELECT auth.uid() AS uid))))))) with check (((( SELECT auth.uid() AS uid) = learner_id) OR (EXISTS ( SELECT 1
   FROM hq_parent_links l
  WHERE ((l.learner_id = hq_study_plans.learner_id) AND (l.parent_id = ( SELECT auth.uid() AS uid)))))));
create policy "hq_plans_read" on "public"."hq_study_plans" as PERMISSIVE for SELECT to "authenticated" using (((( SELECT auth.uid() AS uid) = learner_id) OR (EXISTS ( SELECT 1
   FROM hq_parent_links l
  WHERE ((l.learner_id = hq_study_plans.learner_id) AND (l.parent_id = ( SELECT auth.uid() AS uid)))))));
grant execute on function public.hq_create_invite(text), public.hq_accept_invite(text) to authenticated;
grant execute on function hq_private.create_invite(text), hq_private.accept_invite(text) to authenticated;
revoke all on public.hq_quest_events from public, anon, authenticated;
revoke execute on function public.hq_request_parent(),public.hq_issue_device_invite(text,uuid),public.hq_accept_device_invite(text),public.hq_revoke_device(uuid),public.hq_revoke_self(),public.hq_current_device(),public.hq_list_devices() from public,anon,authenticated;
commit;
