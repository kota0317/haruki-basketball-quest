// Production sync Worker. Family code is supplied only as a Worker secret.
const GENERATION_KEY='__hq_sync_generation';
const json=(value,status=200,origin='')=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'Content-Type, X-Family-Code','Access-Control-Allow-Methods':'GET, PUT, OPTIONS'}});
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
 const minute=Math.floor(Date.now()/60000);
 const rate=await env.DB.prepare("INSERT INTO auth_limit (id,window,count) VALUES (1,?,1) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END, window=excluded.window RETURNING count").bind(minute).first();
 if(!rate||rate.count>60)return json({error:'rate_limited'},429,origin);
 let diff=code.length^5;for(let i=0;i<5;i++)diff|=(code.charCodeAt(i)||0)^env.FAMILY_CODE.charCodeAt(i);
 if(diff!==0||!/^[0-9]{5}$/.test(code))return json({error:'unauthorized'},401,origin);
 const url=new URL(request.url);
 if(url.pathname!=='/snapshot')return json({error:'not_found'},404,origin);
 const row=await env.DB.prepare('SELECT revision, body FROM family_snapshot WHERE id=1').first();
 const current=snapshot(row);
 if(request.method==='GET')return json(current,200,origin);
 if(request.method!=='PUT')return json({error:'method_not_allowed'},405,origin);
 let raw=await request.text();if(raw.length>1000000)return json({error:'too_large'},413,origin);
 let input;try{input=JSON.parse(raw)}catch{return json({error:'invalid_json'},400,origin)}
 if(!input||!Number.isSafeInteger(input.revision)||input.revision<0||typeof input.generation!=='string'||!input.generation||input.generation.length>80||!input.data||typeof input.data!=='object'||Array.isArray(input.data)||Object.prototype.hasOwnProperty.call(input.data,GENERATION_KEY)||!Array.isArray(input.data.sessions)||!Array.isArray(input.data.answers)||!Array.isArray(input.data.matches)||!input.data.settings||typeof input.data.settings!=='object')return json({error:'invalid_data'},400,origin);
 if(input.generation!==current.generation)return json({error:'reset_generation_changed'},409,origin);
 const stored={...input.data,[GENERATION_KEY]:current.generation};
 const r=await env.DB.prepare('UPDATE family_snapshot SET revision=revision+1,body=? WHERE id=1 AND revision=? RETURNING revision').bind(JSON.stringify(stored),input.revision).first();
 if(!r)return json({error:'conflict'},409,origin);
 return json({revision:r.revision,generation:current.generation},200,origin);
}};