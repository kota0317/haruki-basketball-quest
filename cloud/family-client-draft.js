/* HARUKI cloud client. Uses only the publishable project key; authorization is enforced by RLS. */
(() => {
'use strict';
const db = supabase.createClient('https://whgmaavoekefzihhssld.supabase.co','sb_publishable_nlaz1Cyj-WKZep_zlbazCw_xj08Q_M8');
let user=null, device=null, role='', busy=false, timer=null, plans=[], rows=[], links=[], selected='', notice='', invite='', devices=[], parentRequest=localStorage.getItem('hq-parent-request')||'';
const $=id=>document.getElementById(id), safe=x=>esc(String(x??''));
const kinds={sessions:'study_session',answers:'answer',matches:'match'}, keys={study_session:'sessions',answer:'answers',match:'matches'};
const dayOf=x=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(x);
const normalize=x=>Array.isArray(x)?x.map(normalize):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,normalize(x[k])])):x;
const json=x=>JSON.stringify(normalize(x));
function status(x){notice=x;if(tab==='SYNC'||tab==='PARENT')render()}
function stage(input){
 if(!input.cloud?.ownerId)return input;
 let copy=structuredClone(input);copy.cloud.pending=copy.cloud.pending||[];
 let ids=new Set(copy.cloud.pending.map(x=>x.event_id));
 for(const [k,type] of Object.entries(kinds))for(const row of copy[k]){
  if(!row._eventId)row._eventId=crypto.randomUUID();
  if(!row._cloudAcknowledged&&!ids.has(row._eventId)){
   const payload={...row};delete payload._eventId;delete payload._cloudAcknowledged;
   const date=typeof row.time==='number'?new Date(row.time):null;
   let day=row.date||(date&&!isNaN(date)?dayOf(date):null);if(!day)throw Error('日付のない記録があります。バックアップを保持し、同期を中止しました。');
   copy.cloud.pending.push({learner_id:copy.cloud.ownerId,event_id:row._eventId,event_type:type,occurred_at:date?date.toISOString():null,occurred_on:day,schema_version:1,payload});ids.add(row._eventId);
  }
 }
 return copy;
}
function persist(){s=stage(s);localStorage.setItem(KEY,JSON.stringify(s));}
function learner(){return device?.learner_id||null}
function schedule(){if(!user||!learner()||s.cloud?.ownerId!==learner())return;clearTimeout(timer);timer=setTimeout(sync,700)}
async function allEvents(id){let result=[];for(let offset=0;;offset+=500){let {data,error}=await db.from('hq_learning_events').select('*').eq('learner_id',id).order('created_at',{ascending:true}).order('event_id',{ascending:true}).range(offset,offset+499);if(error)throw error;result.push(...data);if(data.length<500)return result;}}
async function sync(){
 if(busy||!user||!learner()||s.cloud?.ownerId!==learner())return;
 if(!navigator.onLine){status('オフライン：記録はこの端末に保持し、復旧後に再送します。');return}
 const principal=user.id, owner=learner(), session=device.session_id;const isCurrent=()=>user?.id===principal&&device?.session_id===session&&learner()===owner&&s.cloud?.ownerId===owner;
 busy=true;let succeeded=false;try{
  persist();
  while(s.cloud.pending.length){
   if(!isCurrent())return;const item=s.cloud.pending[0];let {error}=await db.from('hq_learning_events').insert(item);if(!isCurrent())return;
   if(error){if(error.code!=='23505')throw error;let existing=await db.from('hq_learning_events').select('*').eq('learner_id',item.learner_id).eq('event_id',item.event_id).single();if(!isCurrent())return;if(existing.error)throw existing.error;
    for(const k of ['event_type','occurred_on','schema_version'])if(existing.data[k]!==item[k])throw Error('同じIDに異なる記録があります。自動同期を停止しました。');
    if((existing.data.occurred_at?Date.parse(existing.data.occurred_at):null)!==(item.occurred_at?Date.parse(item.occurred_at):null))throw Error('同じIDに異なる日時があります。自動同期を停止しました。');
    if(json(existing.data.payload)!==json(item.payload))throw Error('同じIDに異なる内容があります。自動同期を停止しました。');
   }
   for(const key of Object.keys(kinds))for(const row of s[key])if(row._eventId===item.event_id)row._cloudAcknowledged=true;
   s.cloud.pending=s.cloud.pending.filter(x=>x.event_id!==item.event_id);persist();
  }
  const cloudRows=await allEvents(owner);if(!isCurrent())return;
  const ids=new Set(Object.keys(kinds).flatMap(k=>s[k].map(x=>x._eventId).filter(Boolean)));
  for(const e of cloudRows){const k=keys[e.event_type];if(k&&!ids.has(e.event_id)){s[k].push({...e.payload,_eventId:e.event_id,_cloudAcknowledged:true});ids.add(e.event_id)}}
  s.answers.sort((a,b)=>(a.time||0)-(b.time||0));persist();await refreshPlans(owner);if(!isCurrent())return;
  if(window.HQQuestEvents){if(!s.questData)s.questData={menus:[],completions:{}};await window.HQQuestEvents.sync(()=>s.questData,db,owner,isCurrent,()=>localStorage.setItem(KEY,JSON.stringify(s)),()=>crypto.randomUUID());if(!isCurrent())return;}
  succeeded=true;s.cloud.lastSyncedAt=new Date().toISOString();localStorage.setItem(KEY,JSON.stringify(s));status('同期済み：'+new Date().toLocaleTimeString('ja-JP')); if(['HOME','RECORD','PLAYER','QUEST'].includes(tab)||(tab==='MANAGE'&&!document.getElementById('quest-form')?.children.length))render();
 }catch(e){status('同期できません。端末に記録を保持しています：'+(e.message||'通信エラー'))}
 finally{busy=false;if(succeeded&&(s.cloud?.pending?.length||s.questData?.ops?.some(x=>!x.acked)))schedule()}
}
async function refreshPlans(id){let session=user?.id,mode=role;let r=await db.from('hq_study_plans').select('*').eq('learner_id',id).order('title');if(r.error)throw r.error;if(!user||user.id!==session||role!==mode)return;plans=r.data; if(s.cloud?.ownerId===id){s.cloud.plans=plans;localStorage.setItem(KEY,JSON.stringify(s))}}
function targets(kind){const p=(s.cloud?.plans||[]).filter(x=>x.active&&x.subject===kind);return p.length?p.reduce((n,x)=>n+x.target_minutes,0):null}
function categories(){let p=(s.cloud?.plans||[]).filter(x=>x.active&&x.subject==='英検');if(!p.length||p.some(x=>x.question_category==='すべて'))return null;return [...new Set(p.map(x=>x.question_category))]}
function planSummary(){let p=(s.cloud?.plans||[]).filter(x=>x.active);return p.length?card('<h3>保護者と決めた学習メニュー</h3>'+p.map(x=>`<p>${safe(x.subject)}：${safe(x.title)} ${Number(x.target_minutes)}分（${safe(x.question_category)}）</p>`).join('')):''}
async function upsertPlan(id){if(!user||!learner())return;let title=$('plan-title').value.trim(),subject=$('plan-subject').value,minutes=Number($('plan-minutes').value),question_category=$('plan-category').value;if(!title||!Number.isInteger(minutes)||minutes<1||minutes>300){status('メニュー名と1〜300分の目標を入力してください。');return}let row={learner_id:selected,plan_id:id||crypto.randomUUID(),title,subject,target_minutes:minutes,question_category,active:true,updated_at:new Date().toISOString()};let r=id?await db.from('hq_study_plans').update(row).eq('learner_id',selected).eq('plan_id',id):await db.from('hq_study_plans').insert(row);if(r.error){status('保存に失敗しました：'+r.error.message);return}await refreshPlans(selected);render()}
async function disablePlan(id){if(!confirm('このメニューを終了しますか？'))return;let r=await db.from('hq_study_plans').update({active:false,updated_at:new Date().toISOString()}).eq('learner_id',selected).eq('plan_id',id);if(r.error){status('変更できません：'+r.error.message);return}await refreshPlans(selected);render()}
function editPlan(id){let p=plans.find(x=>x.plan_id===id);if(!p)return;$('plan-title').value=p.title;$('plan-subject').value=p.subject;$('plan-minutes').value=p.target_minutes;$('plan-category').value=p.question_category;$('plan-save').dataset.id=id;window.scrollTo(0,0)}
function dashboard(){let days=new Map(),topics=new Map(),last=new Map(),reviews=0,matches=0;let type=new Map(questions.map(q=>[q.id,q.type]));for(const e of rows){let p=e.payload||{};if(e.event_type==='study_session'){let n=Number(p.minutes)||0;days.set(e.occurred_on,(days.get(e.occurred_on)||0)+n)}if(e.event_type==='answer'){if(p.first){let k=type.get(p.id)||'その他',v=topics.get(k)||[0,0];v[1]++;v[0]+=p.correct?1:0;topics.set(k,v)}else reviews++;if(!last.has(p.id)||(p.time||0)>(last.get(p.id).time||0))last.set(p.id,p)}if(e.event_type==='match')matches++}let due=[...last.values()].filter(x=>x.due&&x.due<=today()).length, recentReviews=rows.filter(e=>e.event_type==='answer'&&!e.payload?.first).slice(-10).reverse(), recentMatches=rows.filter(e=>e.event_type==='match').slice(-10).reverse(), date=new Date(today()+'T00:00:00Z'),streak=0;while(days.has(date.toISOString().slice(0,10))&&days.get(date.toISOString().slice(0,10))>0){streak++;date.setUTCDate(date.getUTCDate()-1)}return `<h3>学習状況</h3><p>連続学習 ${streak} 日／復習 ${reviews} 回／復習期限 ${due} 問／試合 ${matches} 回</p><p>模試成績：模試機能は未実装</p><p>分野別・初見正答：${[...topics].map(([k,v])=>`${safe(k)} ${v[0]}/${v[1]} (${Math.round(v[0]*100/v[1])}%)`).join('　')||'記録なし'}</p><h3>直近の復習</h3>${recentReviews.map(e=>`<p>${safe(e.occurred_on)} ${safe(type.get(e.payload.id)||'その他')}：${e.payload.correct?'正解':'不正解'}</p>`).join('')||'<p>記録なし</p>'}<h3>直近の試合</h3>${recentMatches.map(e=>`<p>${safe(e.occurred_on)} ${safe(e.payload.opponent||'練習')} ${Array.isArray(e.payload.score)?e.payload.score.map(Number).join(' − '):''} ${e.payload.full?(e.payload.won?'勝ち':'勝利以外'):''}</p>`).join('')||'<p>記録なし</p>'}<h3>日別学習時間</h3>${[...days].sort(([a],[b])=>b.localeCompare(a)).slice(0,30).map(([d,n])=>`<p>${safe(d)}：${n}分</p>`).join('')||'<p>記録なし</p>'}`}
function planEditor(){return `<h3>学習メニュー・目標</h3><label>メニュー名 <input id="plan-title" maxlength="120"></label><label>科目 <select id="plan-subject"><option>英検</option><option>学校</option></select></label><label>目標時間 <input id="plan-minutes" type="number" min="1" max="300" value="15"> 分</label><label>問題分野 <select id="plan-category"><option>すべて</option><option>単語</option><option>文法</option><option>読解</option></select></label><button id="plan-save" data-id="" onclick="HQCloud.upsertPlan(this.dataset.id)">メニューを保存</button>${plans.filter(x=>x.active).map(p=>`<div class="box"><strong>${safe(p.title)}</strong> ${safe(p.subject)} ${p.target_minutes}分・${safe(p.question_category)} <button class="secondary" onclick="HQCloud.editPlan('${p.plan_id}')">編集</button> <button class="secondary" onclick="HQCloud.disablePlan('${p.plan_id}')">削除</button></div>`).join('')}`}
async function ensureUser(){if(user)return;let x=await db.auth.getSession();if(x.error)throw x.error;user=x.data.session?.user||null;if(!user){let y=await db.auth.signInAnonymously();if(y.error)throw y.error;user=y.data.user}if(!user?.is_anonymous)throw Error('匿名セッションが必要です')}
function makeCode(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('')}
async function bind(id){if(s.cloud?.ownerId&&s.cloud.ownerId!==id)throw Error('既存の同期先が別の学習者です。バックアップを保管し、移行を中止しました。');if(!s.cloud){localStorage.setItem(KEY+'-before-cloud',JSON.stringify(s));s.cloud={ownerId:id,pending:[]}}selected=id;device={learner_id:id,session_id:user.id};role='child';persist();await sync()}
async function create(){try{await ensureUser();let token=makeCode(),r=await db.rpc('hq_family_create',{p_token:token});if(r.error)throw r.error;invite=token;await bind(r.data);status('登録コードをもう一台に入力してください。15分間有効・一度限りです。')}catch(e){status('登録できません：'+e.message)}}
async function issue(){try{if(!device)throw Error('この端末の登録が必要です');let token=makeCode(),r=await db.rpc('hq_family_invite',{p_token:token});if(r.error)throw r.error;invite=token;status('新しい登録コードを作成しました。15分以内にもう一台へ入力してください。')}catch(e){status('コードを作成できません：'+e.message)}}
async function join(){try{let token=$('family-token').value.trim().toLowerCase();if(!/^[a-f0-9]{64}$/.test(token))throw Error('登録コードを確認してください');await ensureUser();let r=await db.rpc('hq_family_join',{p_token:token});if(r.error)throw r.error;await bind(r.data);status('家族の端末を登録しました。');go('HOME')}catch(e){status('登録できません：'+e.message)}}
async function copyInvite(){try{await navigator.clipboard.writeText(invite);status('コードをコピーしました。もう一台へ安全に渡してください。')}catch{status('コードを長押ししてコピーしてください。')}}
async function resume(){let r=await db.auth.getSession();if(r.error)throw r.error;user=r.data.session?.user||null;if(!user)return;let x=await db.rpc('hq_family_learner');if(x.error)throw x.error;if(x.data){if(s.cloud?.ownerId&&s.cloud.ownerId!==x.data)throw Error('既存の同期先が別の学習者です');await bind(x.data)}if(tab==='SYNC'||tab==='PARENT')render()}
function screen(){let h=`<h2>家族の同期設定</h2><p>${safe(notice)}</p><button class="secondary" onclick="exportData()">端末内記録をバックアップ</button>`;if(!device)h+=`<p>最初の端末で家族を作成し、もう一台で登録コードを入力します。</p><button onclick="HQCloud.create()">この端末で家族を作成</button><label>家族の登録コード <input id="family-token" autocomplete="off"></label><button onclick="HQCloud.join()">コードで参加</button>`;else h+=`<p>この端末は家族に登録済みです。</p><button onclick="HQCloud.issue()">もう一台用のコードを作成</button> <button class="secondary" onclick="HQCloud.sync()">今すぐ同期</button>${invite?`<p>15分以内にもう一台で入力してください。</p><code style="overflow-wrap:anywhere">${safe(invite)}</code><p><button onclick="HQCloud.copyInvite()">コードをコピー</button></p>`:''}${planEditor()}`;return card(h)}
function info(){return {bound:!!(user&&learner()&&s.cloud?.ownerId===learner()),online:navigator.onLine,lastSyncedAt:s.cloud?.lastSyncedAt||null,pending:(s.cloud?.pending?.length||0)+(s.questData?.ops?.filter(x=>!x.acked).length||0),notice}}
window.HQCloud={screen,stage,schedule,sync,create,issue,join,copyInvite,info,upsertPlan,disablePlan,editPlan,targets,categories,planSummary};
resume().catch(e=>status('端末の確認ができません：'+e.message));db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){user=null;device=null}else if(session?.user)user=session.user});
async function reconnect(){if(!navigator.onLine)return;try{if(!device)await resume();else await sync()}catch(e){status('同期できません：'+e.message)}}
window.addEventListener('online',reconnect);document.addEventListener('visibilitychange',()=>{if(!document.hidden)reconnect()});setInterval(()=>{if(!document.hidden)reconnect()},60000);
})();
