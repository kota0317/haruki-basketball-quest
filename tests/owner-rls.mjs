// Isolated local Postgres simulation, not a Supabase project or real Auth service.
import {PGlite} from '@electric-sql/pglite';import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite({extensions:{pgcrypto}});
const child='00000000-0000-4000-8000-000000000001',parent='00000000-0000-4000-8000-000000000002',stranger='00000000-0000-4000-8000-000000000003',child2='00000000-0000-4000-8000-000000000004',parent2='00000000-0000-4000-8000-000000000005';
const cs='10000000-0000-4000-8000-000000000001',ps='10000000-0000-4000-8000-000000000002',ss='10000000-0000-4000-8000-000000000003',cs2='10000000-0000-4000-8000-000000000004',ps2='10000000-0000-4000-8000-000000000005';
const exec=async q=>await db.exec(q), rows=async q=>(await db.query(q)).rows;
async function asUser(id,sid,exp=4102444800){await exec(`reset role; set role authenticated; select set_config('request.jwt.claims','${JSON.stringify({sub:id,session_id:sid,is_anonymous:true,exp})}',false)`)}
async function denied(q){let ok=false;try{await exec(q)}catch{ok=true}assert.ok(ok,'expected database rejection: '+q.slice(0,100))}
try{
 await exec(`create role anon;create role authenticated;create schema auth;create schema extensions;create extension pgcrypto with schema extensions;
 create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id));
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
 create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;
 insert into auth.users(id) values ('${child}'),('${parent}'),('${stranger}'),('${child2}'),('${parent2}');
 insert into auth.sessions(id,user_id) values ('${cs}','${child}'),('${ps}','${parent}'),('${ss}','${stranger}'),('${cs2}','${child2}'),('${ps2}','${parent2}');`);
 for(const file of ['001_draft.sql','002_study_plans.sql','003_pairing.sql','005_owner_approval_draft.sql'])await exec(await readFile(new URL('../cloud/'+file,import.meta.url),'utf8'));
 const pa='a'.repeat(64),pb='b'.repeat(64),pc='c'.repeat(64);
 await exec('reset role;set role anon');await denied('select public.hq_request_parent()');await asUser(stranger,ss);assert.equal((await rows('select * from public.hq_current_device()')).length,0);await denied(`select public.hq_issue_device_invite('${pa}',null)`);
 let r=(await rows('select public.hq_request_parent() as id'))[0].id;await denied(`select hq_private.owner_approve_parent('${r}')`);await exec(`reset role;update hq_private.parent_requests set expires_at=now()-interval '1 second' where request_id='${r}'`);await denied(`select hq_private.owner_approve_parent('${r}')`);
 await asUser(parent,ps);let req=(await rows('select public.hq_request_parent() as id'))[0].id;await denied(`select hq_private.owner_approve_parent('${req}')`);
 await exec(`reset role;select hq_private.owner_approve_parent('${req}');`);await denied(`select hq_private.owner_approve_parent('${req}')`);
 await asUser(parent,ps);let who=await rows('select * from public.hq_current_device()');assert.equal(who[0].role,'parent');await exec(`select public.hq_issue_device_invite('${pa}',null)`);
 await asUser(child,cs);let learner=(await rows(`select public.hq_accept_device_invite('${pa}') as id`))[0].id;await denied(`select public.hq_accept_device_invite('${pa}')`);
 await exec(`insert into public.hq_learning_events(learner_id,event_id,event_type,occurred_on,payload) values ('${learner}','20000000-0000-4000-8000-000000000001','study_session','2026-11-18','{}')`);
 await asUser(parent,ps);assert.equal((await rows(`select * from public.hq_learning_events where learner_id='${learner}'`)).length,1);
 await exec(`insert into public.hq_learning_events(learner_id,event_id,event_type,occurred_on,payload) values ('${learner}','20000000-0000-4000-8000-000000000002','answer','2026-11-18','{}')`);await denied(`update public.hq_learning_events set payload='{}' where learner_id='${learner}'`);await denied(`delete from public.hq_learning_events where learner_id='${learner}'`);
 await exec(`insert into public.hq_study_plans(learner_id,plan_id,title,subject,target_minutes) values ('${learner}','30000000-0000-4000-8000-000000000001','words','英検',35);update public.hq_study_plans set target_minutes=25 where learner_id='${learner}'`);
 await asUser(stranger,ss);assert.equal((await rows('select * from public.hq_learning_events')).length,0);assert.equal((await rows('select * from public.hq_study_plans')).length,0);await denied(`insert into public.hq_learning_events(learner_id,event_id,event_type,occurred_on,payload) values ('${learner}','20000000-0000-4000-8000-000000000004','answer','2026-11-18','{}')`);await denied(`insert into public.hq_study_plans(learner_id,plan_id,title,subject,target_minutes) values ('${learner}','30000000-0000-4000-8000-000000000002','x','英検',20)`);
 await asUser(child,cs);assert.equal((await rows('select * from public.hq_study_plans'))[0].target_minutes,25);assert.equal((await rows(`update public.hq_study_plans set target_minutes=10 where learner_id='${learner}' returning *`)).length,1);
 await asUser(parent,ps);await exec(`select public.hq_revoke_device('${cs}')`);await exec(`select public.hq_issue_device_invite('${pb}','${learner}')`);
 await asUser(child,cs);assert.equal((await rows('select * from public.hq_learning_events')).length,0);await denied(`insert into public.hq_learning_events(learner_id,event_id,event_type,occurred_on,payload) values ('${learner}','20000000-0000-4000-8000-000000000003','answer','2026-11-18','{}')`);
 await asUser(child2,cs2);assert.equal((await rows(`select public.hq_accept_device_invite('${pb}') as id`))[0].id,learner);assert.equal(learner,child,'initial Auth learner id remains canonical');assert.equal((await rows('select * from public.hq_learning_events')).length,2);
 await asUser(parent,ps);await exec(`select public.hq_issue_device_invite('${pc}','${learner}');select public.hq_revoke_device('${ps}')`);
 await asUser(parent,ps);assert.equal((await rows('select * from public.hq_learning_events')).length,0);await denied(`select public.hq_issue_device_invite('${pa}',null)`);await asUser(stranger,ss);await denied(`select public.hq_accept_device_invite('${pc}')`);
 await asUser(parent2,ps2);let req2=(await rows('select public.hq_request_parent() as id'))[0].id;await exec(`reset role;select hq_private.owner_approve_parent('${req2}');`);
 await asUser(parent2,ps2);assert.equal((await rows('select * from public.hq_learning_events')).length,2);await asUser(parent2,ps2,1);assert.equal((await rows('select * from public.hq_learning_events')).length,0);await denied(`select public.hq_issue_device_invite('${pa}',null)`);
 console.log('PASS: local PostgreSQL parent approval, expiry, invitation, shared device access, third-party denial, device revoke and recovery');
}catch(e){console.error('FAIL:',e.message);process.exitCode=1}finally{await db.close()}
