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
  if(busy||conflictContext||initialDiff||!code()||!api()||storageBlocked)return;busy=true;
  try{
   status('同期を確認中…');const remote=await req('GET');let meta=readMeta();const local=clone(s), localSig=signature(local);let next;
   if(!meta){
    if(remote.data===null){next=local;}
    else if(empty(local)){next=remote.data;}
    else {initialDiff={local,remote:clone(remote.data),revision:remote.revision,localSig,plan:HQMerge.initial(transformed(local),transformed(remote.data))};status('両方にデータがあります。内容を比較してください。初回同期は停止中です。');render();return;}
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
 window.hqSyncDisconnect=function(){localStorage.removeItem(authKey);initialDiff=null;conflictContext=null;conflicts=[];status('同期を停止しました。端末の記録は残っています。');render()};
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
   if(latest.revision!==ctx.revision||signature(latest.data)!==signature(ctx.remote)){initialDiff=null;status('相手の記録が変わりました。比較し直します。');return}
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
   const saved=await req('PUT',{revision:latest.revision,data:joined});
   if(signature(s)!==ctx.localSig){initialDiff=null;status('同期中に端末の記録が変わりました。比較し直します。');return}
   localStorage.setItem(KEY,JSON.stringify(joined));storeMeta({base:joined,revision:saved.revision});s=joined;match=s.activeMatch||null;initialDiff=null;status('両方のメニューを残して同期しました');render();
  }catch(e){if(e.status===409){initialDiff=null;status('相手の記録が変わりました。比較し直します。')}else status('統合できませんでした。両方の記録は保持されています（'+e.message+'）')}
  finally{busy=false;if(!initialDiff&&message.includes('比較し直します'))schedule()}
 };
 function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);if(cls)node.className=cls;return node}
 function menuDetails(m){if(!m)return '記録なし';return [m.title||'名称なし',m.subject||'科目未設定',(Number(m.minutes)||0)+'分',(Number(m.xp)||0)+' XP',m.date||'',m.repeat==='daily'?'毎日':m.repeat==='weekly'?'毎週':'',m.deleted?'削除済み':'',m.note||''].filter(Boolean).join(' ・ ')}
 function readable(v){if(v===undefined)return '記録なし';if(v===null)return 'なし';if(typeof v!=='object')return typeof v==='boolean'?(v?'あり':'なし'):String(v);if(Array.isArray(v))return v.length?v.map(x=>readable(x)).join('／'):'記録なし';if('title' in v)return menuDetails(v);const labels={xp:'XP',minutes:'学習時間',date:'日付',subject:'科目',title:'メニュー',bonusXP:'追加 XP',giantWins:'勝利数',won:'勝敗',kind:'種類',note:'内容',repeat:'繰り返し'};const parts=Object.entries(v).filter(([k])=>k!=='id').slice(0,12).map(([k,x])=>(labels[k]||'記録')+'：'+readable(x));return parts.join(' ・ ')||'記録なし'}
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
   for(const [key,label] of [['local','この端末'],['remote','相手の端末']]){const button=el('button',label+'のバックアップを保存');button.type='button';button.className='secondary';button.onclick=()=>window.hqInitialBackup(key);section.appendChild(button);const wrap=el('label'),check=el('input');check.type='checkbox';check.id=key==='local'?'hqInitialLocalBackup':'hqInitialRemoteBackup';wrap.appendChild(check);wrap.appendChild(document.createTextNode(label+'のバックアップを保存して確認しました'));section.appendChild(wrap)}
   const join=el('button','両方のメニューを残して同期する');join.type='button';join.disabled=!!ctx.plan.hardErrors?.length;join.onclick=window.hqInitialMerge;section.appendChild(join);
  }else{
   conflicts.forEach((row,i)=>{const field=el('fieldset');field.appendChild(el('legend','変更内容を比較'));for(const [key,label] of [['local','この端末'],['remote','相手の端末']]){const wrap=el('label'),radio=el('input');radio.type='radio';radio.name='hq-conflict-'+i;radio.value=key;wrap.appendChild(radio);wrap.appendChild(document.createTextNode(label+'：'+(row[key].exists?readable(row[key].value):'（削除）')));field.appendChild(wrap)}section.appendChild(field)});
   const button=el('button','選んだ内容で同期');button.type='button';button.onclick=window.hqResolveConflicts;section.appendChild(button);
  }
  app.appendChild(section);
 }

 window.hqConflictDownload=function(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({conflicts,local:s,base:readMeta()?.base},null,2)],{type:'application/json'}));a.download='haruki-sync-conflicts.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
 const prior=render;render=function(){prior();if(tab!=='MANAGE'&&tab!=='PARENT')return;const app=document.getElementById('app');if(!app)return;app.insertAdjacentHTML('beforeend',card(`<h3>親子同期（検証版）</h3><p>先にこの端末の記録をバックアップしてください。</p><button class="secondary" onclick="exportData()">バックアップを保存</button><label><input id="hqBackup" type="checkbox"> バックアップを保存して確認しました</label><label>家族コード <input id="hqCode" inputmode="numeric" maxlength="5" type="password" autocomplete="off"></label><div class="row"><button onclick="hqSyncEnable()">同期を開始</button><button class="secondary" onclick="hqSyncNow()">今すぐ同期</button><button class="secondary" onclick="hqSyncDisconnect()">同期を停止</button></div><p id="syncStatus"></p>${conflicts.length?'<button class="secondary" onclick="hqConflictDownload()">競合内容を保存</button>':''}`));status(message||(code()?'同期準備中':'未接続'));appendComparison(app)};
 window.addEventListener('online',schedule);document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});setInterval(()=>{if(!document.hidden)schedule()},30000);if(code())schedule();
})();
