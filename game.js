'use strict';
// Game state is saved on this device after each play.
let match=null;
const opponents=[
 {name:'アルバルク東京',level:0,star:3,player:'馬場雄大'},
 {name:'千葉ジェッツ',level:0,star:4,player:'富樫勇樹'},
 {name:'琉球ゴールデンキングス',level:0,star:5,player:'岸本隆一'},
 {name:'宇都宮ブレックス',level:0,star:4,player:'比江島慎'},
 {name:'横浜ビー・コルセアーズ',level:0,star:3,player:'河村勇輝'},
 {name:'Los Angeles Lakers',level:1,star:4,player:'LeBron James'},
 {name:'Golden State Warriors',level:1,star:5,player:'Stephen Curry'},
 {name:'Boston Celtics',level:1,star:5,player:'Jayson Tatum'},
 {name:'Dallas Mavericks',level:1,star:3,player:'Anthony Davis'},
 {name:'Denver Nuggets',level:1,star:5,player:'Nikola Jokić'}];
// School names and past participation: official Winter Cup 2024 and 2025 team lists. Fictional game attributes.
opponents.push(
 {name:'福岡第一',level:0,star:5,player:'攻撃：速攻 ／ 守備：プレッシャー',offense:'速攻',defense:'プレッシャー'},
 {name:'福岡大学附属大濠',level:0,star:5,player:'攻撃：連携 ／ 守備：堅守',offense:'連携',defense:'堅守'},
 {name:'東山',level:0,star:5,player:'攻撃：速攻 ／ 守備：堅守',offense:'速攻',defense:'堅守'},
 {name:'開志国際',level:0,star:5,player:'攻撃：高さ ／ 守備：リバウンド',offense:'高さ',defense:'リバウンド'},
 {name:'北陸',level:0,star:4,player:'攻撃：インサイド ／ 守備：粘り強い守備',offense:'インサイド',defense:'粘り強い守備'},
 {name:'帝京長岡',level:0,star:4,player:'攻撃：速攻 ／ 守備：プレッシャー',offense:'速攻',defense:'プレッシャー'},
 {name:'仙台大学附属明成',level:0,star:5,player:'攻撃：連携 ／ 守備：堅守',offense:'連携',defense:'堅守'},
 {name:'土浦日本大学',level:0,star:4,player:'攻撃：外角 ／ 守備：リバウンド',offense:'外角',defense:'リバウンド'},
 {name:'八王子学園八王子',level:0,star:4,player:'攻撃：連携 ／ 守備：プレッシャー',offense:'連携',defense:'プレッシャー'},
 {name:'中部大学第一',level:0,star:4,player:'攻撃：高さ ／ 守備：堅守',offense:'高さ',defense:'堅守'},
 {name:'美濃加茂',level:0,star:3,player:'攻撃：速攻 ／ 守備：粘り強い守備',offense:'速攻',defense:'粘り強い守備'},
 {name:'藤枝明誠',level:0,star:4,player:'攻撃：外角 ／ 守備：プレッシャー',offense:'外角',defense:'プレッシャー'},
 {name:'尽誠学園',level:0,star:3,player:'攻撃：連携 ／ 守備：粘り強い守備',offense:'連携',defense:'粘り強い守備'},
 {name:'延岡学園',level:0,star:3,player:'攻撃：インサイド ／ 守備：リバウンド',offense:'インサイド',defense:'リバウンド'},
 {name:'洛南',level:0,star:4,player:'攻撃：連携 ／ 守備：堅守',offense:'連携',defense:'堅守'}
);

