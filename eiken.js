'use strict';
// Original practice items, written for this app rather than copied from past papers.
const CLOZE = [
['I was tired, ___ I went to bed early.','so','but','or','原因の後に結果が続くので so。'],
['If it rains tomorrow, we ___ at home.','will stay','stayed','stays','if 節が現在形で、主節に未来を表す will を使います。'],
['My sister is taller ___ I am.','than','then','from','比較級には than を使います。'],
['I have lived here ___ 2020.','since','for','during','since の後には始まった時点を置きます。'],
['Ken has studied English ___ three years.','for','since','at','for の後には期間を置きます。'],
['This cake was made ___ my mother.','by','with','from','受け身で動作をした人は by で示します。'],
['I want ___ a doctor in the future.','to be','being','be','want to + 動詞の原形で「〜したい」。'],
['She enjoys ___ books after dinner.','reading','read','to reading','enjoy の後には動名詞を置きます。'],
['Please tell me how ___ this machine.','to use','using','use','how to + 動詞の原形で「〜の使い方」。'],
['The boy ___ is playing soccer is my brother.','who','which','where','人を説明する関係代名詞 who。'],
['This is the book ___ I bought yesterday.','which','who','where','物を説明する関係代名詞 which。'],
['Have you ever ___ to Kyoto?','been','be','being','have been to は「〜に行ったことがある」。'],
['The room ___ every day.','is cleaned','cleans','is cleanes','受け身は be動詞＋過去分詞。'],
['There ___ many students in the library.','are','is','was','many students は複数です。'],
['I am interested ___ Japanese history.','in','on','at','be interested in で「〜に興味がある」。'],
['We arrived ___ the station at ten.','at','to','for','arrive at は駅などの地点に到着する表現。'],
['It is important ___ enough sleep.','to get','get','getting to','It is important to do で「〜することは大切」。'],
['My father asked me ___ the door.','to close','close','closing','ask 人 to do で「人に〜するよう頼む」。'],
['I could not play outside ___ it was raining.','because','but','so','理由を示す because を使います。'],
['This bag is too heavy for me ___ carry.','to','for','of','too ... to do は「〜するには…すぎる」。'],
['How ___ does it take to walk there?','long','many','often','How long does it take? は「どのくらい時間がかかる？」。'],
['How ___ students are there in your class?','many','much','long','数えられる複数名詞には how many。'],
['I have two dogs. One is white, and ___ is brown.','the other','another','other','二つのうち残り一つは the other。'],
['Please turn ___ the light. It is dark here.','on','off','out','暗いので電気をつけます。turn on は「つける」。'],
['You should wash your hands ___ eating.','before','after','until','食事の前に手を洗うので before。'],
['Tom is good ___ playing basketball.','at','on','with','be good at で「〜が得意」。'],
['My mother was cooking when I ___ home.','came','come','coming','過去の出来事なので came。'],
['A: Would you like some tea? B: Yes, ___.','please','you do','I like','申し出に対する丁寧な返答は Yes, please.'],
['A: May I use your pen? B: Sure. Here ___.','you are','it is not','am I','物を手渡すときは Here you are.'],
['A: Thank you for your help. B: ___.','You are welcome','I am sorry','See you yesterday','感謝への返答は You are welcome.'],
['A: How was your trip? B: It was ___.','great','tomorrow','by bus','旅行の感想を尋ねているので great。'],
['A: What time does the store open? B: ___.','At nine','For two hours','On the desk','開店時刻を尋ねています。'],
['A: Why did you go to the library? B: ___ borrow a book.','To','For','By','目的を表す to + 動詞の原形。'],
['A: Can you help me? B: Sorry, I ___ right now.','cannot','do','am','頼まれたことができないときは cannot。'],
['A: What do you want to drink? B: ___.','Some water, please','At the station','Yesterday afternoon','飲みたい物を尋ねています。'],
['A: How do you go to school? B: ___.','By bike','For an hour','At seven years old','交通手段を尋ねています。'],
['A: Shall we play tennis? B: ___.','That sounds fun','I played it yesterday morning','No, she is not','誘いに対して「楽しそう」と答えます。'],
['A: Whose notebook is this? B: It is ___.','mine','me','I','所有を表す代名詞 mine を使います。'],
['A: Where is the post office? B: It is ___ the bank.','next to','because','often','場所を示す next to は「〜の隣に」。'],
['A: I passed the test! B: ___.','Congratulations','Never mind','I have a test','合格を祝う言葉は Congratulations.'],
['A: Could you speak more slowly? B: ___.','Of course','It is slow','I was speaking','依頼を引き受ける返事は Of course.'],
['A: What are you going to do this weekend? B: ___.','I am going to visit my uncle','I visited him last year','I live near the park','週末の予定を尋ねています。'],
['A: Do you know when the movie starts? B: ___.','At six thirty','In the movie theater','For my sister','映画が始まる時刻を答えます。'],
['A: I am sorry I am late. B: ___.','That is OK','You are a teacher','It is a book','謝罪への返答として「大丈夫です」。'],
['A: How often do you practice? B: ___.','Three times a week','For three hours','Three kilometers','頻度を尋ねる How often には回数で答えます。']
].map((v,i)=>({id:i+1,q:v[0],choices:v.slice(1,4),ex:v[4]}));
const CLOZE_FOURTH=['if','staying','as','to','from','for','is','reads','uses','whose','when','went','cleaning','be','from','on','gets','closed','or','with','much','often','each','under','between','in','comes','thanks','is','Good night','at home','With my brother','Of','does','On Monday','At school','I am a ball','my','quickly','Excuse me','I am a book','She has a pen','My favorite is blue','I like apples','At the gym'];
CLOZE.forEach((q,i)=>q.choices.push(CLOZE_FOURTH[i]));
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
function ekState(){return s.eikenDaily ||= {days:{}}}
function ekDay(){let days=ekState().days;return days[today()] ||= {}}
function ekWeekDates(){let [y,m,d]=today().split('-').map(Number),day=new Date(Date.UTC(y,m-1,d)),weekday=day.getUTCDay();return Array.from({length:6},(_,i)=>{let t=new Date(day);t.setUTCDate(t.getUTCDate()-((weekday||7)-1)+i);return t.toISOString().slice(0,10)})}
function ekReviewIds(type){return [...new Set(ekWeekDates().flatMap(day=>ekState().days[day]?.[type]?.seen||[]))]}
function ekGenerate(type){let sunday=new Date(today()+'T00:00:00Z').getUTCDay()===0;let all=type==='cloze'?CLOZE:EIKEN_WORDS;let count=sunday?(type==='cloze'?10:25):(type==='cloze'?5:10);let selected;if(sunday){let ids=ekReviewIds(type);selected=shuffle(ids).slice(0,count)}else{let recent=new Set(Object.entries(ekState().days).filter(([d])=>d<today()).sort(([a],[b])=>b.localeCompare(a)).slice(0,21).flatMap(([,v])=>v[type]?.original||[]));let fresh=shuffle(all.filter(x=>!recent.has(x.id)));let rest=shuffle(all.filter(x=>recent.has(x.id)));selected=fresh.concat(rest).slice(0,count).map(x=>x.id)}return {original:selected,index:0,retry:[],phase:'first',wrong:0,complete:false}}
function ekStart(type){let d=ekDay();if(!d[type]){if(type==='words'){let a=ekGenerate('enjp'),b=ekGenerate('jpen');d.enjp={original:a.original,seen:[]};d.jpen={original:b.original,seen:[]};d.words={original:a.original.map(id=>'enjp:'+id).concat(b.original.map(id=>'jpen:'+id)),index:0,retry:[],phase:'first',wrong:0,complete:false}}else d[type]=ekGenerate(type);if(!save())return}ekShow(type)}
function ekOptions(word,type){let correct=type==='enjp'?word.ja:word.en;let field=type==='enjp'?'ja':'en';let options=[correct];for(const w of shuffle(EIKEN_WORDS)){let v=w[field];if(v!==correct&&!options.includes(v)&&w.en.toLowerCase()!==word.en.toLowerCase()&&w.ja!==word.ja&&!v.includes(correct)&&!correct.includes(v)){options.push(v);if(options.length===3)break}}return shuffle(options)}
let ekCurrent=null;
function ekShow(type){let run=ekDay()[type];if(!run)return;let el=document.getElementById('ekQuiz');if(run.complete||!run.original.length){el.innerHTML=`<h3>${run.original.length?'クリア！':'復習できる問題がありません'}</h3><p>${run.original.length?`全 ${run.original.length} 題を完了しました。最初に間違えた回数：${run.wrong} 回。`:'月〜土の学習を進めると日曜日に復習できます。'}</p><button onclick="render()">戻る</button>`;return}let list=run.phase==='first'?run.original:run.retry;if(run.index>=list.length){if(run.phase==='retry'&&list.length){run.index=0}else if(run.phase==='first'&&run.retry.length){run.phase='retry';run.index=0}else{run.complete=true;save();ekShow(type);return}save();list=run.retry}let ref=list[run.index], mode=type==='words'?ref.split(':')[0]:type, itemId=type==='words'?Number(ref.split(':')[1]):ref;let item=(mode==='cloze'?CLOZE:EIKEN_WORDS).find(x=>x.id===itemId);if(!item){el.textContent='問題を読み込めません。';return}if(run.phase==='first'){let seen=type==='words'?ekDay()[mode]:(ekDay()[type]);seen.seen ||= [];if(!seen.seen.includes(item.id)){seen.seen.push(item.id);if(!save())return}}let correct=mode==='cloze'?item.choices[0]:mode==='enjp'?item.ja:item.en;let opts=mode==='cloze'?shuffle(item.choices):ekOptions(item,mode);ekCurrent={type,mode,id:ref,itemId:item.id,correct};let q=mode==='cloze'?item.q:mode==='enjp'?`「${item.en}」の意味は？`:`「${item.ja}」に対応する英語は？`;el.innerHTML=`<p class="label">${run.phase==='retry'?'まちがい直し':'チャレンジ'} ${run.index+1} / ${list.length}</p><h3>${esc(q)}</h3><div class="options">${opts.map((v,i)=>`<button class="secondary" onclick="ekAnswer(${i})">${esc(v)}</button>`).join('')}</div>`;ekCurrent.options=opts}
function ekAnswer(i){if(!ekCurrent)return;let {type,mode,id,itemId,correct,options}=ekCurrent,ok=options[i]===correct,run=ekDay()[type];if(run.phase==='first'){run.index++;if(!ok){run.retry.push(id);run.wrong++}}else if(ok){run.retry.splice(run.index,1)}else{run.index++;if(run.index>=run.retry.length)run.index=0}if(run.phase==='retry'&&!run.retry.length)run.complete=true;let item=mode==='cloze'?CLOZE.find(x=>x.id===itemId):EIKEN_WORDS.find(x=>x.id===itemId);ekCurrent=null;if(!save())return;document.getElementById('ekQuiz').innerHTML=`<h3>${ok?'⭕ 正解！':'もう一度確認しよう'}</h3><p>正解：${esc(correct)}<br>${esc(mode==='cloze'?item.ex:`${item.en}：${item.ja}`)}</p><button onclick="ekShow('${type}')">次へ</button>`}
function ekPanel(){let sunday=new Date(today()+'T00:00:00Z').getUTCDay()===0,d=ekDay();let a=sunday?Math.min(25,ekReviewIds('enjp').length):10,b=sunday?Math.min(25,ekReviewIds('jpen').length):10,c=sunday?Math.min(10,ekReviewIds('cloze').length):5;return card(`<div class="label">EIKEN 3 CHALLENGE</div><h2>${sunday?'日曜日の復習':'今日の英検チャレンジ'}</h2><p>${sunday?'月〜土に出題された問題から復習しよう。':'単語20題と穴埋め5題に挑戦！'}</p><div class="box"><strong>英単語</strong><p>英語 → 日本語 ${a}題 ／ 日本語 → 英語 ${b}題</p><button onclick="ekStart('words')">${d.words?'つづきから':'スタート'}</button></div><div class="box"><strong>文章・会話の穴埋め</strong><p>${c}題</p><button onclick="ekStart('cloze')">${d.cloze?'つづきから':'スタート'}</button></div><div id="ekQuiz" aria-live="polite"></div><p class="muted">単語は全問解いた後に、間違えた問題をすべて正解するまで復習します。進捗はこの端末に保存されます。${sunday?'今週の出題数が足りない場合は、その分だけ出題します。':''}</p>`)}
