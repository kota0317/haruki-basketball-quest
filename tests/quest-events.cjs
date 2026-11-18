'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const E=require('../cloud/quest-events.js');const uuid=()=>crypto.randomUUID();
const day='2026-11-18',id=uuid(),m={id,title:'英単語',note:'p.10',subject:'英語',date:day,repeat:'none',weekdays:[],minutes:15,xp:10,order:1}, key=id+'@'+day, c={id,date:day,title:m.title,subject:'英語',kind:'英検',minutes:15,xp:10};
const row=(x,learner='learner')=>({learner_id:learner,event_id:x.id,clock:x.clock,kind:x.kind,target:x.key,prior:x.prior,value:x.value});
const clone=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 let original={menus:[clone(m)],completions:{[key]:clone(c)}};E.ensure(original,uuid);assert.equal(original.ops.length,2);assert.deepEqual(original.menus,[m]);
 let a=clone(original),b=clone(original);a.ops.forEach(x=>x.acked=true);b.ops.forEach(x=>x.acked=true);
 a.menus[0].title='単語A';E.record(a,'menu',id,a.menus[0],uuid);b.menus[0].title='単語B';E.record(b,'menu',id,b.menus[0],uuid);
 E.merge(a,b.ops.map(x=>row(x)));E.merge(b,a.ops.map(x=>row(x)));assert.equal(a.menus[0].title,b.menus[0].title);assert.equal(a.conflicts.length,1);assert.equal(a.ops.length,4);
 let loser=a.ops.find(x=>x.id===a.conflicts[0]);E.record(a,'menu',id,loser.value,uuid);E.merge(a,[]);assert.equal(a.menus[0].title,loser.value.title);
 E.record(a,'completion',key,null,uuid);E.merge(a,[]);assert.equal(a.completions[key],undefined);E.record(a,'completion',key,c,uuid);E.merge(a,[]);assert.equal(Object.values(a.completions).reduce((n,x)=>n+x.xp,0),10);
 let x={menus:[clone(m)],completions:{}},y={menus:[],completions:{}};E.ensure(x,uuid);E.ensure(y,uuid);let stored=[],failAfterInsert=true;
 const db={from(){return {insert:async obj=>{let found=stored.find(v=>v.event_id===obj.event_id);if(found)return {error:{code:'23505'}};stored.push(clone(obj));if(failAfterInsert){failAfterInsert=false;return {error:{message:'connection lost after commit'}}}return {error:null}},select(){let filter={};const query={eq(k,v){filter[k]=v;return query},order(){return query},async single(){return {data:stored.find(v=>Object.entries(filter).every(([k,x])=>v[k]===x)),error:null}},async range(start,end){return {data:stored.filter(v=>Object.entries(filter).every(([k,x])=>v[k]===x)).slice(start,end+1),error:null}}};return query}}}};
 await assert.rejects(E.sync(()=>x,db,'learner',()=>true,()=>{},uuid));assert.equal(stored.length,1);assert.equal(x.ops[0].acked,false);await E.sync(()=>x,db,'learner',()=>true,()=>{},uuid);assert.equal(stored.length,1);assert.equal(x.ops[0].acked,true);await E.sync(()=>y,db,'learner',()=>true,()=>{},uuid);assert.equal(y.menus[0].title,'英単語');
 let before=JSON.stringify(y);assert.throws(()=>E.merge(y,[{...row(x.ops[0]),value:{...m,title:'tampered'}}]));assert.equal(JSON.stringify(y),before);
 console.log('quest event sync: bootstrap, offline retry, duplicates, conflict recovery, undo and atomic validation passed');
})().catch(e=>{console.error(e);process.exit(1)});
