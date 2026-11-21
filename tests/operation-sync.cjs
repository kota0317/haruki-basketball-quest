'use strict';
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');

(async()=>{
 const worker=(await import('../cloudflare/worker.mjs')).default;
 const db=new DatabaseSync(':memory:');
 db.exec(fs.readFileSync('cloudflare/schema.sql','utf8'));
 db.exec(fs.readFileSync('cloudflare/migrations/0001-operation-ledger.sql','utf8'));
 const DB={
  prepare(sql){let params=[];return{sql,bind(...args){params=args;return this},async first(){return db.prepare(sql).get(...params)||null},get params(){return params}}},
  async batch(statements){
   db.exec('BEGIN');
   try{const results=statements.map(item=>{const result=db.prepare(item.sql).run(...item.params);return{meta:{changes:Number(result.changes)}}});db.exec('COMMIT');return results}
   catch(error){db.exec('ROLLBACK');throw error}
  }
 };
 const origin='https://haruki.example',generation='family-generation-56';
 const env={DB,FAMILY_CODE:'54321',ALLOWED_ORIGIN:origin};
 const request=(path,method='GET',body)=>new Request(origin+path,{method,headers:{Origin:origin,'X-Family-Code':'54321',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const cloud={sessions:[],answers:[],matches:[],settings:{club:true,exam:false},questData:{menus:Array.from({length:5},(_,i)=>({id:'q'+i,title:'Quest '+i})),completions:{}},learningEvents:Array.from({length:23},(_,i)=>({eventId:'d1-'+i,date:'2026-11-21',type:'enjp',correct:true,time:i})),rpg:{bonusXP:100,wordStreak:13,streakDate:'2026-11-21',awards:{}},xpProgression:{version:1,baseLevel:1,baseQuestXP:0,baseBonusXP:100,carryXP:100}};
 const raw=JSON.stringify({...cloud,__hq_sync_generation:generation});
 db.prepare('UPDATE family_snapshot SET revision=56,body=? WHERE id=1').run(raw);
 const local={sessions:[{legacyId:'android:session:0',date:'2026-11-21',kind:'学校',subject:'学習',minutes:65}],answers:[],matches:[],settings:{club:true,exam:false},questData:{menus:cloud.questData.menus.map(x=>({...x})),completions:Object.fromEntries([0,1,2].map(i=>['q'+i+'@2026-11-21',{eventId:'done-'+i,id:'q'+i,date:'2026-11-21',title:'Quest '+i,minutes:10,xp:10}]))},learningEvents:[{eventId:'local-eiken-1',date:'2026-11-21',type:'jpen',correct:true,time:1000}],rpg:{bonusXP:85,wordStreak:1,streakDate:'2026-11-21',awards:{}},xpProgression:{version:1,baseLevel:1,baseQuestXP:0,baseBonusXP:85,carryXP:85}};
 const migration={id:'migration-device-a-1',type:'legacy.import',baseRevision:56,generation,payload:{data:local}};
 const migrated=await worker.fetch(request('/operations','POST',migration),env);const first=await migrated.json();if(migrated.status!==200)console.log('failed batch state',db.prepare('SELECT * FROM family_operation').all(),db.prepare('SELECT revision,body FROM family_snapshot').get());assert.equal(migrated.status,200,JSON.stringify(first));assert.equal(first.revision,57);
 const snap=await (await worker.fetch(request('/snapshot'),env)).json();
 assert.equal(snap.revision,57);assert.equal(snap.generation,generation);assert.equal(snap.data.questData.menus.length,5);assert.equal(Object.keys(snap.data.questData.completions).length,3);
 assert.equal(snap.data.sessions.reduce((n,x)=>n+x.minutes,0)+Object.values(snap.data.questData.completions).reduce((n,x)=>n+x.minutes,0),95);
 assert.equal(Object.values(snap.data.questData.completions).reduce((n,x)=>n+x.xp,0),30);assert.equal(snap.data.learningEvents.length,24);
 assert.equal(snap.data.rpg.bonusXP,100);assert.equal(snap.data.rpg.wordStreak,13);assert.deepEqual([snap.data.migrationAudit[0].xp.d1BonusXP,snap.data.migrationAudit[0].xp.deviceBonusXP],[100,85]);assert.deepEqual([snap.data.migrationAudit[0].wordStreak.d1,snap.data.migrationAudit[0].wordStreak.device],[13,1]);
 assert.equal(snap.data.xpProgression.baseLevel,2);assert.equal(snap.data.xpProgression.baseQuestXP,30);assert.equal(snap.data.xpProgression.carryXP,10);
 const archive=db.prepare('SELECT source_revision,body FROM family_snapshot_archive').get();assert.equal(archive.source_revision,56);assert.equal(archive.body,raw);

 const retry=await worker.fetch(request('/operations','POST',migration),env);assert.equal(retry.status,200);assert.equal((await retry.json()).replayed,true);assert.equal(db.prepare('SELECT revision FROM family_snapshot WHERE id=1').get().revision,57);
 const edit={id:'operation-menu-edit-1',type:'quest.upsert',baseRevision:57,generation,payload:{menu:{id:'q0',title:'Edited',updatedAt:'new'},expectedUpdatedAt:'stale'}};
 const blocked=await worker.fetch(request('/operations','POST',edit),env);assert.equal(blocked.status,409);assert.equal((await blocked.json()).error,'operation_conflict');assert.equal(db.prepare('SELECT revision FROM family_snapshot WHERE id=1').get().revision,57);
 const append={id:'operation-eiken-add-1',type:'record.append',baseRevision:57,generation,payload:{collection:'learningEvents',record:{eventId:'local-eiken-2',date:'2026-11-21',type:'dialogue',correct:false,time:2000}}};
 assert.equal((await worker.fetch(request('/operations','POST',append),env)).status,200);assert.equal(db.prepare('SELECT revision FROM family_snapshot WHERE id=1').get().revision,58);
 assert.equal((await worker.fetch(request('/operations','POST',append),env)).status,200);const after=(await (await worker.fetch(request('/snapshot'),env)).json());assert.equal(after.revision,58);assert.equal(after.data.learningEvents.length,25);
 const staleGeneration={...append,id:'operation-wrong-generation',generation:'old-generation',baseRevision:58};
 assert.equal((await worker.fetch(request('/operations','POST',staleGeneration),env)).status,409);
 console.log('PASS D1-authoritative legacy import, archived snapshot, audit-only XP/streak, event idempotency, and stale edit protection');
 db.close();
})().catch(error=>{console.error(error);process.exitCode=1});
