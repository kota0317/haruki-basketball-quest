-- Isolated-test draft only. Additive; does not drop existing policies or change legacy FKs.
create table hq_private.hq_family_members (
 principal_id uuid primary key references auth.users(id),
 learner_id uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table hq_private.hq_family_invites (
 token_hash bytea primary key,
 learner_id uuid not null references auth.users(id),
 expires_at timestamptz not null default now()+interval '15 minutes'
);
alter table hq_private.hq_family_members enable row level security;
alter table hq_private.hq_family_invites enable row level security;
revoke all on hq_private.hq_family_members,hq_private.hq_family_invites from public,anon,authenticated;
create function hq_private.hq_family_learner() returns uuid language sql stable security definer set search_path='' as $$
 select learner_id from hq_private.hq_family_members where principal_id=auth.uid()
$$;
create function hq_private.hq_family_create(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null or not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'anonymous session required'; end if;
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'invalid code'; end if;
 insert into hq_private.hq_family_members(principal_id,learner_id) values(u,u);
 insert into hq_private.hq_family_invites(token_hash,learner_id) values(extensions.digest(p_token,'sha256'),u);
 return u;
end $$;
create function hq_private.hq_family_join(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); owner uuid;
begin
 if u is null or not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'anonymous session required'; end if;
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'invalid code'; end if;
 select learner_id into owner from hq_private.hq_family_invites where token_hash=extensions.digest(p_token,'sha256') and expires_at>now() for update;
 if owner is null or owner=u then raise exception 'invalid or expired code'; end if;
 insert into hq_private.hq_family_members(principal_id,learner_id) values(u,owner);
 delete from hq_private.hq_family_invites where token_hash=extensions.digest(p_token,'sha256');
 return owner;
end $$;
create function hq_private.hq_family_invite(p_token text) returns void language plpgsql security definer set search_path='' as $$
declare owner uuid:=hq_private.hq_family_learner();
begin
 if owner is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'member and valid code required'; end if;
 delete from hq_private.hq_family_invites where learner_id=owner;
 insert into hq_private.hq_family_invites(token_hash,learner_id) values(extensions.digest(p_token,'sha256'),owner);
end $$;
revoke all on function hq_private.hq_family_learner(),hq_private.hq_family_create(text),hq_private.hq_family_join(text),hq_private.hq_family_invite(text) from public,anon,authenticated;
grant execute on function hq_private.hq_family_learner(),hq_private.hq_family_create(text),hq_private.hq_family_join(text),hq_private.hq_family_invite(text) to authenticated;
create function public.hq_family_learner() returns uuid language sql stable security invoker set search_path='' as $$select hq_private.hq_family_learner()$$;
create function public.hq_family_create(p_token text) returns uuid language sql security invoker set search_path='' as $$select hq_private.hq_family_create(p_token)$$;
create function public.hq_family_join(p_token text) returns uuid language sql security invoker set search_path='' as $$select hq_private.hq_family_join(p_token)$$;
create function public.hq_family_invite(p_token text) returns void language sql security invoker set search_path='' as $$select hq_private.hq_family_invite(p_token)$$;
revoke all on function public.hq_family_learner(),public.hq_family_create(text),public.hq_family_join(text),public.hq_family_invite(text) from public,anon,authenticated;
grant execute on function public.hq_family_learner(),public.hq_family_create(text),public.hq_family_join(text),public.hq_family_invite(text) to authenticated;
create policy hq_family_events_read on public.hq_learning_events for select to authenticated using (learner_id=(select hq_private.hq_family_learner()));
create policy hq_family_events_insert on public.hq_learning_events for insert to authenticated with check (learner_id=(select hq_private.hq_family_learner()));
create policy hq_family_plans_read on public.hq_study_plans for select to authenticated using (learner_id=(select hq_private.hq_family_learner()));
create policy hq_family_plans_insert on public.hq_study_plans for insert to authenticated with check (learner_id=(select hq_private.hq_family_learner()));
create policy hq_family_plans_update on public.hq_study_plans for update to authenticated using (learner_id=(select hq_private.hq_family_learner())) with check (learner_id=(select hq_private.hq_family_learner()));
create table public.hq_family_quest_events (
 learner_id uuid not null references auth.users(id),event_id uuid not null,
 clock bigint not null check(clock between 1 and 9007199254740991),kind text not null check(kind in ('menu','completion')),
 target text not null check(length(target) between 1 and 100),prior uuid,value jsonb,created_at timestamptz not null default now(),
 primary key(learner_id,event_id),check(value is null or (jsonb_typeof(value)='object' and pg_column_size(value)<=8192)),check(kind<>'menu' or value is not null)
);
create index hq_family_quest_events_order on public.hq_family_quest_events(learner_id,clock,event_id);
alter table public.hq_family_quest_events enable row level security;
revoke all on public.hq_family_quest_events from public,anon,authenticated;
grant select,insert on public.hq_family_quest_events to authenticated;
create policy hq_family_quest_read on public.hq_family_quest_events for select to authenticated using (learner_id=(select hq_private.hq_family_learner()));
create policy hq_family_quest_insert on public.hq_family_quest_events for insert to authenticated with check (learner_id=(select hq_private.hq_family_learner()));