// 2026 entrants supplied by the user: Zenchu boys 24 and Winter Cup boys 60.
// School labels below use the source's short form; the category distinguishes similarly named schools.
const junior2026=['札幌市立東月寒','札幌市立啓明','郡山市立郡山第三','八戸市立白銀','成立学園','実践学園','埼玉栄','宇都宮市立一条','金沢学院大学附属','野々市市立布水','四日市メリノール学院','城南静岡','浜松学院興誠','京都精華学園','有田市立有和','湖南市立甲西北','倉敷市立南','広島市立古田','徳島市八万','高知','福智町立方城','北九州市立菊陵','江北町立江北','松江市立第二'];
const winterBoys2026=['駒澤大附苫小牧','白樺学園','八戸学院光星','黒沢尻工','仙台大明成','能代科学技術','羽黒','福島東稜','福島商','土浦日本大','小山南','桐生第一','埼玉栄','拓殖大紅陵','八王子学園八王子','國學院大久我山','湘南工科大附','日本航空','山梨学院','自然学園','東海大付諏訪','開志国際','帝京長岡','高岡第一','北陸学院','北陸','福井商','高山西','藤枝明誠','中部大第一','桜丘','四日市メリノール学院','光泉カトリック','東山','京都精華学園','阪南大','報徳学園','奈良育英','高野山','鳥取城北','出雲北陵','岡山商科大附','岡山理科大附','広島皆実','誠英','海部','尽誠学園','高松商','帝京第五','高知中央','福岡大附大濠','福岡第一','八女学院','佐賀北','長崎工','九州学院','柳ヶ浦','宮崎工','れいめい','沖縄水産'];
const boyAliases={'仙台大明成':'仙台大学附属明成','土浦日本大':'土浦日本大学','中部大第一':'中部大学第一','福岡大附大濠':'福岡大学附属大濠'};
for(const [category,schools] of [['全中男子',junior2026],['ウインターカップ男子',winterBoys2026]])schools.forEach((raw,i)=>{let name=category==='全中男子'?raw+'中学校':boyAliases[raw]||raw;let existing=category==='ウインターカップ男子'?opponents.find(x=>x.name===name):null;if(existing){existing.category=category;existing.school2026=true;return}let seed=[...raw].reduce((a,c)=>((a*31+c.charCodeAt(0))>>>0),17);let offense=['連携','速攻','外角','インサイド'][seed%4],defense=['堅守','リバウンド','プレッシャー','粘り強い守備'][(seed>>>4)%4];opponents.push({name,category,school2026:true,level:0,star:3+(seed%3),offense,defense,player:`攻撃：${offense} ／ 守備：${defense}`})});

