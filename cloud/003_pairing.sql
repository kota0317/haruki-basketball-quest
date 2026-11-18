create schema if not exists hq_private;
revoke all on schema hq_private from public, anon, authenticated;
grant usage on schema hq_private to authenticated;
create table hq_private.invites (
 token_hash bytea primary key,
 parent_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null default (now() + interval '15 minutes'),
 created_at timestamptz not null default now()
);
alter table hq_private.invites enable row level security;
revoke all on hq_private.invites from public,anon,authenticated;
create function hq_private.create_invite(p_token text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'authentication required'; end if;
 if p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid code'; end if;
 delete from hq_private.invites where parent_id=auth.uid();
 insert into hq_private.invites(token_hash,parent_id) values(extensions.digest(p_token,'sha256'),auth.uid());
end $$;
create function hq_private.accept_invite(p_token text) returns void language plpgsql security definer set search_path='' as $$
declare v_parent uuid;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'authentication required'; end if;
 if p_token !~ '^[0-9a-f]{64}$' then raise exception 'invalid code'; end if;
 select parent_id into v_parent from hq_private.invites where token_hash=extensions.digest(p_token,'sha256') and expires_at>now() for update;
 if v_parent is null or v_parent=auth.uid() then raise exception 'invalid or expired code'; end if;
 insert into public.hq_parent_links(learner_id,parent_id) values(auth.uid(),v_parent) on conflict do nothing;
 delete from hq_private.invites where token_hash=extensions.digest(p_token,'sha256');
end $$;
revoke all on function hq_private.create_invite(text) from public,anon,authenticated;
revoke all on function hq_private.accept_invite(text) from public,anon,authenticated;
grant execute on function hq_private.create_invite(text) to authenticated;
grant execute on function hq_private.accept_invite(text) to authenticated;
create function public.hq_create_invite(p_token text) returns void language sql security invoker set search_path='' as $$ select hq_private.create_invite(p_token) $$;
create function public.hq_accept_invite(p_token text) returns void language sql security invoker set search_path='' as $$ select hq_private.accept_invite(p_token) $$;
revoke all on function public.hq_create_invite(text) from public,anon,authenticated;
revoke all on function public.hq_accept_invite(text) from public,anon,authenticated;
grant execute on function public.hq_create_invite(text) to authenticated;
grant execute on function public.hq_accept_invite(text) to authenticated;
alter table public.hq_study_plans add column question_category text not null default 'すべて' check (question_category in ('すべて','単語','文法','読解'));
