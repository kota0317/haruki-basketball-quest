// Production sync Worker. Family code is supplied only as a Worker secret.
import { applyOperation, importLegacy } from './operation-engine.mjs';
const GENERATION_KEY='__hq_sync_generation';
const json=(value,status=200,origin='')=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'Content-Type, X-Family-Code','Access-Control-Expose-Headers':'Retry-After','Access-Control-Allow-Methods':'GET, PUT, POST, OPTIONS'}});
function snapshot(row){
 let generation='initial',data=null;
 if(row?.body!==null&&row?.body!==undefined){
  const stored=JSON.parse(row.body);
  if(stored&&typeof stored==='object'&&!Array.isArray(stored)&&typeof stored[GENERATION_KEY]==='string'){
   generation=stored[GENERATION_KEY];
   delete stored[GENERATION_KEY];
   data=Object.keys(stored).length?stored:null;
  }else data=stored;
 }
 return {revision:row?.revision??0,generation,data};
}
export default {async fetch(request,env){
 const suppliedOrigin=request.headers.get('Origin')||'';
 const sameOrigin=!suppliedOrigin&&request.headers.get('Sec-Fetch-Site')==='same-origin'&&new URL(request.url).origin===env.ALLOWED_ORIGIN;
 const origin=suppliedOrigin||(sameOrigin?env.ALLOWED_ORIGIN:'');
 if(!env.ALLOWED_ORIGIN||origin!==env.ALLOWED_ORIGIN)return json({error:'origin_denied'},403);
 if(request.method==='OPTIONS')return json({},200,origin);
 if(!env.DB||!/^[0-9]{5}$/.test(env.FAMILY_CODE||''))return json({error:'not_configured',database:!!env.DB,code_configured:/^[0-9]{5}$/.test(env.FAMILY_CODE||'')},503,origin);
 const code=request.headers.get('X-Family-Code')||'';
 let diff=code.length^5;for(let i=0;i<5;i++)diff|=(code.charCodeAt(i)||0)^env.FAMILY_CODE.charCodeAt(i);
 if(diff!==0||!/^[0-9]{5}$/.test(code)){
  const minute=Math.floor(Date.now()/60000),retryAfter=Math.max(1,60-Math.floor(Date.now()/1000)%60);
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));
  const ipHash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  await env.DB.prepare('DELETE FROM family_auth_limit WHERE window<?').bind(minute-2).run();
  const rate=await env.DB.prepare('INSERT INTO family_auth_limit(ip_hash,window,count) VALUES(?,?,1) ON CONFLICT(ip_hash) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count').bind(ipHash,minute).first();
  if(!rate||rate.count>20)return new Response(JSON.stringify({error:'rate_limited'}),{status:429,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'Content-Type, X-Family-Code','Access-Control-Expose-Headers':'Retry-After','Access-Control-Allow-Methods':'GET, PUT, POST, OPTIONS','Retry-After':String(retryAfter)}});
  return json({error:'unauthorized'},401,origin);
 }
 const url=new URL(request.url);
 if(url.pathname==='/operations'){
  if(request.method!=='POST')return json({error:'method_not_allowed'},405,origin);
  let raw=await request.text();if(raw.length>1000000)return json({error:'too_large'},413,origin);
  let input;try{input=JSON.parse(raw)}catch{return json({error:'invalid_json'},400,origin)}
  if(!input||typeof input.id!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(input.id)||!Number.isSafeInteger(input.baseRevision)||input.baseRevision<0||typeof input.type!=='string'||!input.payload||typeof input.payload!=='object'||Array.isArray(input.payload))return json({error:'invalid_operation'},400,origin);
  if(input.type!=='legacy.import'&&!['sync.verify','state.patch','quest.upsert','quest.delete','quest.complete','quest.undo','state.set','record.append','rpg.flag','rpg.increment','rpg.award'].includes(input.type))return json({error:'unsupported_operation'},422,origin);
  if(input.type==='legacy.import'&&(!input.payload.data||typeof input.payload.data!=='object'||Array.isArray(input.payload.data)))return json({error:'invalid_migration'},400,origin);
  if(input.type==='record.append'&&(!['sessions','answers','matches','learningEvents','rpg.plays'].includes(input.payload.collection)||!input.payload.record||typeof input.payload.record!=='object'))return json({error:'invalid_record'},400,origin);
  const operationPayload=JSON.stringify({type:input.type,payload:input.payload});
  try{
   const previous=await env.DB.prepare('SELECT type,payload,applied_revision FROM family_operation WHERE operation_id=?').bind(input.id).first();
   if(previous){if(previous.type!==input.type||previous.payload!==operationPayload)return json({error:'operation_id_reused'},409,origin);const latest=await env.DB.prepare('SELECT revision FROM family_snapshot WHERE id=1').first();return json({status:'applied',operationId:input.id,revision:latest?.revision??previous.applied_revision,replayed:true},200,origin)}
  }catch{return json({error:'operation_schema_not_ready'},503,origin)}
  const row=await env.DB.prepare('SELECT revision, body FROM family_snapshot WHERE id=1').first();
  const current=snapshot(row);
  if(typeof input.generation!=='string'||input.generation!==current.generation)return json({error:'reset_generation_changed',revision:current.revision,generation:current.generation},409,origin);
  if(input.baseRevision>current.revision)return json({error:'future_revision',revision:current.revision},409,origin);
  let next,audit=null;
  try{
   if(input.type==='legacy.import')({state:next,audit}=importLegacy(current.data||{},input.payload.data));
   else if(input.type==='sync.verify')next=current.data||{};
   else{const result=applyOperation(current.data||{},input);if(result.status==='conflict')return json({error:'operation_conflict',operationId:input.id,current:result.current},409,origin);next=result.state||current.data||{}}
  }catch(e){return json({error:e.message==='unsupported_operation'?'unsupported_operation':'invalid_operation_payload'},422,origin)}
  const stored={...next,[GENERATION_KEY]:current.generation};
  const appliedRevision=current.revision+1,createdAt=new Date().toISOString();
  try{
   const statements=[];
   if(input.type==='legacy.import')statements.push(env.DB.prepare('INSERT OR IGNORE INTO family_snapshot_archive(source_revision,body,archived_at) SELECT revision,body,? FROM family_snapshot WHERE id=1 AND revision=?').bind(createdAt,current.revision));
   statements.push(env.DB.prepare('INSERT INTO family_operation(operation_id,type,payload,base_revision,applied_revision,created_at) SELECT ?,?,?,?,revision+1,? FROM family_snapshot WHERE id=1 AND revision=? AND NOT EXISTS (SELECT 1 FROM family_operation WHERE operation_id=?)').bind(input.id,input.type,operationPayload,current.revision,createdAt,current.revision,input.id));
   statements.push(env.DB.prepare('UPDATE family_snapshot SET revision=revision+1,body=? WHERE id=1 AND revision=? AND EXISTS (SELECT 1 FROM family_operation WHERE operation_id=? AND base_revision=? AND applied_revision=?)').bind(JSON.stringify(stored),current.revision,input.id,current.revision,appliedRevision));
   const results=await env.DB.batch(statements);
   if(!results||results.at(-1)?.meta?.changes!==1){const existing=await env.DB.prepare('SELECT type,payload,applied_revision FROM family_operation WHERE operation_id=?').bind(input.id).first();if(existing){if(existing.type!==input.type||existing.payload!==operationPayload)return json({error:'operation_id_reused'},409,origin);return json({status:'applied',operationId:input.id,revision:existing.applied_revision,replayed:true},200,origin)}return json({error:'revision_conflict'},409,origin)}
  }catch{return json({error:'operation_schema_not_ready'},503,origin)}
  return json({status:'applied',operationId:input.id,revision:appliedRevision,generation:current.generation,audit:input.type==='legacy.import'?audit:undefined,data:input.type==='legacy.import'?next:undefined},200,origin);
 }
 if(url.pathname!=='/snapshot')return json({error:'not_found'},404,origin);
 const row=await env.DB.prepare('SELECT revision, body FROM family_snapshot WHERE id=1').first();
 const current=snapshot(row);
 if(request.method==='GET')return json(current,200,origin);
 if(request.method!=='PUT')return json({error:'method_not_allowed'},405,origin);
 try{await env.DB.prepare('SELECT operation_id FROM family_operation LIMIT 1').first();return json({error:'operation_sync_required'},426,origin)}catch{}
 let raw=await request.text();if(raw.length>1000000)return json({error:'too_large'},413,origin);
 let input;try{input=JSON.parse(raw)}catch{return json({error:'invalid_json'},400,origin)}
 if(!input||!Number.isSafeInteger(input.revision)||input.revision<0||!input.data||typeof input.data!=='object'||Array.isArray(input.data)||Object.prototype.hasOwnProperty.call(input.data,GENERATION_KEY)||!Array.isArray(input.data.sessions)||!Array.isArray(input.data.answers)||!Array.isArray(input.data.matches)||!input.data.settings||typeof input.data.settings!=='object')return json({error:'invalid_data'},400,origin);
 if(typeof input.generation!=='string'||!input.generation||input.generation.length>80)return json({error:'reset_generation_required'},428,origin);
 if(input.generation!==current.generation)return json({error:'reset_generation_changed'},409,origin);
 const stored={...input.data,[GENERATION_KEY]:current.generation};
 const r=await env.DB.prepare('UPDATE family_snapshot SET revision=revision+1,body=? WHERE id=1 AND revision=? RETURNING revision').bind(JSON.stringify(stored),input.revision).first();
 if(!r)return json({error:'conflict'},409,origin);
 return json({revision:r.revision,generation:current.generation},200,origin);
}};
