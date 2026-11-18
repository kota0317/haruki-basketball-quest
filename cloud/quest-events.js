/* Append-only quest actions; no network or browser dependency in the reducer. */
(function(root){'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const norm=x=>Array.isArray(x)?x.map(norm):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,norm(x[k])])):x;
const same=(a,b)=>JSON.stringify(norm(a))===JSON.stringify(norm(b));
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function valid(op){
 if(!op||!uuidPattern.test(op.id)||!Number.isSafeInteger(op.clock)||op.clock<1||!(op.prior===null||uuidPattern.test(op.prior))||typeof op.key!=='string')return false;
 const date=/^\d{4}-\d{2}-\d{2}$/;
 if(op.kind==='menu'){let m=op.value;return uuidPattern.test(op.key)&&m&&m.id===op.key&&typeof m.title==='string'&&m.title.length>0&&m.title.length<=120&&typeof m.note==='string'&&m.note.length<=160&&['国語','数学','英語','理科','社会','その他'].includes(m.subject)&&date.test(m.date)&&['none','daily','weekly'].includes(m.repeat)&&Array.isArray(m.weekdays)&&m.weekdays.every(x=>Number.isInteger(x)&&x>=0&&x<=6)&&Number.isInteger(m.minutes)&&m.minutes>=1&&m.minutes<=300&&Number.isInteger(m.xp)&&m.xp>=1&&m.xp<=500&&Number.isFinite(m.order)}
 if(op.kind==='completion'){let [id,day,...rest]=op.key.split('@'),v=op.value;return uuidPattern.test(id)&&date.test(day)&&rest.length===0&&(v===null||(v&&v.id===id&&v.date===day&&typeof v.title==='string'&&v.title.length<=120&&['国語','数学','英語','理科','社会','その他'].includes(v.subject)&&['英検','学校'].includes(v.kind)&&Number.isInteger(v.minutes)&&v.minutes>=1&&v.minutes<=300&&Number.isInteger(v.xp)&&v.xp>=1&&v.xp<=500))}
 return false;
}
function ensure(q,uuid){
 if(!q||!Array.isArray(q.menus)||!q.completions||typeof q.completions!=='object')throw Error('invalid quest state');
 if(Array.isArray(q.ops)){q.clock=q.ops.reduce((n,x)=>Math.max(n,Number(x.clock)||0),Number(q.clock)||0);return}
 const draft={ops:[],clock:0};
 for(const m of q.menus)record(draft,'menu',m.id,m,uuid);
 for(const [key,value] of Object.entries(q.completions))record(draft,'completion',key,value,uuid);
 q.ops=draft.ops;q.clock=draft.clock;
}
function record(q,kind,key,value,uuid){
 if(!Array.isArray(q.ops)||!['menu','completion'].includes(kind)||!key)throw Error('invalid quest operation');
 const prev=q.ops.filter(x=>x.kind===kind&&x.key===key).sort((a,b)=>a.clock-b.clock||a.id.localeCompare(b.id)).at(-1);
 const op={id:uuid(),clock:(Number(q.clock)||0)+1,kind,key,prior:prev?.id||null,value:value===null?null:clone(value),acked:false};if(!valid(op))throw Error('クエストの内容を確認してください');q.clock=op.clock;q.ops.push(op);return op;
}
function merge(state,remote){
 let q=clone(state);if(!Array.isArray(q.ops))throw Error('quest operations not initialized');
 const byId=new Map(q.ops.map(x=>[x.id,x]));
 for(const row of remote){let old=byId.get(row.event_id);let value=row.value===null?null:row.value;
  if(old){if(old.clock!==Number(row.clock)||old.kind!==row.kind||old.key!==row.target||(old.prior||null)!==(row.prior||null)||!same(old.value,value))throw Error('同じIDのクエスト記録が一致しません');old.acked=true;continue}
  const op={id:row.event_id,clock:Number(row.clock),kind:row.kind,key:row.target,prior:row.prior||null,value,acked:true};if(!valid(op))throw Error('クラウドのクエスト記録が不正です');q.ops.push(op);byId.set(op.id,op);
 }
 const ordered=[...q.ops].sort((a,b)=>a.clock-b.clock||a.id.localeCompare(b.id));const menus=new Map(),completed={};
 for(const op of ordered){if(op.kind==='menu'&&op.value)menus.set(op.key,clone(op.value));else if(op.kind==='completion'){if(op.value===null)delete completed[op.key];else completed[op.key]=clone(op.value)}}
 const groups=new Map();for(const op of ordered){let key=op.kind+'|'+op.key+'|'+(op.prior||'root');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(op)}
 q.conflicts=[...groups.values()].filter(g=>g.length>1&&g.some(x=>!same(x.value,g[0].value))).flatMap(g=>g.slice(0,-1).map(x=>x.id));
 q.menus=[...menus.values()];q.completions=completed;q.clock=ordered.reduce((n,x)=>Math.max(n,x.clock),0);Object.assign(state,q);return state;
}
async function sync(get,db,learner,current,persist,uuid){
 ensure(get(),uuid);persist();
 for(;;){
  if(!current())return;let op=get().ops.find(x=>!x.acked);if(!op)break;
  let item={learner_id:learner,event_id:op.id,clock:op.clock,kind:op.kind,target:op.key,prior:op.prior||null,value:op.value};let {error}=await db.from('hq_quest_events').insert(item);if(!current())return;
  if(error){if(error.code!=='23505')throw error;const existing=await db.from('hq_quest_events').select('*').eq('learner_id',learner).eq('event_id',op.id).single();if(existing.error)throw existing.error;let e=existing.data;if(Number(e.clock)!==op.clock||e.kind!==op.kind||e.target!==op.key||(e.prior||null)!==(op.prior||null)||!same(e.value,op.value))throw Error('同じIDのクエスト記録が一致しません')}
  let latest=get().ops.find(x=>x.id===op.id);if(latest)latest.acked=true;persist();
 }
 let remote=[];for(let offset=0;;offset+=500){let r=await db.from('hq_quest_events').select('*').eq('learner_id',learner).order('clock').order('event_id').range(offset,offset+499);if(r.error)throw r.error;if(!current())return;remote.push(...r.data);if(r.data.length<500)break}
 merge(get(),remote);persist();
}

const api={ensure,record,merge,sync};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HQQuestEvents=api;
})(globalThis);
