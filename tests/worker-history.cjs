'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');

(async()=>{
 const worker=(await import('../cloudflare/worker.mjs')).default;
 const db=new DatabaseSync(':memory:');
 db.exec(fs.readFileSync('cloudflare/schema.sql','utf8'));
 const DB={prepare(sql){let params=[];return{bind(...args){params=args;return this},async first(){return db.prepare(sql).get(...params)||null}}}};
 const origin='https://haruki.example';
 const request=(method='GET',body)=>new Request(origin+'/snapshot',{method,headers:{Origin:origin,'X-Family-Code':'54321',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const env={DB,FAMILY_CODE:'54321',ALLOWED_ORIGIN:origin};
 try{
  const previous={sessions:[{date:'2026-11-20',kind:'英検',minutes:20}],answers:[],matches:[],settings:{club:true,exam:false},learningEvents:[{date:'2026-11-20',type:'enjp',id:3,correct:false,time:100}]};
  db.prepare('UPDATE family_snapshot SET revision=7,body=? WHERE id=1').run(JSON.stringify(previous));
  const before=await worker.fetch(request(),env);assert.equal(before.status,200);assert.deepEqual((await before.json()).data,previous);
  const attempts=[{eventId:'attempt-1',date:'2026-11-21',type:'dialogue',id:28,question:'A: hi\nB: hello',options:['hello','bye'],selectedAnswer:'bye',correctAnswer:'hello',correct:false,explanation:'A greeting',time:1000,reviewPhase:'first',weekly:false},{eventId:'attempt-2',date:'2026-11-21',type:'dialogue',id:28,question:'A: hi\nB: hello',options:['hello','bye'],selectedAnswer:'hello',correctAnswer:'hello',correct:true,explanation:'A greeting',time:2000,reviewPhase:'retry',weekly:false}];
  const next={...previous,learningEvents:[...previous.learningEvents,...attempts]};
  const put=await worker.fetch(request('PUT',{revision:7,generation:'initial',data:next}),env);assert.equal(put.status,200);assert.equal((await put.json()).revision,8);
  const after=await worker.fetch(request(),env),snapshot=await after.json();assert.equal(after.status,200);assert.equal(snapshot.revision,8);assert.deepEqual(snapshot.data,next);assert.deepEqual(snapshot.data.sessions,previous.sessions);assert.deepEqual(snapshot.data.learningEvents.slice(1),attempts);
  const stale=await worker.fetch(request('PUT',{revision:7,generation:'initial',data:next}),env);assert.equal(stale.status,409);
  console.log('PASS Worker/D1 snapshot retains old learning data and stores complete repeated answer attempts');
 }finally{db.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
