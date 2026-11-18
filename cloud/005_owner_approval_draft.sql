-- DRAFT: NOT APPLIED. Requires separate security review and end-to-end tests.
-- Supabase anonymous Auth for both roles; project-owner approval for initial and recovery parent devices.
-- A revoked device is denied by RLS immediately, even while its JWT remains valid.
-- This does NOT revoke the Supabase Auth refresh token itself.
-- Singleton stable family ID. Migration fails closed if legacy data contains more than one parent.
create table hq_private.household (
  singleton boolean primary key default true check (singleton),
  id uuid not null unique default pg_catalog.gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table hq_private.household enable row level security;
revoke all on hq_private.household from public,anon,authenticated;
insert into hq_private.household(id) select distinct parent_id from public.hq_parent_links;
alter table public.hq_parent_links drop constraint hq_parent_links_parent_id_fkey;
alter table public.hq_parent_links add constraint hq_parent_links_parent_id_fkey foreign key (parent_id) references hq_private.household(id);

-- Stable learner identity survives anonymous account loss or replacement.
create table hq_private.learners (id uuid primary key default pg_catalog.gen_random_uuid(), created_at timestamptz not null default now());
alter table hq_private.learners enable row level security;
revoke all on hq_private.learners from public,anon,authenticated;
insert into hq_private.learners(id)
  select learner_id from public.hq_parent_links union select learner_id from public.hq_learning_events union select learner_id from public.hq_study_plans
  on conflict do nothing;
alter table public.hq_parent_links drop constraint hq_parent_links_learner_id_fkey;
alter table public.hq_parent_links add constraint hq_parent_links_learner_id_fkey foreign key (learner_id) references hq_private.learners(id);
alter table public.hq_learning_events drop constraint hq_learning_events_learner_id_fkey;
alter table public.hq_learning_events add constraint hq_learning_events_learner_id_fkey foreign key (learner_id) references hq_private.learners(id);
alter table public.hq_study_plans drop constraint hq_study_plans_learner_id_fkey;
alter table public.hq_study_plans add constraint hq_study_plans_learner_id_fkey foreign key (learner_id) references hq_private.learners(id);

create table hq_private.device_grants (
  session_id uuid primary key,
  principal_id uuid not null,
  parent_id uuid not null references hq_private.household(id),
  learner_id uuid references hq_private.learners(id),
  role text not null check (role in ('parent','child')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((role = 'parent' and learner_id is null)
      or (role = 'child' and learner_id is not null))
);
alter table hq_private.device_grants enable row level security;
revoke all on hq_private.device_grants from public, anon, authenticated;
create index hq_device_parent_idx on hq_private.device_grants(parent_id, role, revoked_at);
create index hq_device_learner_idx on hq_private.device_grants(learner_id, role, revoked_at);

create table hq_private.device_invites (
  token_hash bytea primary key,
  parent_id uuid not null references hq_private.household(id),
  learner_id uuid references hq_private.learners(id),
  issuing_session uuid not null references hq_private.device_grants(session_id),
  unique (parent_id),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);
alter table hq_private.device_invites enable row level security;
revoke all on hq_private.device_invites from public, anon, authenticated;

create function hq_private.session_uuid() returns uuid language sql stable security invoker set search_path='' as $$
  select nullif(auth.jwt()->>'session_id','')::uuid
$$;
revoke all on function hq_private.session_uuid() from public,anon,authenticated;
grant execute on function hq_private.session_uuid() to authenticated;

-- The gateway validates the JWT. Device revocation is enforced separately via RLS.
-- No Supabase Auth internal table is queried or modified.
create function hq_private.token_valid() returns boolean language sql stable security invoker set search_path='' as $$
  select auth.uid() is not null and hq_private.session_uuid() is not null and coalesce((auth.jwt()->>'exp')::bigint,0) > extract(epoch from pg_catalog.statement_timestamp())
$$;
revoke all on function hq_private.token_valid() from public,anon,authenticated;
grant execute on function hq_private.token_valid() to authenticated;

-- Functions are deliberately scoped to current verified JWT + active device grant.
create function hq_private.is_active_parent(p_parent uuid) returns boolean language sql stable security definer set search_path='' as $$
  select hq_private.token_valid() and auth.uid() is not null and exists (
    select 1 from hq_private.device_grants d where d.session_id=hq_private.session_uuid()
    and d.principal_id=auth.uid() and d.parent_id=p_parent and d.role='parent' and d.revoked_at is null)
$$;
create function hq_private.can_read_learner(p_learner uuid) returns boolean language sql stable security definer set search_path='' as $$
  select hq_private.token_valid() and auth.uid() is not null and exists (
    select 1 from hq_private.device_grants d
    where d.session_id=hq_private.session_uuid() and d.principal_id=auth.uid() and d.revoked_at is null
      and ((d.role='child' and d.learner_id=p_learner)
        or (d.role='parent' and exists (select 1 from public.hq_parent_links l where l.parent_id=d.parent_id and l.learner_id=p_learner))))
$$;
create function hq_private.can_write_learner(p_learner uuid) returns boolean language sql stable security definer set search_path='' as $$
  select hq_private.token_valid() and auth.uid() is not null and exists (
    select 1 from hq_private.device_grants d where d.session_id=hq_private.session_uuid()
    and d.principal_id=auth.uid() and d.role='child' and d.learner_id=p_learner and d.revoked_at is null)
$$;
create function hq_private.can_edit_plan(p_learner uuid) returns boolean language sql stable security definer set search_path='' as $$
  select hq_private.token_valid() and auth.uid() is not null and exists (
    select 1 from hq_private.device_grants d join public.hq_parent_links l on l.parent_id=d.parent_id
    where d.session_id=hq_private.session_uuid() and d.principal_id=auth.uid()
      and d.role='parent' and d.revoked_at is null and l.learner_id=p_learner)
$$;
revoke all on function hq_private.is_active_parent(uuid), hq_private.can_read_learner(uuid), hq_private.can_write_learner(uuid), hq_private.can_edit_plan(uuid) from public,anon,authenticated;
grant execute on function hq_private.is_active_parent(uuid), hq_private.can_read_learner(uuid), hq_private.can_write_learner(uuid), hq_private.can_edit_plan(uuid) to authenticated;

-- Request ID is not an authentication secret: only project-owner SQL can approve it.
create table hq_private.parent_requests (
  request_id uuid primary key default pg_catalog.gen_random_uuid(),
  principal_id uuid not null,
  session_id uuid not null,
  expires_at timestamptz not null default (now() + interval '10 minutes')
);
alter table hq_private.parent_requests enable row level security;
revoke all on hq_private.parent_requests from public,anon,authenticated;
create function hq_private.current_parent_id() returns uuid language sql stable security definer set search_path='' as $$
  select d.parent_id from hq_private.device_grants d
  where hq_private.token_valid() and d.session_id=hq_private.session_uuid() and d.principal_id=auth.uid()
  and d.role='parent' and d.revoked_at is null
$$;
revoke all on function hq_private.current_parent_id() from public,anon,authenticated;
grant execute on function hq_private.current_parent_id() to authenticated;
create function hq_private.request_parent() returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null or not hq_private.token_valid() or not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'anonymous device session required'; end if;
 if exists(select 1 from hq_private.device_grants d where d.session_id=hq_private.session_uuid()) then raise exception 'session already registered'; end if;
 delete from hq_private.parent_requests where principal_id=auth.uid();
 insert into hq_private.parent_requests(principal_id,session_id) values(auth.uid(),hq_private.session_uuid()) returning request_id into v_id;
 return v_id;
end $$;
revoke all on function hq_private.request_parent() from public,anon,authenticated;
grant execute on function hq_private.request_parent() to authenticated;
create function public.hq_request_parent() returns uuid language sql security invoker set search_path='' as $$ select hq_private.request_parent() $$;
revoke all on function public.hq_request_parent() from public,anon,authenticated;
grant execute on function public.hq_request_parent() to authenticated;

-- Only the project owner can call this from authenticated Supabase dashboard SQL.
-- This function is not exposed to any app client, and does not edit Auth internals.
create function hq_private.owner_approve_parent(p_request uuid) returns void language plpgsql security definer set search_path='' as $$
declare req hq_private.parent_requests%rowtype; family uuid;
begin
 select * into req from hq_private.parent_requests r where r.request_id=p_request and r.expires_at>now() for update;
 if not found then raise exception 'request invalid or expired'; end if;
 insert into hq_private.household(singleton) values(true) on conflict(singleton) do nothing;
 select id into family from hq_private.household where singleton=true;
 insert into hq_private.device_grants(session_id,principal_id,parent_id,role) values(req.session_id,req.principal_id,family,'parent');
 delete from hq_private.parent_requests where request_id=p_request;
end $$;
revoke all on function hq_private.owner_approve_parent(uuid) from public,anon,authenticated;

create function hq_private.issue_device_invite(p_token text, p_learner uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
  if not hq_private.is_active_parent(hq_private.current_parent_id()) then raise exception 'active parent device required'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid token'; end if;
  if p_learner is not null and not exists(select 1 from public.hq_parent_links l where l.parent_id=hq_private.current_parent_id() and l.learner_id=p_learner) then raise exception 'learner not linked'; end if;
  delete from hq_private.device_invites where parent_id=hq_private.current_parent_id();
  insert into hq_private.device_invites(token_hash,parent_id,learner_id,issuing_session) values(extensions.digest(p_token,'sha256'),hq_private.current_parent_id(),p_learner,hq_private.session_uuid());
end $$;
create function hq_private.accept_device_invite(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare invitation hq_private.device_invites%rowtype; v_learner uuid;
begin
  if auth.uid() is null or not hq_private.token_valid() or hq_private.session_uuid() is null or not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'child device authentication required'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid token'; end if;
  select i.* into invitation from hq_private.device_invites i where i.token_hash=extensions.digest(p_token,'sha256') and i.expires_at>now() and exists (select 1 from hq_private.device_grants d where d.session_id=i.issuing_session and d.parent_id=i.parent_id and d.role='parent' and d.revoked_at is null) for update of i;
  if not found then raise exception 'invalid or expired token'; end if;
  if invitation.learner_id is null then
    insert into hq_private.learners default values returning id into v_learner;
  else
    v_learner=invitation.learner_id;
  end if;
  if invitation.learner_id is not null and not exists(select 1 from public.hq_parent_links l where l.parent_id=invitation.parent_id and l.learner_id=v_learner) then raise exception 'learner not linked'; end if;
  insert into public.hq_parent_links(learner_id,parent_id) values(v_learner,invitation.parent_id) on conflict do nothing;
  -- A reused or revoked session cannot be rebound or silently revived.
  insert into hq_private.device_grants(session_id,principal_id,parent_id,learner_id,role)
  values(hq_private.session_uuid(),auth.uid(),invitation.parent_id,v_learner,'child');
  delete from hq_private.device_invites where token_hash=extensions.digest(p_token,'sha256');
  return v_learner;
end $$;
create function hq_private.revoke_device(p_session uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not hq_private.is_active_parent(hq_private.current_parent_id()) then raise exception 'active parent device required'; end if;
  update hq_private.device_grants d set revoked_at=now()
  where d.session_id=p_session and d.parent_id=hq_private.current_parent_id() and d.revoked_at is null;
  if not found then raise exception 'device not found'; end if;
end $$;
create function hq_private.revoke_self() returns void language plpgsql security definer set search_path='' as $$
begin
  if not hq_private.token_valid() then raise exception 'authentication required'; end if;
  update hq_private.device_grants d set revoked_at=now()
    where d.session_id=hq_private.session_uuid() and d.principal_id=auth.uid() and d.revoked_at is null;
  if not found then raise exception 'device not found'; end if;
end $$;
create function hq_private.current_device() returns table(role text,learner_id uuid,parent_id uuid,session_id uuid) language sql stable security definer set search_path='' as $$
  select d.role,d.learner_id,d.parent_id,d.session_id from hq_private.device_grants d
  where hq_private.token_valid() and d.session_id=hq_private.session_uuid() and d.principal_id=auth.uid() and d.revoked_at is null
$$;
create function hq_private.list_devices() returns table(session_id uuid,role text,learner_id uuid,created_at timestamptz,revoked_at timestamptz) language sql stable security definer set search_path='' as $$
  select d.session_id,d.role,d.learner_id,d.created_at,d.revoked_at from hq_private.device_grants d
  where hq_private.is_active_parent(hq_private.current_parent_id()) and d.parent_id=hq_private.current_parent_id() order by d.created_at desc
$$;
revoke all on function hq_private.issue_device_invite(text,uuid),hq_private.accept_device_invite(text),hq_private.revoke_device(uuid),hq_private.revoke_self(),hq_private.current_device(),hq_private.list_devices() from public,anon,authenticated;
grant execute on function hq_private.issue_device_invite(text,uuid),hq_private.accept_device_invite(text),hq_private.revoke_device(uuid),hq_private.revoke_self(),hq_private.current_device(),hq_private.list_devices() to authenticated;

-- Public wrappers run as INVOKER; they expose only the deliberately scoped operations.
create function public.hq_issue_device_invite(p_token text,p_learner uuid default null) returns void language sql security invoker set search_path='' as $$ select hq_private.issue_device_invite(p_token,p_learner) $$;
create function public.hq_accept_device_invite(p_token text) returns uuid language sql security invoker set search_path='' as $$ select hq_private.accept_device_invite(p_token) $$;
create function public.hq_revoke_device(p_session uuid) returns void language sql security invoker set search_path='' as $$ select hq_private.revoke_device(p_session) $$;
create function public.hq_revoke_self() returns void language sql security invoker set search_path='' as $$ select hq_private.revoke_self() $$;
create function public.hq_current_device() returns table(role text,learner_id uuid,parent_id uuid,session_id uuid) language sql security invoker set search_path='' as $$ select * from hq_private.current_device() $$;
create function public.hq_list_devices() returns table(session_id uuid,role text,learner_id uuid,created_at timestamptz,revoked_at timestamptz) language sql security invoker set search_path='' as $$ select * from hq_private.list_devices() $$;
revoke all on function public.hq_issue_device_invite(text,uuid),public.hq_accept_device_invite(text),public.hq_revoke_device(uuid),public.hq_revoke_self(),public.hq_current_device(),public.hq_list_devices() from public,anon,authenticated;
grant execute on function public.hq_issue_device_invite(text,uuid),public.hq_accept_device_invite(text),public.hq_revoke_device(uuid),public.hq_revoke_self(),public.hq_current_device(),public.hq_list_devices() to authenticated;

-- The old invitation APIs must no longer create links without an active device.
revoke execute on function public.hq_create_invite(text),public.hq_accept_invite(text) from public,anon,authenticated;
revoke execute on function hq_private.create_invite(text),hq_private.accept_invite(text) from public,anon,authenticated;

drop policy hq_links_visible_to_participants on public.hq_parent_links;
create policy hq_links_device_read on public.hq_parent_links for select to authenticated using (hq_private.can_read_learner(learner_id));
drop policy hq_child_insert_own_events on public.hq_learning_events;
drop policy hq_child_and_linked_parent_read on public.hq_learning_events;
create policy hq_events_device_read on public.hq_learning_events for select to authenticated using (hq_private.can_read_learner(learner_id));
create policy hq_events_child_write on public.hq_learning_events for insert to authenticated with check (hq_private.can_write_learner(learner_id));
drop policy hq_plans_read on public.hq_study_plans;
drop policy hq_plans_add on public.hq_study_plans;
drop policy hq_plans_edit on public.hq_study_plans;
create policy hq_plans_device_read on public.hq_study_plans for select to authenticated using (hq_private.can_read_learner(learner_id));
create policy hq_plans_parent_add on public.hq_study_plans for insert to authenticated with check (hq_private.can_edit_plan(learner_id));
create policy hq_plans_parent_edit on public.hq_study_plans for update to authenticated using (hq_private.can_edit_plan(learner_id)) with check (hq_private.can_edit_plan(learner_id));