// Player references are historical associations, not a statement of current rosters.
function dailyTeams(){let seed=[...today()].reduce((a,c)=>a*31+c.charCodeAt(0),7)>>>0,pool=opponents.map((x,i)=>i),result=[];for(let i=0;i<5;i++){let group=['全中男子','ウインターカップ男子'][i],eligible=group?pool.filter(n=>opponents[n].category===group):pool;if(!eligible.length)eligible=i===0?pool.filter(n=>opponents[n].level===0):pool;seed=(Math.imul(seed,1664525)+1013904223)>>>0;let pick=eligible[seed%eligible.length];result.push(pick);pool.splice(pool.indexOf(pick),1)}return result}
function level(){return 1+Math.floor(s.sessions.reduce((a,x)=>a+x.minutes,0)/120)}
function matchScreen(){if(match&&!match.finished)return card(`<div class="label">5 ON 5 · POSSESSION ${match.turn+1} / 8</div><h2>HARUKI FIVE ${match.us} − ${match.them} ${esc(match.team.name)}</h2><p class="muted">PG・SG・SF・PF・C の5人で戦う。ハルキはC！</p><div class="box">${esc(match.last)}</div><p>作戦を選んでプレーしよう。</p><div class="grid"><button onclick="possession('post')">ポストで攻める</button><button onclick="possession('screen')">スクリーンから展開</button><button onclick="possession('defense')">守備とリバウンド</button></div><p class="muted">各ターンに攻守を実施。途中の試合もこの端末に保存されます。</p>`);
if(match&&match.finished)return card(`<div class="label">FINAL SCORE</div><h2>${match.us} − ${match.them}</h2><p>${match.us>match.them?'勝利！':match.us===match.them?'引き分け':'惜敗！'} ${esc(match.team.name)}との試合</p><p>${esc(match.last)}</p><button onclick="match=null;delete s.activeMatch;save();render()">対戦相手に戻る</button>`);
let wins=s.matches.filter(x=>x.full&&x.won&&x.level===0).length;
return card(`<h2>今日の対戦相手</h2><p>${unlocked()?'🏀 試合解放！':'🔒 今日のメニューと英検・学校の目標達成で解放'}</p><p class="muted">国内から挑戦。国内で3勝するとNBAに挑戦できます。選手名は歴史上の所属を参考にした演出で、現役登録を示すものではありません。</p>${dailyTeams().map(i=>{let t=opponents[i],locked=!unlocked()||(t.level===1&&wins<3);return `<div class="box" style="margin:8px 0"><strong>${esc(t.name)}</strong> ${'★'.repeat(t.star)}<br>${t.category?`<small>${esc(t.category)}</small><br>`:''}<small>${t.offense?'ゲーム上の特徴':'注目選手'}：${esc(t.player)}${t.level&&wins<3?'・国内3勝で解放':''}</small><p><button ${locked?'disabled':''} onclick="startMatch(${i})">挑戦する</button></p></div>`}).join('')}<p class="muted">毎日、全中男子・ウインターカップ男子から各1チーム以上が登場します。強さ・戦術はゲーム上の架空設定です。公式ロゴやユニフォームは使用していません。</p><details><summary>登録済みの学校一覧を見る</summary>${['全中男子','ウインターカップ男子'].map(group=>`<h3>${group}</h3><p>${opponents.filter(t=>t.category===group&&t.school2026).map(t=>esc(t.name)).join('、')}</p>`).join('')}</details>`)}
function startMatch(i){let t=opponents[i];if(!t||!dailyTeams().includes(i)||!unlocked()||(t.level===1&&s.matches.filter(x=>x.full&&x.won&&x.level===0).length<3))return;match={team:t,turn:0,us:0,them:0,last:'ティップオフ！ハルキがゴール下に入った。',finished:false};s.activeMatch=match;save();render()}
function possession(style){if(!match||match.finished||!['post','screen','defense','three'].includes(style))return;
 let m=match,lvl=level(),ability=Math.min(.16,(lvl-1)*.008),strength=(m.team.star-3)*.06,rand=Math.random;
 let matchup=(m.team.defense==='リバウンド'&&style==='post')?-.03:(m.team.defense==='プレッシャー'&&style==='screen')?-.03:0;let chance=Math.max(.25,Math.min(.82,.55+ability-strength+matchup+({post:.02,screen:.07,defense:-.04,three:-.06}[style])));
 let shot=rand()<chance,defend=rand()<Math.max(.2,Math.min(.8,.43+ability-strength+(m.team.offense==='速攻'&&style!=='defense'?-.03:0)+({post:0,screen:-.02,defense:.17,three:-.03}[style])));
 let text='';if(style==='post')text=shot?'ポストで受けてゴール下シュート成功！':'ポストシュートは惜しくも外れた。';
 if(style==='screen')text=shot?'ハルキのスクリーンから味方がシュート！':'スクリーンからのシュートは外れた。';
 if(style==='defense')text=shot?'攻撃では味方が得点！':'攻撃は無得点。';
 if(style==='three')text=shot?'3ポイントシュート成功！':'3ポイントシュートは外れた。';
 if(shot)m.us+=style==='three'?3:2;
 if(defend){text+=rand()<.5?' ハルキがブロック！':' ハルキがリバウンドを確保！'}else{let enemyScores=rand()<.7;if(enemyScores){m.them+=2;text+=' 相手も得点。'}else text+=' 相手のシュートは外れた。'}
 m.turn++;m.last=text;if(m.turn>=8){m.finished=true;s.matches.push({date:today(),full:true,opponent:m.team.name,level:m.team.level,score:[m.us,m.them],won:m.us>m.them})}s.activeMatch=m;save();render()}
