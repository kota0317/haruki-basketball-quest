/* HARUKI cloud client. Uses only the publishable project key; authorization is enforced by RLS. */
(() => {
'use strict';
const db = supabase.createClient('https://whgmaavoekefzihhssld.supabase.co','sb_publishable_nlaz1Cyj-WKZep_zlbazCw_xj08Q_M8');
let user=null, role=localStorage.getItem('hq-cloud-role')||'', busy=false, timer=null, plans=[], rows=[], links=[], selected='', notice='', invite='';
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
function schedule(){if(!user||role!=='child'||s.cloud?.ownerId!==user.id)return;clearTimeout(timer);timer=setTimeout(sync,700)}
async function allEvents(id){let result=[];for(let offset=0;;offset+=500){let {data,error}=await db.from('hq_learning_events').select('*').eq('learner_id',id).order('created_at',{ascending:true}).order('event_id',{ascending:true}).range(offset,offset+499);if(error)throw error;result.push(...data);if(data.length<500)return result;}}
async function sync(){
 if(busy||!user||role!=='child'||s.cloud?.ownerId!==user.id)return;
 if(!navigator.onLine){status('オフライン：記録はこの端末に保持し、復旧後に再送します。');return}
 const owner=user.id;const isCurrent=()=>user?.id===owner&&role==='child'&&s.cloud?.ownerId===owner;
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
  succeeded=true;status('同期済み：'+new Date().toLocaleTimeString('ja-JP'));
 }catch(e){status('同期できません。端末に記録を保持しています：'+(e.message||'通信エラー'))}
 finally{busy=false;if(succeeded&&s.cloud?.pending?.length)schedule()}
}
async function refreshPlans(id){let session=user?.id,mode=role;let r=await db.from('hq_study_plans').select('*').eq('learner_id',id).order('title');if(r.error)throw r.error;if(!user||user.id!==session||role!==mode)return;plans=r.data; if(role==='child'&&s.cloud?.ownerId===id){s.cloud.plans=plans;localStorage.setItem(KEY,JSON.stringify(s))}}
function targets(kind){const p=(s.cloud?.plans||[]).filter(x=>x.active&&x.subject===kind);return p.length?p.reduce((n,x)=>n+x.target_minutes,0):null}
function categories(){let p=(s.cloud?.plans||[]).filter(x=>x.active&&x.subject==='英検');if(!p.length||p.some(x=>x.question_category==='すべて'))return null;return [...new Set(p.map(x=>x.question_category))]}
function planSummary(){let p=(s.cloud?.plans||[]).filter(x=>x.active);return p.length?card('<h3>保護者と決めた学習メニュー</h3>'+p.map(x=>`<p>${safe(x.subject)}：${safe(x.title)} ${Number(x.target_minutes)}分（${safe(x.question_category)}）</p>`).join('')):''}
async function account(mode){let email=$('hq-email').value.trim(),password=$('hq-password').value;if(!email||password.length<6){status('メールアドレスと6文字以上のパスワードを入力してください。');return}try{let r=mode==='signup'?await db.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}}):await db.auth.signInWithPassword({email,password});$('hq-password').value='';if(r.error)throw r.error;if(mode==='signup'&&!r.data.session){status('確認メールを送信しました。メールの案内を完了後、ログインしてください。');return}user=r.data.user;status('ログインしました。利用者を選択してください。')}catch(e){status('認証に失敗しました：'+e.message)}}
async function setRole(r){if(!user)return;role=r;localStorage.setItem('hq-cloud-role',r);plans=[];rows=[];links=[];selected='';invite='';if(r==='parent')await parentRefresh();else{if(s.cloud?.ownerId===user.id){try{await sync()}catch(e){status(e.message)}}status(s.cloud?.ownerId===user.id?'ハルキの同期を利用中です。':'ハルキとしてログイン中。下の移行操作で、この端末の記録を紐付けます。')}render()}
async function bind(){if(!user||role!=='child')return;if(s.cloud?.ownerId&&s.cloud.ownerId!==user.id){status('この端末の記録は別のアカウントに紐付いています。バックアップを保持して管理者に確認してください。');return}if(!confirm('この端末の学習記録を、今ログインしているハルキのアカウントに紐付けて同期します。既存記録は端末にも残ります。よろしいですか？'))return;try{if(!s.cloud){localStorage.setItem(KEY+'-before-cloud',JSON.stringify(s));s.cloud={ownerId:user.id,pending:[]}}persist();await sync()}catch(e){status('移行できません：'+e.message)}}
async function parentRefresh(){if(!user||role!=='parent')return;let parent=user.id;try{let l=await db.from('hq_parent_links').select('learner_id').eq('parent_id',parent);if(user?.id!==parent||role!=='parent')return;if(l.error)throw l.error;links=l.data;if(!links.some(x=>x.learner_id===selected))selected=links[0]?.learner_id||'';if(selected){let result=await allEvents(selected);if(user?.id!==parent||role!=='parent')return;rows=result;await refreshPlans(selected);if(user?.id!==parent||role!=='parent')return}else{rows=[];plans=[]}status(selected?'保護者データを更新しました。':'まだハルキと紐付いていません。招待コードを作成してください。')}catch(e){status('読み込みに失敗しました：'+e.message)}}
async function makeInvite(){if(!user||role!=='parent')return;const bytes=crypto.getRandomValues(new Uint8Array(32));let code=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');let r=await db.rpc('hq_create_invite',{p_token:code});if(r.error){status('招待コードを作成できません：'+r.error.message);return}invite=code;status('15分間有効・1回限りのコードです。ハルキ本人へ安全に渡してください。')}
async function accept(){if(!user||role!=='child')return;let code=$('hq-invite').value.trim().toLowerCase();let r=await db.rpc('hq_accept_invite',{p_token:code});$('hq-invite').value='';if(r.error){status('紐付けに失敗しました。コードと期限を確認してください。');return}status('保護者との紐付けを完了しました。')}
async function upsertPlan(id){if(!user||role!=='parent'||!selected)return;let title=$('plan-title').value.trim(),subject=$('plan-subject').value,minutes=Number($('plan-minutes').value),question_category=$('plan-category').value;if(!title||!Number.isInteger(minutes)||minutes<1||minutes>300){status('メニュー名と1〜300分の目標を入力してください。');return}let row={learner_id:selected,plan_id:id||crypto.randomUUID(),title,subject,target_minutes:minutes,question_category,active:true,updated_at:new Date().toISOString()};let r=id?await db.from('hq_study_plans').update(row).eq('learner_id',selected).eq('plan_id',id):await db.from('hq_study_plans').insert(row);if(r.error){status('保存に失敗しました：'+r.error.message);return}await parentRefresh()}
async function disablePlan(id){if(!confirm('このメニューを終了しますか？'))return;let r=await db.from('hq_study_plans').update({active:false,updated_at:new Date().toISOString()}).eq('learner_id',selected).eq('plan_id',id);if(r.error){status('変更できません：'+r.error.message);return}await parentRefresh()}
function editPlan(id){let p=plans.find(x=>x.plan_id===id);if(!p)return;$('plan-title').value=p.title;$('plan-subject').value=p.subject;$('plan-minutes').value=p.target_minutes;$('plan-category').value=p.question_category;$('plan-save').dataset.id=id;window.scrollTo(0,0)}
function dashboard(){let days=new Map(),topics=new Map(),last=new Map(),reviews=0,matches=0;let type=new Map(questions.map(q=>[q.id,q.type]));for(const e of rows){let p=e.payload||{};if(e.event_type==='study_session'){let n=Number(p.minutes)||0;days.set(e.occurred_on,(days.get(e.occurred_on)||0)+n)}if(e.event_type==='answer'){if(p.first){let k=type.get(p.id)||'その他',v=topics.get(k)||[0,0];v[1]++;v[0]+=p.correct?1:0;topics.set(k,v)}else reviews++;if(!last.has(p.id)||(p.time||0)>(last.get(p.id).time||0))last.set(p.id,p)}if(e.event_type==='match')matches++}let due=[...last.values()].filter(x=>x.due&&x.due<=today()).length, recentReviews=rows.filter(e=>e.event_type==='answer'&&!e.payload?.first).slice(-10).reverse(), recentMatches=rows.filter(e=>e.event_type==='match').slice(-10).reverse(), date=new Date(today()+'T00:00:00Z'),streak=0;while(days.has(date.toISOString().slice(0,10))&&days.get(date.toISOString().slice(0,10))>0){streak++;date.setUTCDate(date.getUTCDate()-1)}return `<h3>学習状況</h3><p>連続学習 ${streak} 日／復習 ${reviews} 回／復習期限 ${due} 問／試合 ${matches} 回</p><p>模試成績：模試機能は未実装</p><p>分野別・初見正答：${[...topics].map(([k,v])=>`${safe(k)} ${v[0]}/${v[1]} (${Math.round(v[0]*100/v[1])}%)`).join('　')||'記録なし'}</p><h3>直近の復習</h3>${recentReviews.map(e=>`<p>${safe(e.occurred_on)} ${safe(type.get(e.payload.id)||'その他')}：${e.payload.correct?'正解':'不正解'}</p>`).join('')||'<p>記録なし</p>'}<h3>直近の試合</h3>${recentMatches.map(e=>`<p>${safe(e.occurred_on)} ${safe(e.payload.opponent||'練習')} ${Array.isArray(e.payload.score)?e.payload.score.map(Number).join(' − '):''} ${e.payload.full?(e.payload.won?'勝ち':'勝利以外'):''}</p>`).join('')||'<p>記録なし</p>'}<h3>日別学習時間</h3>${[...days].sort(([a],[b])=>b.localeCompare(a)).slice(0,30).map(([d,n])=>`<p>${safe(d)}：${n}分</p>`).join('')||'<p>記録なし</p>'}`}
function screen(){let h=`<h2>親子のクラウド同期</h2><p class="muted">${safe(notice)}</p><button class="secondary" onclick="exportData()">端末内記録をバックアップ</button>`;if(!user)return card(h+`<p>親子は別々のメールアドレスで登録・ログインします。</p><label>メール <input id="hq-email" type="email" autocomplete="email"></label><label>パスワード <input id="hq-password" type="password" autocomplete="current-password"></label><div class="row"><button onclick="HQCloud.account('login')">ログイン</button><button class="secondary" onclick="HQCloud.account('signup')">新規登録</button></div><p class="muted">登録時は確認メールの操作が必要です。メールが届かない場合は送信設定の確認が必要です。</p>`);
 h+=`<p>ログイン中：${safe(user.email)}</p><div class="row"><button onclick="HQCloud.setRole('child')">ハルキとして利用</button><button class="secondary" onclick="HQCloud.setRole('parent')">保護者として利用</button><button class="secondary" onclick="HQCloud.logout()">ログアウト</button></div>`;
 if(role==='child')h+=`<p>ハルキ：${s.cloud?.ownerId===user.id?'この端末の記録は同期対象':'この端末はまだ同期対象ではありません'}</p><button onclick="HQCloud.bind()">この端末の記録を紐付けて同期</button> <button class="secondary" onclick="HQCloud.sync()">今すぐ同期</button><label>保護者の招待コード <input id="hq-invite" autocomplete="off"></label><button class="secondary" onclick="HQCloud.accept()">保護者と紐付け</button><p class="muted">旧形式のバックアップを別端末に繰り返し復元すると重複する場合があります。</p>`;
 if(role==='parent'){h+=`<p><button onclick="HQCloud.makeInvite()">招待コードを作成</button> <button class="secondary" onclick="HQCloud.parentRefresh()">最新情報に更新</button></p>${invite?`<p>15分以内にハルキの画面へ入力：<br><code style="overflow-wrap:anywhere">${safe(invite)}</code></p>`:''}`;
 if(selected)h+=`<label>学習者 <select onchange="HQCloud.selectLearner(this.value)">${links.map((x,i)=>`<option value="${safe(x.learner_id)}" ${selected===x.learner_id?'selected':''}>学習者 ${i+1}</option>`).join('')}</select></label><h3>学習メニュー・目標</h3><label>メニュー名 <input id="plan-title" maxlength="120"></label><label>科目 <select id="plan-subject"><option>英検</option><option>学校</option></select></label><label>目標時間 <input id="plan-minutes" type="number" min="1" max="300" value="15"> 分</label><label>問題分野 <select id="plan-category"><option>すべて</option><option>単語</option><option>文法</option><option>読解</option></select></label><button id="plan-save" data-id="" onclick="HQCloud.upsertPlan(this.dataset.id)">メニューを保存</button>${plans.filter(x=>x.active).map(p=>`<div class="box"><strong>${safe(p.title)}</strong> ${safe(p.subject)} ${p.target_minutes}分・${safe(p.question_category)} <button class="secondary" onclick="HQCloud.editPlan('${p.plan_id}')">編集</button> <button class="secondary" onclick="HQCloud.disablePlan('${p.plan_id}')">削除</button></div>`).join('')}${dashboard()}`;
 }
 return card(h)}
async function logout(){let result=await db.auth.signOut();if(result.error){status('ログアウトできません：'+result.error.message);return}user=null;role='';plans=[];rows=[];links=[];invite='';localStorage.removeItem('hq-cloud-role');status('ログアウトしました。端末内の記録は残っています。')}
async function selectLearner(id){selected=id;await parentRefresh()}
window.HQCloud={screen,stage,schedule,sync,account,setRole,bind,parentRefresh,makeInvite,accept,upsertPlan,disablePlan,editPlan,logout,selectLearner,targets,categories,planSummary};
db.auth.getSession().then(({data})=>{if(!user)user=data.session?.user||null;if(user&&role==='parent')parentRefresh();else if(user&&role==='child'&&s.cloud?.ownerId===user.id)sync();if(tab==='SYNC'||tab==='PARENT')render()});
db.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){user=null;notice='ログアウトしました。端末内の記録は残っています。';if(tab==='SYNC'||tab==='PARENT')render()}else if(session?.user){user=session.user}});
window.addEventListener('online',()=>{if(role==='child')sync();else if(role==='parent')parentRefresh()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user){if(role==='child')sync();else if(role==='parent')parentRefresh()}});
setInterval(()=>{if(user&&!document.hidden){if(role==='child')sync();else if(role==='parent')parentRefresh()}},60000);
})();
