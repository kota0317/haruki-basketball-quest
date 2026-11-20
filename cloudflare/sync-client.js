// Staging-only integration. Nothing is uploaded until a user enables sync after backup.
'use strict';
(function(){
 const authKey='hq-sync-code-v1', metaKey='hq-sync-meta-v1';
 let busy=false, timer=null, message='', conflicts=[], conflictContext=null, initialDiff=null;
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
  if(busy||conflictContext||!code()||!api()||storageBlocked)return;busy=true;
  try{
   status('同期を確認中…');const remote=await req('GET');let meta=readMeta();const local=clone(s), localSig=signature(local);let next;
   if(!meta){
    if(remote.data===null){next=local;}
    else if(empty(local)){next=remote.data;}
    else {initialDiff={local,remote:remote.data};status('両方にデータがあります。内容を比較してください。初回同期は停止中です。');render();return;}
   }else if(remote.data===null){status('クラウドが空のため同期を停止しました。端末の記録は保持しています。');return;}
   else {
    const merged=HQMerge.merge(transformed(meta.base),transformed(local),transformed(remote.data));
    if(merged.conflicts.length){conflicts=merged.conflicts;conflictContext={local,remote:clone(remote.data),revision:remote.revision,preview:merged.value,localSig};status('同時編集が見つかりました。内容を選択してください。');render();return;}
    next=untransform(merged.value);
   }
   if(!validState(next))throw Error('同期データの形式が不正です');
   let revision=remote.revision;
   if(signature(next)!==signature(remote.data)) {const result=await req('PUT',{revision,data:next});revision=result.revision;}
   // A local edit during the request must not be overwritten.
   if(signature(s)!==localSig){
    const pending=HQMerge.merge(transformed(local),transformed(s),transformed(next));
    if(pending.conflicts.length){conflicts=pending.conflicts;conflictContext=null;status('同期中の変更が競合しました。再確認してください。');schedule();return;}
    const combined=untransform(pending.value);if(!validState(combined))throw Error('同期データの形式が不正です');
    localStorage.setItem(KEY,JSON.stringify(combined));storeMeta({base:next,revision});s=combined;match=s.activeMatch||null;status('端末の新しい変更を再送します');schedule();return;
   }
   // Persist before changing memory; any quota failure leaves the original untouched.
   localStorage.setItem(KEY,JSON.stringify(next));storeMeta({base:next,revision});s=next;match=s.activeMatch||null;conflicts=[];conflictContext=null;initialDiff=null;status('同期済み');render();
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
 // Resolve only an exact, still-current snapshot; a stale selection never overwrites newer edits.
 window.hqResolveConflicts=async function(){
  if(busy||!conflictContext)return;
  const choices=conflicts.map((_,i)=>document.querySelector('input[name="hq-conflict-'+i+'"]:checked')?.value);
  if(choices.some(x=>x!=='local'&&x!=='remote')){alert('すべての項目で採用する内容を選んでください');return}
  const ctx=conflictContext;
  if(signature(s)!==ctx.localSig){status('選択中に端末の記録が変わりました。内容を再確認してください。');conflictContext=null;conflicts=[];await sync();return}
  busy=true;
  try{
   const remote=await req('GET');
   if(remote.revision!==ctx.revision||signature(remote.data)!==signature(ctx.remote)){status('相手の変更が更新されました。再確認してください。');conflictContext=null;conflicts=[];return}
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
   const result=await req('PUT',{revision:remote.revision,data:resolved});
   if(signature(s)!==ctx.localSig){conflictContext=null;conflicts=[];status('同期中に端末の記録が変わりました。再確認します。');schedule();return}
   localStorage.setItem(KEY,JSON.stringify(resolved));storeMeta({base:resolved,revision:result.revision});s=resolved;match=s.activeMatch||null;conflictContext=null;conflicts=[];status('競合を解決して同期しました');render();
  }catch(e){status(e.status===409?'相手の変更が更新されました。再確認してください。':'解決できませんでした。両方の記録は保持されています（'+e.message+'）')}
  finally{busy=false;if(!conflictContext&&conflicts.length===0&&message.includes('再確認'))schedule()}
 };
 function appendComparison(app){
  if(!conflictContext&&!initialDiff)return;
  const section=document.createElement('section');section.className='card';
  const heading=document.createElement('h3');heading.textContent=initialDiff?'初回同期の内容を比較':'同時編集の確認';section.appendChild(heading);
  const note=document.createElement('p');note.textContent=initialDiff?'両方に記録があります。自動上書きしません。両端末のバックアップを保存してから確認してください。':'この端末と相手の端末の内容を比較し、各項目で採用する方を選んでください。';section.appendChild(note);
  if(initialDiff){
   const labels={questData:'学習メニューと完了履歴',sessions:'学習時間',answers:'学習回答',eikenDaily:'英検進捗',rpg:'ゲーム・XP',matches:'試合履歴',settings:'設定',learningEvents:'学習履歴'};const lists=[...new Set([...Object.keys(initialDiff.local),...Object.keys(initialDiff.remote)])].sort().map(k=>[labels[k]||k,x=>Object.hasOwn(x,k)?x[k]:{missing:true}]);
   for(const [name,get] of lists){const left=get(initialDiff.local),right=get(initialDiff.remote);if(signature(left)===signature(right))continue;const title=document.createElement('h4');title.textContent=name;section.appendChild(title);for(const [label,value] of [['この端末',left],['相手の端末',right]]){const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:14em;overflow:auto';pre.textContent=label+'：\n'+JSON.stringify(value,null,2);section.appendChild(pre)}}
  }else{
   conflicts.forEach((row,i)=>{const field=document.createElement('fieldset');const legend=document.createElement('legend');legend.textContent='項目：'+(row.path.join(' › ')||'全体');field.appendChild(legend);for(const [key,label] of [['local','この端末（親またはハルキ）'],['remote','相手の端末（ハルキまたは親）']]){const wrap=document.createElement('label'),radio=document.createElement('input');radio.type='radio';radio.name='hq-conflict-'+i;radio.value=key;wrap.appendChild(radio);wrap.appendChild(document.createTextNode(label));const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:12em;overflow:auto';pre.textContent=row[key].exists?JSON.stringify(row[key].value,null,2):'（削除）';wrap.appendChild(pre);field.appendChild(wrap)}section.appendChild(field)});
   const button=document.createElement('button');button.type='button';button.textContent='選んだ内容で同期';button.onclick=window.hqResolveConflicts;section.appendChild(button);
  }
  app.appendChild(section);
 }
 window.hqConflictDownload=function(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({conflicts,local:s,base:readMeta()?.base},null,2)],{type:'application/json'}));a.download='haruki-sync-conflicts.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
 const prior=render;render=function(){prior();if(tab!=='MANAGE'&&tab!=='PARENT')return;const app=document.getElementById('app');if(!app)return;app.insertAdjacentHTML('beforeend',card(`<h3>親子同期（検証版）</h3><p>先にこの端末の記録をバックアップしてください。</p><button class="secondary" onclick="exportData()">バックアップを保存</button><label><input id="hqBackup" type="checkbox"> バックアップを保存して確認しました</label><label>家族コード <input id="hqCode" inputmode="numeric" maxlength="5" type="password" autocomplete="off"></label><div class="row"><button onclick="hqSyncEnable()">同期を開始</button><button class="secondary" onclick="hqSyncNow()">今すぐ同期</button><button class="secondary" onclick="hqSyncDisconnect()">同期を停止</button></div><p id="syncStatus"></p>${conflicts.length?'<button class="secondary" onclick="hqConflictDownload()">競合内容を保存</button>':''}`));status(message||(code()?'同期準備中':'未接続'));appendComparison(app)};
 window.addEventListener('online',schedule);document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});setInterval(()=>{if(!document.hidden)schedule()},30000);if(code())schedule();
})();
