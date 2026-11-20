// Staging-only integration. Nothing is uploaded until a user enables sync after backup.
'use strict';
(function(){
 const authKey='hq-sync-code-v1', metaKey='hq-sync-meta-v1';
 let busy=false, timer=null, message='', conflicts=[];
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
  const known=new Set(['sessions','answers','matches','settings','abilityBaseline','questData','eikenDaily','rpg']);
  if(Object.keys(state).some(k=>!known.has(k)))return false;
  if(Object.keys(state.settings||{}).some(k=>!['club','exam'].includes(k))||state.settings.club!==true||state.settings.exam!==false)return false;
  if(state.abilityBaseline!==undefined&&state.abilityBaseline!==10)return false;
  if(state.questData&&Object.keys(state.questData).some(k=>!['menus','completions'].includes(k)))return false;
  if(state.eikenDaily&&Object.keys(state.eikenDaily).some(k=>k!=='days'))return false;
  const r=state.rpg||{};if(Object.keys(r).some(k=>!['bonusXP','awards','unlocked','titles','plays','giantWins','settings'].includes(k)))return false;
  if(r.settings&&(r.settings.motion!=='full'||r.settings.sound!==false||r.settings.skip!==false||Object.keys(r.settings).some(k=>!['motion','sound','skip'].includes(k))))return false;
  return !state.sessions.length&&!state.answers.length&&!state.matches.length&&!(state.questData?.menus||[]).length&&!Object.keys(state.questData?.completions||{}).length&&!Object.values(state.eikenDaily?.days||{}).some(day=>Object.keys(day||{}).length)&&!r.bonusXP&&!Object.keys(r.awards||{}).length&&!Object.keys(r.unlocked||{}).filter(k=>k!=='three'||r.unlocked[k]!==true).length&&!Object.keys(r.titles||{}).length&&!(r.plays||[]).length&&!r.giantWins;
 }
 async function req(method,body){const res=await fetch(api()+'/snapshot',{method,headers:{'X-Family-Code':code(),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await res.json();if(!res.ok){const e=Error(data.error||'通信エラー');e.status=res.status;throw e}return data}
 function status(text){message=text;const el=document.getElementById('syncStatus');if(el)el.textContent=text}
 async function sync(){
  if(busy||!code()||!api()||storageBlocked)return;busy=true;
  try{
   status('同期を確認中…');const remote=await req('GET');let meta=readMeta();const local=clone(s), localSig=signature(local);let next;
   if(!meta){
    if(remote.data===null){next=local;}
    else if(empty(local)){next=remote.data;}
    else {status('両方にデータがあります。初回同期を停止しました。両方のバックアップを保管して確認してください。');return;}
   }else if(remote.data===null){status('クラウドが空のため同期を停止しました。端末の記録は保持しています。');return;}
   else {
    const merged=HQMerge.merge(transformed(meta.base),transformed(local),transformed(remote.data));
    if(merged.conflicts.length){conflicts=merged.conflicts;status('同時編集が見つかりました。自動上書きせず、同期を停止しています。');return;}
    next=untransform(merged.value);
   }
   if(!validState(next))throw Error('同期データの形式が不正です');
   let revision=remote.revision;
   if(signature(next)!==signature(remote.data)) {const result=await req('PUT',{revision,data:next});revision=result.revision;}
   // A local edit during the request must not be overwritten.
   if(signature(s)!==localSig){
    const pending=HQMerge.merge(transformed(local),transformed(s),transformed(next));
    if(pending.conflicts.length){conflicts=pending.conflicts;status('同期中の変更が競合したため停止しました。端末の記録は保持しています。');return;}
    const combined=untransform(pending.value);if(!validState(combined))throw Error('同期データの形式が不正です');
    localStorage.setItem(KEY,JSON.stringify(combined));storeMeta({base:next,revision});s=combined;match=s.activeMatch||null;status('端末の新しい変更を再送します');schedule();return;
   }
   // Persist before changing memory; any quota failure leaves the original untouched.
   localStorage.setItem(KEY,JSON.stringify(next));storeMeta({base:next,revision});s=next;match=s.activeMatch||null;conflicts=[];status('同期済み');render();
  }catch(e){status(e.status===409?'同時更新を検出。次回再確認します。':e.status===401?'家族コードを確認してください。':'未同期：端末に保存しています（'+e.message+'）');if(e.status===409)schedule()}
  finally{busy=false}
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(sync,1200)}
 const previousSave=save;save=function(){const ok=previousSave();if(ok&&code())schedule();return ok};
 window.hqSyncEnable=async function(){
  if(!api()){alert('同期サーバーはまだ設定されていません。');return}
  const input=document.getElementById('hqCode').value;if(!/^\d{5}$/.test(input)){alert('数字5桁を入力してください');return}
  if(!document.getElementById('hqBackup').checked){alert('先にバックアップを保存し、確認欄にチェックしてください');return}
  try{localStorage.setItem(authKey,input);await sync()}catch(e){alert('端末に保存できません: '+e.message)}
 };
 window.hqSyncNow=sync;
 window.hqSyncDisconnect=function(){localStorage.removeItem(authKey);status('同期を停止しました。端末の記録は残っています。');render()};
 window.hqConflictDownload=function(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({conflicts,local:s,base:readMeta()?.base},null,2)],{type:'application/json'}));a.download='haruki-sync-conflicts.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
 const prior=render;render=function(){prior();if(tab!=='MANAGE'&&tab!=='PARENT')return;const app=document.getElementById('app');if(!app)return;app.insertAdjacentHTML('beforeend',card(`<h3>親子同期（検証版）</h3><p>先にこの端末の記録をバックアップしてください。</p><button class="secondary" onclick="exportData()">バックアップを保存</button><label><input id="hqBackup" type="checkbox"> バックアップを保存して確認しました</label><label>家族コード <input id="hqCode" inputmode="numeric" maxlength="5" type="password" autocomplete="off"></label><div class="row"><button onclick="hqSyncEnable()">同期を開始</button><button class="secondary" onclick="hqSyncNow()">今すぐ同期</button><button class="secondary" onclick="hqSyncDisconnect()">同期を停止</button></div><p id="syncStatus"></p>${conflicts.length?'<button class="secondary" onclick="hqConflictDownload()">競合内容を保存</button>':''}`));status(message||(code()?'同期準備中':'未接続'))};
 window.addEventListener('online',schedule);document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});setInterval(()=>{if(!document.hidden)schedule()},30000);if(code())schedule();
})();
