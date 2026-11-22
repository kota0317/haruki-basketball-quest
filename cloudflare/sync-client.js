// Family sync integration. Empty devices can start sync; unexpected local records stop before cloud upload.
'use strict';
(function(){
 const authKey='hq-sync-code-v1', metaKey='hq-sync-meta-v1';
 const operationModeKey='hq-sync-mode-v2', operationQueueKey='hq-sync-operations-v2', migrationRequestKey='hq-sync-migration-v2', deviceKey='hq-sync-device-id-v1';
 let busy=false, timer=null, timerAt=0, message='', conflicts=[], conflictContext=null, initialDiff=null, resetRequired=false, diagnosticBusy=false, diagnosticRerun=false, diagnosticState='idle', diagnosticResult='', diagnosticCheckedAt='';
 try{const saved=JSON.parse(sessionStorage.getItem('hq-sync-diagnostic-v1')||'null');if(saved&&['loading','success','error'].includes(saved.state)){diagnosticState=saved.state;diagnosticResult=String(saved.result||'');diagnosticCheckedAt=String(saved.checkedAt||'')}}catch{}
 const clone=x=>JSON.parse(JSON.stringify(x));
 const api=()=>window.HQ_SYNC_API;
 const readMeta=()=>{try{return JSON.parse(localStorage.getItem(metaKey)||'null')}catch{return null}};
 const storeMeta=x=>localStorage.setItem(metaKey,JSON.stringify(x));
 const code=()=>localStorage.getItem(authKey)||'';
 function transformed(state){
  const v=clone(state);if(v.questData&&Array.isArray(v.questData.menus)){
   const entries=Object.create(null);for(const m of v.questData.menus){if(!m||typeof m.id!=='string'||Object.hasOwn(entries,m.id))throw Error('クエスト ID の重複または不正があります');entries[m.id]=m;}
   v.questData.menus=entries;
  }return v;
 }
 function untransform(state){const v=clone(state);if(v.questData&&v.questData.menus&&!Array.isArray(v.questData.menus))v.questData.menus=Object.values(v.questData.menus);return v}
 const signature=x=>JSON.stringify(x);
 function empty(state){
  // Only a demonstrably fresh install may be replaced during first connection.
  const known=new Set(['sessions','answers','matches','settings','abilityBaseline','questData','eikenDaily','rpg','learningEvents','xpProgression']);
  if(Object.keys(state).some(k=>!known.has(k)))return false;
  if(Object.keys(state.settings||{}).some(k=>!['club','exam'].includes(k))||state.settings.club!==true||state.settings.exam!==false)return false;
  if(state.abilityBaseline!==undefined&&state.abilityBaseline!==10)return false;
  const xp=state.xpProgression;if(xp&&(xp.version!==1||!Number.isInteger(xp.baseLevel)||!Number.isInteger(xp.baseQuestXP)||!Number.isInteger(xp.baseBonusXP)||!Number.isInteger(xp.carryXP)))return false;
  if(state.questData&&Object.keys(state.questData).some(k=>!['menus','completions'].includes(k)))return false;
  if(state.eikenDaily&&Object.keys(state.eikenDaily).some(k=>k!=='days'))return false;
  const r=state.rpg||{};if(Object.keys(r).some(k=>!['bonusXP','awards','unlocked','titles','plays','giantWins','settings','wordStreak','streakDate'].includes(k)))return false;
  if(r.settings&&(r.settings.motion!=='full'||r.settings.sound!==false||r.settings.skip!==false||Object.keys(r.settings).some(k=>!['motion','sound','skip'].includes(k))))return false;
  return (!xp||(xp.baseLevel===1&&xp.baseQuestXP===0&&xp.baseBonusXP===0&&xp.carryXP===0))&&!state.sessions.length&&!state.answers.length&&!state.matches.length&&!(state.questData?.menus||[]).length&&!Object.keys(state.questData?.completions||{}).length&&!Object.values(state.eikenDaily?.days||{}).some(day=>Object.keys(day||{}).length)&&!r.bonusXP&&!Object.keys(r.awards||{}).length&&!Object.keys(r.unlocked||{}).filter(k=>k!=='three'||r.unlocked[k]!==true).length&&!Object.keys(r.titles||{}).length&&!(r.plays||[]).length&&!r.giantWins&&!(Number(r.wordStreak)||0)&&!r.streakDate;
 }
 async function req(method,body,url=api()+'/snapshot'){const res=await fetch(url,{method,headers:{'X-Family-Code':code(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const raw=await res.text();let data;try{data=raw?JSON.parse(raw):{}}catch{data={error:raw.slice(0,300)||'応答をJSONとして読み取れません'}}if(!res.ok){const e=Error(data.error||'通信エラー');e.status=res.status;e.code=data.error;e.details=typeof data.error==='string'?data.error:raw.slice(0,300);e.current=data.current;const retry=res.headers.get('Retry-After');if(retry){const seconds=Number(retry),date=Date.parse(retry);e.retryAfterMs=Number.isFinite(seconds)&&seconds>=0?seconds*1000:Number.isFinite(date)?Math.max(0,date-Date.now()):0}throw e}return data}
 function status(text){message=text;const el=document.getElementById('syncStatus');if(el)el.textContent=text;const stamp=document.getElementById('syncLastSuccess'),last=readMeta()?.syncedAt;if(stamp)stamp.textContent=last?'最終同期成功：'+new Date(last).toLocaleString('ja-JP'):'最終同期成功：まだありません';updateRetryCountdown()}
 const idKey=row=>row?.eventId||row?.legacyId||row?.recordId||row?.id||null;
 const newId=()=>globalThis.crypto?.randomUUID?.()||'op-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 function operationQueue(){try{const q=JSON.parse(localStorage.getItem(operationQueueKey)||'null');if(!q)return{version:2,operations:[]};if(q.version!==2||!Array.isArray(q.operations))throw Error();return q}catch{throw Error('未送信操作キューを読み取れません。端末データを保持して同期を停止しました。')}}
 function saveOperationQueue(q){localStorage.setItem(operationQueueKey,JSON.stringify(q))}
 function operationConflictReason(item){const p=item.payload?.path||[];if(item.type==='state.set'&&p[0]==='eikenDaily'&&p[1]==='days'&&p[3]==='words')return '英検の出題・復習状態が両端末で異なり、完了状態を安全に確定できません。両方の記録と操作IDを保持し、この項目だけを保留します。';if(item.type==='quest.upsert'||item.type==='quest.delete')return '同じクエストが別端末で編集されています。両方の内容を保持しています。';return 'この学習項目の変更を安全に統合できないため、両方の内容と操作IDを保持して保留します。'}
 function conflictProgress(value){if(!value||typeof value!=='object')return '進捗データなし';if(value.complete)return '完了・誤答 '+(Number(value.wrong)||0)+' 件';const stage=value.phase==='retry'?'復習中':'初回出題中';return stage+'・問題 '+Math.max(0,Number(value.index)||0)+'/'+(Array.isArray(value.original)?value.original.length:0)+'・誤答 '+(Number(value.wrong)||0)+' 件・復習待ち '+(Array.isArray(value.retry)?value.retry.length:0)+' 件'}
 function conflictTitle(item){const path=item.payload?.path||[];if(item.type==='state.set'&&path[0]==='eikenDaily'&&path[1]==='days'&&path[3]==='words')return '英検単語：'+path[2];const menu=item.local?.menu||item.payload?.menu;if(menu?.title)return 'クエスト：'+menu.title;return '学習項目の変更'}

 function migrationCopy(value,baseValue){
  const out=clone(value),device=localStorage.getItem(deviceKey)||newId();localStorage.setItem(deviceKey,device);
  const base=baseValue&&typeof baseValue==='object'?baseValue:{};
  for(const [collection,rows] of [['sessions',out.sessions||[]],['answers',out.answers||[]],['matches',out.matches||[]],['learningEvents',out.learningEvents||[]],['rpg.plays',out.rpg?.plays||[]]]){
   const baseRows=collection==='rpg.plays'?(base.rpg?.plays||[]):(base[collection]||[]),counts=new Map();
   for(const row of baseRows){const key=JSON.stringify(row);counts.set(key,(counts.get(key)||0)+1)}
   const delta=[];for(const row of rows){const key=JSON.stringify(row),n=counts.get(key)||0;if(n){counts.set(key,n-1);continue}delta.push(row)}
   rows.length=0;rows.push(...delta);
   rows.forEach((row,index)=>{if(row&&!row.eventId&&!row.legacyId)row.legacyId=device+':'+collection+':'+index})
  }
  out.questData ||= {menus:[],completions:{}};out.questData.completions ||= {};
  const baseMenus=new Map((base.questData?.menus||[]).map(row=>[row.id,row]));
  out.questData.menus=(out.questData.menus||[]).filter(row=>JSON.stringify(baseMenus.get(row.id))!==JSON.stringify(row));
  const deltaCompletions={};for(const [key,row] of Object.entries(out.questData.completions)){if(JSON.stringify(base.questData?.completions?.[key])!==JSON.stringify(row)){row.eventId||='legacy:'+key;deltaCompletions[key]=row}}
  out.questData.completions=deltaCompletions;
  const deltaDays={};for(const [date,sections] of Object.entries(out.eikenDaily?.days||{})){for(const [section,value] of Object.entries(sections||{})){if(JSON.stringify(base.eikenDaily?.days?.[date]?.[section])!==JSON.stringify(value)){deltaDays[date]||={};deltaDays[date][section]=value}}}
  out.eikenDaily={days:deltaDays};
  return out;
 }
 function ensureNewIds(before,after){
  const device=localStorage.getItem(deviceKey)||newId();localStorage.setItem(deviceKey,device);
  for(const key of Object.keys(after.questData?.completions||{})){const row=after.questData.completions[key],old=before.questData?.completions?.[key];if(row&&!old&&!row.eventId)row.eventId=newId()}
  for(const [collection,rows] of [['sessions',after.sessions||[]],['answers',after.answers||[]],['matches',after.matches||[]],['learningEvents',after.learningEvents||[]],['rpg.plays',after.rpg?.plays||[]]]){
   const oldRows=collection==='rpg.plays'?(before.rpg?.plays||[]):(before[collection]||[]);
   rows.forEach((row,index)=>{if(!row||index<oldRows.length)return;if(collection==='learningEvents'){if(!row.eventId)row.eventId=newId()}else if(!row.eventId&&!row.legacyId)row.legacyId=device+':'+collection+':'+index})
  }
  const now=new Date().toISOString();
  for(const menu of after.questData?.menus||[]){const old=(before.questData?.menus||[]).find(x=>x.id===menu.id);if(old&&JSON.stringify(old)!==JSON.stringify(menu)&&(!menu.updatedAt||menu.updatedAt===old.updatedAt))menu.updatedAt=now;else if(!old&&!menu.updatedAt)menu.updatedAt=now}
 }
 function operationChanges(before,after){
  const changes=[],oldMenus=new Map((before.questData?.menus||[]).map(x=>[x.id,x])),newMenus=new Map((after.questData?.menus||[]).map(x=>[x.id,x]));
  for(const id of new Set([...oldMenus.keys(),...newMenus.keys()])){
   const old=oldMenus.get(id),next=newMenus.get(id);if(old&&(!next||(!old.deleted&&next.deleted))){changes.push({type:'quest.delete',payload:{id,expectedUpdatedAt:old.updatedAt??null,updatedAt:next?.updatedAt||new Date().toISOString()}});continue}
   if(next&&JSON.stringify(old)!==JSON.stringify(next))changes.push({type:'quest.upsert',payload:{menu:next,expectedUpdatedAt:old?.updatedAt??null}})
  }
  const oldDone=before.questData?.completions||{},newDone=after.questData?.completions||{};
  for(const key of new Set([...Object.keys(oldDone),...Object.keys(newDone)])){
   const old=oldDone[key],next=newDone[key];if(!old&&next)changes.push({type:'quest.complete',payload:{key,completion:next}});
   else if(old&&!next)changes.push({type:'quest.undo',payload:{key,expectedEventId:old.eventId}});
   else if(old&&next&&JSON.stringify(old)!==JSON.stringify(next))changes.push({type:'quest.complete',payload:{key,completion:next}})
  }
  for(const collection of ['sessions','answers','matches','learningEvents','rpg.plays']){
   const oldRows=collection==='rpg.plays'?(before.rpg?.plays||[]):(before[collection]||[]),newRows=collection==='rpg.plays'?(after.rpg?.plays||[]):(after[collection]||[]);
   const keys=new Set(oldRows.map(idKey).filter(Boolean)),values=new Set(oldRows.map(JSON.stringify));
   for(const row of newRows){const key=idKey(row);if((key&&!keys.has(key))||(!key&&!values.has(JSON.stringify(row)))){changes.push({type:'record.append',payload:{collection,record:row}});if(key)keys.add(key);values.add(JSON.stringify(row))}}
  }
  const setObject=(root,oldObj,newObj)=>{for(const key of new Set([...Object.keys(oldObj||{}),...Object.keys(newObj||{})]))if(JSON.stringify(oldObj?.[key])!==JSON.stringify(newObj?.[key]))changes.push({type:'state.set',payload:{path:root.split('.').concat(key),expected:oldObj?.[key],value:newObj?.[key]}})};
  setObject('settings',before.settings,after.settings);
  for(const date of new Set([...Object.keys(before.eikenDaily?.days||{}),...Object.keys(after.eikenDaily?.days||{})])){
   const oldDay=before.eikenDaily?.days?.[date]||{},newDay=after.eikenDaily?.days?.[date]||{};
   for(const section of new Set([...Object.keys(oldDay),...Object.keys(newDay)]))if(JSON.stringify(oldDay[section])!==JSON.stringify(newDay[section]))changes.push({type:'state.set',payload:{path:['eikenDaily','days',date,section],expected:oldDay[section],value:newDay[section]}})
  }
  const oldR=before.rpg||{},newR=after.rpg||{};
  for(const name of ['unlocked','titles'])for(const [key,value] of Object.entries(newR[name]||{}))if(value===true&&oldR[name]?.[key]!==true)changes.push({type:'rpg.flag',payload:{collection:name,key,value:true}});
  setObject('rpg.settings',oldR.settings,newR.settings);
  if(Number(newR.giantWins)>Number(oldR.giantWins||0))changes.push({type:'rpg.increment',payload:{counter:'giantWins',delta:Number(newR.giantWins)-Number(oldR.giantWins||0)}});
  if(JSON.stringify(before.activeMatch)!==JSON.stringify(after.activeMatch))changes.push({type:'state.set',payload:{path:['activeMatch'],expected:before.activeMatch,value:after.activeMatch}});
  return changes;
 }
 function enqueueChanges(changes){
  if(!changes.length)return;
  const q=operationQueue(),createdAt=new Date().toISOString();q.operations.push(...changes.map(change=>({...change,id:newId(),status:'pending',createdAt})));saveOperationQueue(q)
 }
 function adoptRemote(remote,localSig){
  const data=remote.data||emptyState(),meta=readMeta(),generation=remote.generation||'initial';
  storeMeta({base:data,revision:remote.revision,generation,syncedAt:new Date().toISOString()});
  if(signature(s)===localSig&&!((tab==='MANAGE'&&questFormActive))){localStorage.setItem(KEY,JSON.stringify(data));s=data;match=s.activeMatch||null;render()}
 }
 async function operationSyncUnlocked(){
  if(busy||!code()||!api()||storageBlocked)return;busy=true;
  try{
   status('D1の正本を確認中…');let remote=await req('GET'),generation=remote.generation||'initial',meta=readMeta(),local=clone(s),localSig=signature(local);
   if(meta&&(meta.generation||'initial')!==generation&&!empty(local)){resetRequired=true;status('D1の世代が変わりました。端末記録を保持して同期を停止しています。');return}
   if(localStorage.getItem(operationModeKey)!=='events-v1'){
    if(!empty(local)){
     let migration;try{migration=JSON.parse(localStorage.getItem(migrationRequestKey)||'null')}catch{throw Error('移行データを読み取れません。端末記録は保持されています。')}
     if(!migration){migration={id:newId(),type:'legacy.import',payload:{data:migrationCopy(local,meta?.base)},localSnapshot:local,baseRevision:remote.revision,generation,archiveKey:'hq-sync-local-migration-archive-'+newId()};localStorage.setItem(migration.archiveKey,JSON.stringify({createdAt:new Date().toISOString(),generation,revision:meta?.revision??null,state:local}));localStorage.setItem(migrationRequestKey,JSON.stringify(migration))}
     let result;
     for(let attempt=0;attempt<4;attempt++){
      if(migration.generation!==generation)throw Error('移行対象のリセット世代が変わりました。端末記録は変更していません。');
      migration.baseRevision=remote.revision;localStorage.setItem(migrationRequestKey,JSON.stringify(migration));
      try{result=await req('POST',migration,api()+'/operations');break}catch(e){if(e.status===409&&e.code==='revision_conflict'){remote=await req('GET');generation=remote.generation||'initial';continue}throw e}
     }
     if(!result)throw Error('D1の変更が続いたため移行を保留しました。再度確認します。');
     localStorage.removeItem(migrationRequestKey);localStorage.setItem(operationModeKey,'events-v1');remote=result.data?{revision:result.revision,generation:result.generation,data:result.data}:await req('GET');
     const newer=clone(s);if(signature(newer)!==localSig){ensureNewIds(migration.localSnapshot||local,newer);enqueueChanges(operationChanges(migration.localSnapshot||local,newer));}
     local=clone(s);localSig=signature(local);
     status(result.audit?.xp||result.audit?.wordStreak?'移行完了。XP・連続正解数の端末差は監査記録に保管しました。':'既存記録を安全に移行しました。');
    }else{
     localStorage.setItem(operationModeKey,'events-v1');
     status(remote.data?'D1の学習記録をこの端末に読み込みました。':'同期を開始しました。');
    }
   }
   let queue=operationQueue();
   let revisionRetries=0;
   while(queue.operations.some(operation=>operation.status!=='conflict')){
    const item=queue.operations.find(operation=>operation.status!=='conflict');if(!item)break;
    generation=remote.generation||'initial';meta=readMeta();
    if(meta?.generation&&meta.generation!=='initial'&&meta.generation!==generation){resetRequired=true;status('D1の世代が変わりました。未送信操作と端末記録を保持しています。');return}
    const request={id:item.id,type:item.type,payload:item.payload,baseRevision:remote.revision,generation};
    try{const applied=await req('POST',request,api()+'/operations');remote={...remote,revision:applied.revision??remote.revision};queue.operations.shift();saveOperationQueue(queue);revisionRetries=0}
    catch(e){if(e.status===409&&e.code==='revision_conflict'){if(++revisionRetries<4){remote=await req('GET');continue}throw Error('同時更新が続いています。操作キューを保持して再試行します')}if(e.status===409&&e.code==='operation_conflict'){item.status='conflict';item.server=e.current??null;item.local=request.payload;item.conflictReason=operationConflictReason(item);saveOperationQueue(queue);revisionRetries=0;continue}throw e}
   }
   remote=await req('GET');adoptRemote(remote,signature(s));clearRetry();conflicts=[];conflictContext=null;initialDiff=null;resetRequired=false;
   const unresolved=queue.operations.filter(operation=>operation.status==='conflict').length;
   status(unresolved?String(unresolved)+'件の学習項目を保留しています。ほかの操作はD1と同期済みです。内容を確認してください。':'D1と同期済み');
  }catch(e){if(e.status===429||!e.status||e.status>=500){const delay=setRetry(e);status(e.status===429?'通信制限中です。端末記録と操作キューを保持しています。自動で再試行します。':'通信に失敗しました。端末記録と操作キューを保持し、自動で再試行します。');schedule(delay)}else status(e.status===401?'家族コードを確認してください。':e.code==='operation_schema_not_ready'?'新しい同期基盤の準備が終わっていません。端末記録は保持して再試行します。':'未同期：端末記録と操作キューを保持しています（'+e.message+'）')}
  finally{busy=false}
 }
 async function operationSync(){const state=retryState();if(state?.retryAt>Date.now()){status('通信制限中です。操作キューを保持して自動再試行を待っています。');schedule(state.retryAt-Date.now());return}if(navigator.locks?.request){return navigator.locks.request('hq-family-sync',{ifAvailable:true},lock=>{if(!lock){status('別のタブで同期中です。完了後に確認します。');schedule(2000);return}return operationSyncUnlocked()})}return operationSyncUnlocked()}
 async function sync(){const state=retryState();if(state?.retryAt>Date.now()){status('通信制限中です。操作キューを保持して自動再試行を待っています。');schedule(state.retryAt-Date.now());return}
  if(code()&&api())return operationSync();
  if(busy||conflictContext||initialDiff||resetRequired||!code()||!api()||storageBlocked)return;busy=true;
  try{
   status('同期を確認中…');const remote=await req('GET'),generation=remote.generation||'initial';let meta=readMeta();const local=clone(s), localSig=signature(local);let next;
   const generationMismatch=(meta?.generation||'initial')!==generation;
   const rawQueue=localStorage.getItem('hq-sync-queue-v1');
   let hasPendingQueue=false;
   if(rawQueue!==null){try{const queue=JSON.parse(rawQueue);hasPendingQueue=!queue||!Array.isArray(queue.operations)||queue.operations.length>0}catch{hasPendingQueue=true}}
   let adoptedGeneration=false;
   if(generationMismatch){
    if(empty(local)&&(!meta||(!!meta.base&&empty(meta.base)))&&!hasPendingQueue){next=remote.data===null?local:remote.data;adoptedGeneration=true}
    else{resetRequired=true;status(hasPendingQueue?'リセット世代が変わりました。未送信データを保持するため同期を停止しました。バックアップを保存して内容を確認してください。':'本番のリセット世代が変わりました。この端末に学習記録があるため同期を停止しました。記録を保持しています。');return}
   }
   if(!adoptedGeneration&&!meta&&generation!=='initial'&&!empty(local)){resetRequired=true;status('本番データは初期化済みですが、この端末に古い記録があります。端末初期化後に同期してください。');return}
   if(!adoptedGeneration&&!meta){
    if(remote.data===null){
      if(empty(local)){next=local;}
      else {status('この端末に既存の学習記録が見つかりました。空のクラウドへの初回同期は停止しました。端末の記録は保持されています。内容を確認してください。');return;}
     }
    else if(empty(local)){next=remote.data;}
    else {initialDiff={local,remote:clone(remote.data),revision:remote.revision,generation,localSig,plan:HQMerge.initial(transformed(local),transformed(remote.data))};status('両方にデータがあります。内容を比較してください。初回同期は停止中です。');render();return;}
   }else if(adoptedGeneration){/* The safe generation GET above already selected next. */}
   else if(remote.data===null){if(generation!=='initial'&&empty(meta?.base||{}))next=local;else{status('クラウドが空のため同期を停止しました。端末の記録は保持しています。');return}}
   else {
    const merged=HQMerge.merge(transformed(meta.base),transformed(local),transformed(remote.data));
    if(merged.conflicts.length){conflicts=merged.conflicts;conflictContext={local,remote:clone(remote.data),localRevision:meta?.revision??null,revision:remote.revision,generation,preview:merged.value,localSig};status('同時編集が見つかりました。変更項目と値を確認してください。まだ同期していません。');render();return;}
    next=untransform(merged.value);
   }
   if(!validState(next))throw Error('同期データの形式が不正です');
   let revision=remote.revision;
   if(signature(next)!==signature(remote.data)) {const result=await req('PUT',{revision,generation,data:next});revision=result.revision;}
   // A local edit during the request must not be overwritten.
   if(signature(s)!==localSig){
    const pending=HQMerge.merge(transformed(local),transformed(s),transformed(next));
    if(pending.conflicts.length){conflicts=pending.conflicts;conflictContext=null;status('同期中の変更が競合しました。再確認してください。');schedule();return;}
    const combined=untransform(pending.value);if(!validState(combined))throw Error('同期データの形式が不正です');
    localStorage.setItem(KEY,JSON.stringify(combined));storeMeta({base:next,revision,generation,syncedAt:new Date().toISOString()});s=combined;match=s.activeMatch||null;status('端末の新しい変更を再送します');schedule();return;
   }
   // Persist before changing memory; any quota failure leaves the original untouched.
   localStorage.setItem(KEY,JSON.stringify(next));storeMeta({base:next,revision,generation,syncedAt:new Date().toISOString()});s=next;match=s.activeMatch||null;conflicts=[];conflictContext=null;initialDiff=null;status('同期済み');render();
  }catch(e){status(e.code==='reset_generation_changed'?'リセット世代が変わりました。端末初期化後に同期できます。':e.status===409?'同時更新を検出。次回再確認します。':e.status===401?'家族コードを確認してください。':'未同期：端末に保存しています（'+e.message+'）');if(e.status===409)schedule();else if(e.status===429)schedule(30000);else if(!e.status||e.status>=500)schedule(10000)}
  finally{busy=false}
 }
 const retryKey='hq-sync-retry-v1';
 function retryState(){try{return JSON.parse(localStorage.getItem(retryKey)||'null')}catch{return null}}
 function updateRetryCountdown(){const el=document.getElementById('syncNextRetry'),state=retryState();if(!el)return;const left=Math.max(0,(state?.retryAt||0)-Date.now());el.textContent=left>0?'次回自動再試行まで：約'+Math.ceil(left/1000)+'秒':'自動再試行の待機はありません'}
 function clearRetry(){localStorage.removeItem(retryKey);updateRetryCountdown()}
 function setRetry(e){const previous=retryState(),attempt=Math.min(9,(previous?.attempt||0)+1),backoff=Math.min(300000,2000*Math.pow(2,attempt-1)),jitter=Math.floor(Math.random()*Math.max(250,backoff*.25)),delay=Math.max(backoff,e.retryAfterMs||0)+jitter,retryAt=Date.now()+delay;localStorage.setItem(retryKey,JSON.stringify({attempt,retryAt,reason:e.status===429?'rate_limited':'transient'}));schedule(delay);updateRetryCountdown();return delay}
 function schedule(delay=1200){const state=retryState(),wait=state&&state.retryAt>Date.now()?state.retryAt-Date.now():delay,target=Date.now()+wait;if(timer&&timerAt<=target)return;if(timer)clearTimeout(timer);timerAt=target;timer=setTimeout(()=>{timer=null;timerAt=0;if(busy){schedule(1000);return}sync()},wait)}
 const previousSave=save;save=function(){
  let before={};try{before=JSON.parse(localStorage.getItem(KEY)||'{}')}catch{}
  if(localStorage.getItem(operationModeKey)==='events-v1'){const after=clone(s);ensureNewIds(before,after);s=after}
  const after=clone(s),ok=previousSave();
  if(ok&&code()){
   if(localStorage.getItem(operationModeKey)==='events-v1')try{enqueueChanges(operationChanges(before,after))}catch(e){localStorage.removeItem(operationModeKey);status('操作キューを保存できませんでした。端末記録を保持して安全な移行を再試行します（'+e.message+'）')}
   schedule()
  }
  return ok
 };
 window.hqSyncEnable=async function(){
  if(!api()){alert('同期サーバーはまだ設定されていません。');return}
  const input=document.getElementById('hqCode').value;if(!/^\d{5}$/.test(input)){alert('数字5桁を入力してください');return}
  try{localStorage.setItem(authKey,input);await sync()}catch(e){alert('端末に保存できません: '+e.message)}
 };
 window.hqSyncNow=function(){if(busy){schedule();return false}return sync()};
 window.hqResolveOperationConflict=async function(choice,operationId){
  if(busy)return;
  try{
   const queue=operationQueue(),index=queue.operations.findIndex(operation=>operation.id===operationId&&operation.status==='conflict'),item=queue.operations[index>=0?index:queue.operations.findIndex(operation=>operation.status==='conflict')];if(!item)return;
   const resolvedIndex=queue.operations.indexOf(item);
   if(choice==='cloud'){queue.operations.splice(resolvedIndex,1);saveOperationQueue(queue);status('D1側の内容を採用しました。この項目以外の未送信操作は保持しています。');await sync();return}
   if(choice!=='local'||!['quest.upsert','quest.delete'].includes(item.type)){status('この操作は両方の記録を保留しています。端末側を安全に重ねられないため、D1側を採用する場合だけ選択できます。');return}
   const current=item.server,expectedUpdatedAt=current?.updatedAt??null;item.payload.expectedUpdatedAt=expectedUpdatedAt;
   item.id=newId();item.status='pending';delete item.server;delete item.local;delete item.conflictReason;saveOperationQueue(queue);
   status('端末側のメニュー変更を最新状態へ適用しています。');await sync();
  }catch(e){status('保留中の操作を読み取れません。端末記録を保持しています（'+e.message+'）')}
 };
 window.hqSyncDisconnect=function(){localStorage.removeItem(authKey);initialDiff=null;conflictContext=null;conflicts=[];status('同期を停止しました。端末の記録は残っています。');render()};
 // Resolve only an exact, still-current snapshot; a stale selection never overwrites newer edits.
 window.hqResolveConflicts=async function(){
  if(busy||!conflictContext)return;
  if(conflicts.some(row=>isCriticalConflict(row.path))){status('XP・レベル・完了履歴の整合性が確認できないため保存を停止しています。両端末の記録は変更していません。');return}
  const choices=conflicts.map((_,i)=>document.querySelector('input[name="hq-conflict-'+i+'"]:checked')?.value);
  if(choices.some(x=>x!=='local'&&x!=='remote')){alert('すべての項目で採用する内容を選んでください');return}
  const ctx=conflictContext;
  if(signature(s)!==ctx.localSig){status('選択中に端末の記録が変わりました。内容を再確認してください。');conflictContext=null;conflicts=[];await sync();return}
  busy=true;
  try{
   const remote=await req('GET');
   if(remote.revision!==ctx.revision||(remote.generation||'initial')!==ctx.generation||signature(remote.data)!==signature(ctx.remote)){status('相手の変更が更新されました。再確認してください。');conflictContext=null;conflicts=[];return}
   let selected=clone(ctx.preview);
   for(let i=0;i<conflicts.length;i++){
    const row=conflicts[i],side=row[choices[i]];
    if(!row.path.length){if(!side.exists)throw Error('全体の削除はできません');selected=clone(side.value);continue}
    let target=selected;
    for(const key of row.path.slice(0,-1)){
     if(!target||typeof target!=='object'||!Object.hasOwn(target,key))throw Error('競合の位置を確認できません');
     target=target[key];
    }
    const key=row.path.at(-1);
    if(side.exists)Object.defineProperty(target,key,{value:clone(side.value),enumerable:true,configurable:true,writable:true});else delete target[key];
   }
   const resolved=untransform(selected);if(!validState(resolved))throw Error('選択結果の形式が不正です');
   localStorage.setItem('hq-sync-conflict-backup-'+crypto.randomUUID(),JSON.stringify({time:new Date().toISOString(),local:ctx.local,remote:ctx.remote,conflicts}));
   const result=await req('PUT',{revision:remote.revision,generation:ctx.generation,data:resolved});
   if(signature(s)!==ctx.localSig){conflictContext=null;conflicts=[];status('同期中に端末の記録が変わりました。再確認します。');schedule();return}
   localStorage.setItem(KEY,JSON.stringify(resolved));storeMeta({base:resolved,revision:result.revision,generation:ctx.generation,syncedAt:new Date().toISOString()});s=resolved;match=s.activeMatch||null;conflictContext=null;conflicts=[];status('競合を解決して同期しました');render();
  }catch(e){status(e.status===409?'相手の変更が更新されました。再確認してください。':'解決できませんでした。両方の記録は保持されています（'+e.message+'）')}
  finally{busy=false;if(!conflictContext&&conflicts.length===0&&message.includes('再確認'))schedule()}
 };
 function downloadBackup(data,name){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 window.hqInitialBackup=function(which){if(initialDiff)downloadBackup(initialDiff[which],which==='local'?'haruki-this-device-backup.json':'haruki-other-device-backup.json')};
 window.hqInitialMerge=async function(){
  if(busy||!initialDiff)return;
  if(!document.getElementById('hqInitialLocalBackup')?.checked||!document.getElementById('hqInitialRemoteBackup')?.checked){alert('この端末と相手の端末、両方のバックアップを保存して確認してください');return}
  const ctx=initialDiff;
  if(ctx.plan.hardErrors?.length){status('完了履歴を安全に確認できないため統合を停止しました。');return}
  const choices=ctx.plan.menuConflicts.map((_,i)=>document.querySelector('input[name="hq-initial-menu-'+i+'"]:checked')?.value);
  if(choices.some(x=>x!=='local'&&x!=='remote')){alert('同じメニューの採用する内容を選んでください');return}
  const recordChoices=ctx.plan.blocked.map((_,i)=>document.querySelector('input[name="hq-initial-record-'+i+'"]:checked')?.value);
  if(recordChoices.some(x=>x!=='local'&&x!=='remote')){alert('自動統合できない記録について、採用する内容を選んでください');return}
  if(signature(s)!==ctx.localSig){initialDiff=null;status('端末の記録が変わりました。比較し直します。');await sync();return}
  busy=true;
  try{
   const latest=await req('GET');
   if(latest.revision!==ctx.revision||(latest.generation||'initial')!==ctx.generation||signature(latest.data)!==signature(ctx.remote)){initialDiff=null;status('相手の記録が変わりました。比較し直します。');return}
   const selected=clone(ctx.plan.value);
   for(let i=0;i<ctx.plan.menuConflicts.length;i++){
    const row=ctx.plan.menuConflicts[i],id=row.path[2];
    Object.defineProperty(selected.questData.menus,id,{value:clone(row[choices[i]]),enumerable:true,configurable:true,writable:true});
   }
   for(let i=0;i<ctx.plan.blocked.length;i++){
    const row=ctx.plan.blocked[i];let target=selected;
    for(const key of row.path.slice(0,-1)){if(!target||typeof target!=='object'||!Object.hasOwn(target,key))throw Error('記録の位置を確認できません');target=target[key]}
    if(!row.path.length)throw Error('記録の位置を確認できません');
    Object.defineProperty(target,row.path.at(-1),{value:clone(row[recordChoices[i]]),enumerable:true,configurable:true,writable:true});
   }
   const joined=untransform(selected);if(!validState(joined))throw Error('統合結果の形式が不正です');
   // Save both originals before attempting any remote or local write. A quota
   // error aborts, and the backup remains available even if the request fails.
   localStorage.setItem('hq-sync-initial-backup-'+crypto.randomUUID(),JSON.stringify({time:new Date().toISOString(),local:ctx.local,remote:ctx.remote}));
   const saved=await req('PUT',{revision:latest.revision,generation:ctx.generation,data:joined});
   if(signature(s)!==ctx.localSig){initialDiff=null;status('同期中に端末の記録が変わりました。比較し直します。');return}
   localStorage.setItem(KEY,JSON.stringify(joined));storeMeta({base:joined,revision:saved.revision,generation:ctx.generation,syncedAt:new Date().toISOString()});s=joined;match=s.activeMatch||null;initialDiff=null;status('両方のメニューを残して同期しました');render();
  }catch(e){if(e.code==='reset_generation_changed'){resetRequired=true;initialDiff=null;status('本番のリセット世代が変わりました。端末初期化後に同期できます。')}else if(e.status===409){initialDiff=null;status('相手の記録が変わりました。比較し直します。')}else status('統合できませんでした。両方の記録は保持されています（'+e.message+'）')}
  finally{busy=false;if(!initialDiff&&message.includes('比較し直します'))schedule()}
 };
 function syncSummary(state){
  const menus=Array.isArray(state?.questData?.menus)?state.questData.menus:[];
  const completed=Object.values(state?.questData?.completions||{}).filter(x=>x&&typeof x==='object');
  const todayKey=today(),todayCompleted=completed.filter(x=>x.date===todayKey);
  const sessions=Array.isArray(state?.sessions)?state.sessions:[];
  const minutesToday=sessions.filter(x=>x?.date===todayKey).reduce((n,x)=>n+(Number(x.minutes)||0),0)+todayCompleted.reduce((n,x)=>n+(Number(x.minutes)||0),0);
  const questXP=completed.reduce((n,x)=>n+(Number(x.xp)||0),0),bonusXP=Math.max(0,Number(state?.rpg?.bonusXP)||0),totalXP=questXP+bonusXP;
  const p=state?.xpProgression||{};let level=Math.max(1,Number(p.baseLevel)||1),remaining=(Number(p.carryXP)||0)+Math.max(0,questXP-(Number(p.baseQuestXP)||0));
  const requirement=lv=>Math.ceil(120*Math.pow(1.05,Math.max(0,lv-1)));
  for(let guard=0;guard<1000&&remaining>=requirement(level);guard++){remaining-=requirement(level);level++}
  const rpg=state?.rpg||{},wordAttempts=(state?.learningEvents||[]).filter(x=>x&&x.date===todayKey&&['enjp','jpen'].includes(x.type));
  return {questCount:menus.filter(x=>x&&!x.deleted).length,activeQuestCount:menus.filter(x=>x&&!x.deleted).length,completionCount:completed.length,completedQuestXP:questXP,completedQuestMinutes:completed.reduce((n,x)=>n+(Number(x?.minutes)||0),0),completedQuestCountToday:todayCompleted.length,completedToday:todayCompleted.length,studyMinutesToday:minutesToday,sessionCount:sessions.length,sessionMinutes:sessions.reduce((n,x)=>n+(Number(x?.minutes)||0),0),questXP,bonusXP,totalXP,estimatedLevel:level,xpProgression:{version:p.version??null,baseLevel:p.baseLevel??null,baseQuestXP:p.baseQuestXP??null,baseBonusXP:p.baseBonusXP??null,carryXP:p.carryXP??null},bonusAwardCount:Object.keys(rpg.awards||{}).length,bonusAwardIds:Object.keys(rpg.awards||{}),wordStreak:Number(rpg.wordStreak)||0,wordStreakDate:rpg.streakDate||null,wordAnswerCountToday:wordAttempts.length,answerCount:Array.isArray(state?.answers)?state.answers.length:0,learningEventCount:Array.isArray(state?.learningEvents)?state.learningEvents.length:0};
 }
 window.hqSyncDiagnose=async function(){
  if(diagnosticBusy){diagnosticRerun=true;setDiagnostic('loading','診断中です。完了後にもう一度読み取ります。');return}
  const out=document.getElementById('hqSyncDiagnostic');if(!out)return;
  if(!code()){setDiagnostic('error',JSON.stringify({capturedAt:new Date().toISOString(),status:'取得失敗',error:{httpStatus:null,code:'family_code_missing',message:'家族コード未接続です。家族コードを入力して「同期を開始」してください。'}},null,2));return}
  diagnosticBusy=true;diagnosticRerun=false;const startedAt=new Date().toISOString();setDiagnostic('loading','最新D1を読み取り中（GETのみ・変更なし）…',startedAt);
  const local=clone(s),meta=readMeta(),queueRaw=localStorage.getItem('hq-sync-queue-v1');let pendingQueueCount=0;
  try{if(queueRaw){const q=JSON.parse(queueRaw);pendingQueueCount=Array.isArray(q?.operations)?q.operations.length:null}}catch{pendingQueueCount='判読不可'}
  try{
   const remote=await req('GET',undefined,api()+'/snapshot?diagnostic='+encodeURIComponent(Date.now())),latestMeta=readMeta();
   if(!remote||!Number.isInteger(remote.revision)||!Object.hasOwn(remote,'data'))throw Error('応答形式が不正です');
   const generation=remote.generation||'initial',capturedAt=new Date().toISOString();
   const result={capturedAt,status:'取得成功',mode:'GET only; no PUT or local writes',local:{revision:meta?.revision??null,resetGeneration:meta?.generation||'initial',...syncSummary(local),hasUnsyncedChanges:!meta?.base||signature(local)!==signature(meta.base),pendingQueueCount},deviceSync:{lastSuccessfulSync:meta?.syncedAt||null,resetBlocked:resetRequired,status:message},cloud:{revision:remote.revision,resetGeneration:generation,snapshotPresent:remote.data!==null,...(remote.data===null?{questCount:0,activeQuestCount:0,completionCount:0,completedToday:0,questXP:0,bonusXP:0,totalXP:0,estimatedLevel:1}:{...syncSummary(remote.data),questCount:syncSummary(remote.data).activeQuestCount})},comparison:{revisionMatches:meta?.revision===remote.revision,resetGenerationMatches:(meta?.generation||'initial')===generation,localDataMatchesCloud:remote.data!==null&&signature(local)===signature(remote.data)},snapshotChangedDuringDiagnostic:signature(s)!==signature(local)||latestMeta?.revision!==meta?.revision};
   setDiagnostic('success',JSON.stringify(result,null,2),capturedAt);
  }catch(e){
   const capturedAt=new Date().toISOString(),httpStatus=Number.isInteger(e.status)?e.status:null,detail=String(e.details||e.code||e.message||'原因不明').slice(0,500);
   setDiagnostic('error',JSON.stringify({capturedAt,status:'取得失敗',error:{httpStatus,code:e.code||null,message:detail},retry:'家族コード・通信を確認し、「今すぐ同期」またはこの診断ボタンを再実行してください。'},null,2),capturedAt);
  }finally{
   diagnosticBusy=false;
   if(diagnosticRerun){diagnosticRerun=false;window.hqSyncDiagnose()}
  }
 };

 function setDiagnostic(state,result,checkedAt=new Date().toISOString()){
  diagnosticState=state;diagnosticResult=String(result||'');diagnosticCheckedAt=checkedAt;
  try{sessionStorage.setItem('hq-sync-diagnostic-v1',JSON.stringify({state:diagnosticState,result:diagnosticResult,checkedAt:diagnosticCheckedAt}))}catch{}
  updateDiagnosticPanel();
 }
 function updateDiagnosticPanel(){
  const panel=document.getElementById('hqSyncDiagnosticPanel');if(!panel)return;
  panel.hidden=diagnosticState==='idle';
  const label=document.getElementById('hqSyncDiagnosticState'),stamp=document.getElementById('hqSyncDiagnosticTime'),out=document.getElementById('hqSyncDiagnostic');
  if(label)label.textContent=diagnosticState==='loading'?'読み取り中':diagnosticState==='success'?'取得成功':diagnosticState==='error'?'取得失敗':'';
  if(stamp)stamp.textContent=diagnosticCheckedAt?'取得日時：'+new Date(diagnosticCheckedAt).toLocaleString('ja-JP'):'';
  if(out)out.textContent=diagnosticResult;
 }
 window.hqSyncDiagnosticClose=function(){
  diagnosticState='idle';diagnosticResult='';diagnosticCheckedAt='';diagnosticRerun=false;
  try{sessionStorage.removeItem('hq-sync-diagnostic-v1')}catch{}
  updateDiagnosticPanel();
 };
 function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);if(cls)node.className=cls;return node}
 function menuDetails(m){if(!m)return '記録なし';return [m.title||'名称なし',m.subject||'科目未設定',(Number(m.minutes)||0)+'分',(Number(m.xp)||0)+' XP',m.date||'',m.repeat==='daily'?'毎日':m.repeat==='weekly'?'毎週':'',m.deleted?'削除済み':'',m.note||''].filter(Boolean).join(' ・ ')}
 const fieldLabels={sessions:'学習時間の記録',answers:'回答記録',matches:'バスケットボール試合記録',learningEvents:'英検回答履歴',questData:'クエストデータ',menus:'クエストメニュー',completions:'クエスト完了履歴',rpg:'XP・レベル・ゲーム進捗',bonusXP:'追加XP',awards:'XP獲得イベント',plays:'試合プレー記録',giantWins:'ジャイアント戦勝利数',xpProgression:'XP・レベル進行データ',baseLevel:'基準レベル',baseQuestXP:'基準クエストXP',baseBonusXP:'基準追加XP',carryXP:'引き継ぎXP',xp:'獲得XP',minutes:'学習時間',date:'学習日',time:'記録時刻',timestamp:'変更日時',createdAt:'作成日時',updatedAt:'更新日時',eventId:'イベントID',id:'記録ID',subject:'学習分野',title:'クエスト名',kind:'学習種別',won:'勝敗',score:'スコア',opponent:'対戦相手',duration:'時間',note:'メモ',repeat:'繰り返し'};
 function conflictPathLabel(path){if(!path.length)return '全体データ';const [root,...rest]=path;const rootLabel=fieldLabels[root]||root;return rest.length?rootLabel+' › '+rest.map(k=>fieldLabels[k]||String(k)).join(' › '):rootLabel}
 function isCriticalConflict(path){return path?.[0]==='rpg'||path?.[0]==='xpProgression'||(path?.[0]==='questData'&&path?.[1]==='completions')}
 function conflictReason(path){
  if(path?.[0]==='rpg'&&path?.[1]==='wordStreak')return '連続正解数は当日の英単語回答履歴から照合できる場合だけ再計算します。回答履歴が不足しているため、値を推測しません。';
  if(path?.[0]==='xpProgression')return 'この値は各端末で別々に作られたレベル基準です。「引き継ぎXP」は獲得XPイベントではなく、追加XPと合算できません。基準値の発生記録も照合できないため、同期を保留しています。';
  if(path?.[0]==='rpg')return '追加XPの合計と獲得イベント記録が一致するか検証できません。イベントIDが不明または不足しているため、どちらも自動採用・合算しません。';
  if(path?.[0]==='questData'&&path?.[1]==='completions')return '同じ完了記録IDの内容が異なるため、履歴と獲得XPを確認できるまで保存を保留しています。';
  return '';
 }
 function valueTimestamp(v){if(!v||typeof v!=='object')return null;if(Array.isArray(v)){for(const x of v){const t=valueTimestamp(x);if(t)return t}return null}for(const k of ['updatedAt','updated_at','timestamp','time','createdAt','created_at'])if(v[k]!==undefined&&v[k]!==null)return String(v[k]);return null}
 function readable(v){if(v===undefined)return '記録なし';if(v===null)return 'なし';if(typeof v!=='object')return typeof v==='boolean'?(v?'あり':'なし'):String(v);if(Array.isArray(v))return v.length?'全'+v.length+'件：'+v.map((x,i)=>'['+(i+1)+'] '+readable(x)).join(' ／ '):'記録なし';if('title' in v)return menuDetails(v);const parts=Object.entries(v).slice(0,30).map(([k,x])=>(fieldLabels[k]||k)+'：'+readable(x));return parts.join(' ・ ')||'記録なし'}
 function awardSummary(r){const keys=Object.keys(r?.awards||{});if(!keys.length)return Number(r?.bonusXP)?'発生元を確認できません':'獲得記録なし';return keys.map(k=>{const parts=k.split(':'),names={word:'英単語',sentence:'文章穴埋め',dialogue:'会話穴埋め',reading:'読解',giant:'試合報酬'};return names[parts[0]]?names[parts[0]]+'（'+parts.slice(1).join('／')+'）':'不明な獲得記録（'+k+'）'}).join('、')}
 function appendComparison(app){
  if(!conflictContext&&!initialDiff)return;
  const section=el('section',undefined,'card hq-compare');section.appendChild(el('h3',initialDiff?'初回同期の内容を比較':'同時編集の確認'));
  section.appendChild(el('p',initialDiff?'両方の内容を確認し、それぞれのバックアップを保存してください。':'この端末と相手の端末の内容を比較し、採用する内容を選んでください。'));
  if(initialDiff){
   const ctx=initialDiff;
   for(const [label,state] of [['この端末',ctx.local],['相手の端末',ctx.remote]]){
    const side=el('section',undefined,'box');side.style.margin='12px 0';side.appendChild(el('h4',label));
    const menus=state.questData?.menus||[];side.appendChild(el('strong','学習メニュー '+menus.length+'件'));if(!menus.length)side.appendChild(el('p','メニューはありません'));
    for(const m of menus)side.appendChild(el('p',menuDetails(m)));
    const completed=Object.values(state.questData?.completions||{}),xp=completed.reduce((n,x)=>n+(Number(x?.xp)||0),0);
    side.appendChild(el('strong','完了履歴 '+completed.length+'件'));for(const c of completed)side.appendChild(el('p',menuDetails(c)));
    side.appendChild(el('p','クエスト XP：'+xp+' ／ 追加 XP：'+(Number(state.rpg?.bonusXP)||0)));
    const matches=state.matches||[];side.appendChild(el('p','試合履歴：'+matches.length+'試合 ／ 勝利：'+matches.filter(x=>x.won).length+'試合'));
    side.appendChild(el('p','学習時間の記録：'+(state.sessions||[]).length+'件 ／ 学習回答：'+(state.answers||[]).length+'件'));
    section.appendChild(side);
   }
   if(ctx.plan.menuConflicts.length){section.appendChild(el('h4','同じメニューの内容を選択'));ctx.plan.menuConflicts.forEach((row,i)=>{const field=el('fieldset');field.appendChild(el('legend','同じメニュー：どちらを残しますか'));for(const [key,label] of [['local','この端末'],['remote','相手の端末']]){const wrap=el('label'),radio=el('input');radio.type='radio';radio.name='hq-initial-menu-'+i;radio.value=key;wrap.appendChild(radio);wrap.appendChild(document.createTextNode(label+'：'+menuDetails(row[key])));field.appendChild(wrap)}section.appendChild(field)});}
      if(ctx.plan.hardErrors?.length){const warning=el('p','完了履歴の識別子または XP を確認できないため、統合できません。両方のバックアップを保存してください。');warning.setAttribute('role','alert');section.appendChild(warning);}
   if(ctx.plan.blocked.length){
    const warning=el('p','自動統合できない記録があります。採用しなかった内容は画面の集計に反映されませんが、保存したバックアップに残ります。');warning.setAttribute('role','alert');section.appendChild(warning);
    const labelFor=path=>path[0]==='rpg'?'追加 XP・ゲーム進捗':path[0]==='questData'&&path[1]==='completions'?'同じ日の完了履歴':({sessions:'学習時間の記録',answers:'学習回答',matches:'試合履歴',settings:'設定',learningEvents:'学習履歴',eikenDaily:'英検進捗'})[path[0]]||'その他の記録';
    ctx.plan.blocked.forEach((row,i)=>{const field=el('fieldset');field.appendChild(el('legend',labelFor(row.path)+'：採用する内容を選択'));for(const [key,label] of [['local','この端末'],['remote','相手の端末']]){const wrap=el('label'),radio=el('input');radio.type='radio';radio.name='hq-initial-record-'+i;radio.value=key;wrap.appendChild(radio);const value=row.path[0]==='rpg'&&row.path.length===1?'追加 XP '+(Number(row[key]?.bonusXP)||0)+' ／ 獲得記録 '+Object.keys(row[key]?.awards||{}).length+'件 ／ 発生元：'+awardSummary(row[key])+' ／ 試合プレー '+(row[key]?.plays||[]).length+'件':readable(row[key]);wrap.appendChild(document.createTextNode(label+'：'+value));field.appendChild(wrap)}section.appendChild(field)});
   }
   for(const [key,label] of [['local','この端末'],['remote','相手の端末']]){const button=el('button',label+'のバックアップを保存');button.type='button';button.className='secondary';button.onclick=()=>window.hqInitialBackup(key);section.appendChild(button);const wrap=el('label'),check=el('input');check.type='checkbox';check.id=key==='local'?'hqInitialLocalBackup':'hqInitialRemoteBackup';wrap.appendChild(check);wrap.appendChild(document.createTextNode(label+'のこの端末に記録がある場合、バックアップを保存して確認しました'));section.appendChild(wrap)}
   const join=el('button','両方のメニューを残して同期する');join.type='button';join.disabled=!!ctx.plan.hardErrors?.length;join.onclick=window.hqInitialMerge;section.appendChild(join);
  }else{
   const hasCritical=conflicts.some(row=>isCriticalConflict(row.path));
   section.appendChild(el('p',hasCritical?'XP・レベル・完了履歴を含む競合があります。安全な整合性を確認できるまで選択と保存を停止しています。双方の元データは保持されます。':'値を確認するまで選択・保存は不要です。競合している内容はこの端末とD1の双方に保持されています。','hq-conflict-safety'));
   conflicts.forEach((row,i)=>{const field=el('fieldset'),path=row.path||[],localValue=row.local?.exists?row.local.value:undefined,remoteValue=row.remote?.exists?row.remote.value:undefined;field.appendChild(el('legend','競合項目：'+conflictPathLabel(path)));field.appendChild(el('small','保存フィールド：'+(path.length?path.join('.'):'（ルート全体）')));const when=valueTimestamp(localValue)||valueTimestamp(remoteValue);field.appendChild(el('small','記録された変更日時：'+(when||'記録なし')+' ／ 端末 revision '+(conflictContext.localRevision??'記録なし')+' ／ D1 revision '+conflictContext.revision));const reason=conflictReason(path);if(reason){const note=el('p',reason,'hq-conflict-reason');note.setAttribute('role','alert');field.appendChild(note)}for(const [key,label] of [['local','この端末'],['remote','相手の端末']]){const wrap=el('label');if(!hasCritical){const radio=el('input');radio.type='radio';radio.name='hq-conflict-'+i;radio.value=key;wrap.appendChild(radio)}wrap.appendChild(document.createTextNode(label+'：'+(row[key].exists?readable(row[key].value):'（削除）')));field.appendChild(wrap)}section.appendChild(field)});
   const button=el('button',hasCritical?'安全確認待ち：同期を停止中':'選んだ内容で同期');button.type='button';button.disabled=hasCritical;button.onclick=window.hqResolveConflicts;section.appendChild(button);
  }
  app.appendChild(section);
 }

 window.hqConflictDownload=function(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({conflicts,local:s,base:readMeta()?.base},null,2)],{type:'application/json'}));a.download='haruki-sync-conflicts.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
 window.hqResetDevice=async function(){
  if(busy){alert('同期処理が終わってから実行してください');return}
  if(!api()){alert('同期サーバーが設定されていません');return}
  const typed=document.getElementById('hqCode')?.value||'',candidate=code()||typed;
  if(!/^[0-9]{5}$/.test(candidate)){alert('家族コードを入力してください');return}
  if(!code())localStorage.setItem(authKey,candidate);
  busy=true;clearTimeout(timer);
  try{
   const remote=await req('GET');
   if(!remote.generation||remote.generation==='initial'||(remote.data!==null&&!empty(remote.data))){
    status('本番D1の初期化後、まだ新しい学習記録を追加していない状態で実行してください。');return
   }
   const ok=confirm('この端末の学習メニュー、完了履歴、学習時間・回答、英検進捗、XP・レベル、試合・ゲーム進捗、競合情報と未送信同期キューを削除します。教材・問題データとアプリ設定は残ります。元に戻せません。続けますか？');
   if(!ok){status('端末初期化をキャンセルしました');return}
   const fresh=emptyState();
   fresh.questData={menus:[],completions:{}};
   fresh.eikenDaily={days:{}};
   fresh.rpg={bonusXP:0,awards:{},unlocked:{three:true},titles:{},plays:[],giantWins:0,settings:{motion:'full',sound:false,skip:false}};
   localStorage.setItem(KEY,JSON.stringify(fresh));
   for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key&&key.startsWith('hq-sync-')&&key!==authKey)localStorage.removeItem(key)}
   storeMeta({base:fresh,revision:remote.revision,generation:remote.generation,syncedAt:new Date().toISOString()});
   s=fresh;match=null;initialDiff=null;conflictContext=null;conflicts=[];resetRequired=false;
   status('この端末の学習記録を初期化しました。同期を再開します。');render();if(code())schedule();
  }catch(e){status(e.status===401?'家族コードを確認してください。':'端末を初期化できませんでした（'+e.message+'）')}
  finally{busy=false}
 };
 const prior=render;render=function(){prior();if(tab!=='MANAGE'&&tab!=='PARENT')return;const app=document.getElementById('app');if(!app)return;app.insertAdjacentHTML('beforeend',card(`<h3>親子同期</h3><p>初回は端末の学習記録を安全に移行します。記録の比較やバックアップ操作は不要です。</p><label>家族コード <input id="hqCode" inputmode="numeric" maxlength="5" type="password" autocomplete="off"></label><div class="row"><button onclick="hqSyncEnable()">同期・学習記録を安全に移行</button><button class="secondary" onclick="hqSyncNow()">今すぐ同期</button><button class="secondary" onclick="hqSyncDisconnect()">同期を停止</button></div><p id="syncStatus"></p><p id="syncLastSuccess"></p><p id="syncNextRetry" aria-live="polite"></p><div class="row"><button class="secondary" onclick="hqSyncDiagnose()">最新D1状態を読み取る（変更なし）</button></div><section id="hqSyncDiagnosticPanel" class="box" aria-live="polite" hidden><div class="row"><strong id="hqSyncDiagnosticState"></strong><button class="secondary" type="button" onclick="hqSyncDiagnosticClose()">診断結果を閉じる</button></div><p id="hqSyncDiagnosticTime"></p><pre id="hqSyncDiagnostic" role="status" style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:.8rem"></pre></section>${conflicts.length?'<button class="secondary" onclick="hqConflictDownload()">旧方式の競合記録を保存</button>':''}`));status(message||(code()?'同期準備中':'未接続'));appendComparison(app);
  let pending=[];try{pending=operationQueue().operations.filter(operation=>operation.status==='conflict')}catch{}
  for(const item of pending){const panel=document.createElement('section');panel.className='card sync-conflict';const title=document.createElement('h3');title.textContent='同期確認が必要：'+conflictTitle(item);panel.appendChild(title);const reason=document.createElement('p');reason.className='sync-conflict-reason';reason.textContent=item.conflictReason||operationConflictReason(item);panel.appendChild(reason);const comparison=document.createElement('div');comparison.className='sync-conflict-comparison';for(const [label,value] of [['この端末',item.local],['D1（家族の共有記録）',item.server]]){const progressValue=item.type==='state.set'&&(item.payload?.path||[])[0]==='eikenDaily'&&label==='この端末'&&value?.value!==undefined?value.value:value;const block=document.createElement('div');block.className='sync-conflict-side';const strong=document.createElement('strong');strong.textContent=label;block.appendChild(strong);const summary=document.createElement('p');summary.className='sync-conflict-summary';if(item.type==='state.set'&&(item.payload?.path||[])[0]==='eikenDaily')summary.textContent=conflictProgress(progressValue);else if(value?.menu?.title||value?.title)summary.textContent=value.menu?.title||value.title;else summary.textContent=value===null?'該当データなし':'変更内容を保留中';block.appendChild(summary);const details=document.createElement('details');details.className='sync-conflict-details';const labelEl=document.createElement('summary');labelEl.textContent='詳細を表示';details.appendChild(labelEl);const pre=document.createElement('pre');pre.className='sync-conflict-json';pre.textContent=JSON.stringify(value,null,2);details.appendChild(pre);block.appendChild(details);comparison.appendChild(block)}panel.appendChild(comparison);const recommend=document.createElement('p');recommend.className='sync-conflict-recommendation';recommend.textContent=item.type==='state.set'&&(item.payload?.path||[])[0]==='eikenDaily'?'推奨：D1側を採用すると、完了済みの共有記録を守れます。安全な統合ができなかった場合は、この項目を保留したまま他の同期を続けます。':'推奨：両方の内容を確認し、D1側または端末側を選んでください。';panel.appendChild(recommend);const cloud=document.createElement('button');cloud.className='secondary';cloud.textContent='D1側を採用してこの項目を解決';cloud.onclick=()=>hqResolveOperationConflict('cloud',item.id);panel.appendChild(cloud);if(['quest.upsert','quest.delete'].includes(item.type)){const keep=document.createElement('button');keep.className='secondary';keep.textContent='端末側のクエスト変更を適用';keep.onclick=()=>hqResolveOperationConflict('local',item.id);panel.appendChild(keep)}app.appendChild(panel)}updateDiagnosticPanel()};
 window.addEventListener('online',schedule);document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});setInterval(()=>{if(!document.hidden)schedule()},30000);setInterval(updateRetryCountdown,1000);if(code())schedule();
})();
