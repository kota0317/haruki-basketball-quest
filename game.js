'use strict';
// In-progress games remain in memory; only final results enter the existing store.
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
// Player references are historical associations, not a statement of current rosters.
function dailyTeams(){let seed=[...today()].reduce((a,c)=>a*31+c.charCodeAt(0),7)>>>0,pool=opponents.map((x,i)=>i),result=[];for(let i=0;i<5;i++){let eligible=i===0?pool.filter(n=>opponents[n].level===0):pool;seed=(Math.imul(seed,1664525)+1013904223)>>>0;let pick=eligible[seed%eligible.length];result.push(pick);pool.splice(pool.indexOf(pick),1)}return result}
function level(){return 1+Math.floor(s.sessions.reduce((a,x)=>a+x.minutes,0)/120)}
function matchScreen(){if(match&&!match.finished)return card(`<div class="label">5 ON 5 · POSSESSION ${match.turn+1} / 8</div><h2>HARUKI FIVE ${match.us} − ${match.them} ${esc(match.team.name)}</h2><p class="muted">PG・SG・SF・PF・C の5人で戦う。ハルキはC！</p><div class="box">${esc(match.last)}</div><p>作戦を選んでプレーしよう。</p><div class="grid"><button onclick="possession('post')">ポストで攻める</button><button onclick="possession('screen')">スクリーンから展開</button><button onclick="possession('defense')">守備とリバウンド</button></div><p class="muted">各ターンに攻守を実施。途中で画面を閉じると試合は中断します。</p>`);
if(match&&match.finished)return card(`<div class="label">FINAL SCORE</div><h2>${match.us} − ${match.them}</h2><p>${match.us>match.them?'勝利！':match.us===match.them?'引き分け':'惜敗！'} ${esc(match.team.name)}との試合</p><p>${esc(match.last)}</p><button onclick="match=null;render()">対戦相手に戻る</button>`);
let wins=s.matches.filter(x=>x.full&&x.won&&x.level===0).length;
return card(`<h2>今日の対戦相手</h2><p>${unlocked()?'🏀 試合解放！':'🔒 英検と学校の目標を両方達成すると解放'}</p><p class="muted">国内から挑戦。国内で3勝するとNBAに挑戦できます。選手名は歴史上の所属を参考にした演出で、現役登録を示すものではありません。</p>${dailyTeams().map(i=>{let t=opponents[i],locked=!unlocked()||(t.level===1&&wins<3);return `<div class="box" style="margin:8px 0"><strong>${esc(t.name)}</strong> ${'★'.repeat(t.star)}<br><small>注目選手：${esc(t.player)}${t.level&&wins<3?'・国内3勝で解放':''}</small><p><button ${locked?'disabled':''} onclick="startMatch(${i})">挑戦する</button></p></div>`}).join('')}<p class="muted">選手・チームのロゴや写真は使用していません。名称は非公式のゲーム内表現です。</p>`)}
function startMatch(i){let t=opponents[i];if(!t||!dailyTeams().includes(i)||!unlocked()||(t.level===1&&s.matches.filter(x=>x.full&&x.won&&x.level===0).length<3))return;match={team:t,turn:0,us:0,them:0,last:'ティップオフ！ハルキがゴール下に入った。',finished:false};render()}
function possession(style){if(!match||match.finished||!['post','screen','defense'].includes(style))return;
 let m=match,lvl=level(),ability=Math.min(.16,(lvl-1)*.008),strength=(m.team.star-3)*.06,rand=Math.random;
 let chance=Math.max(.25,Math.min(.82,.55+ability-strength+({post:.02,screen:.07,defense:-.04}[style])));
 let shot=rand()<chance,defend=rand()<Math.max(.2,Math.min(.8,.43+ability-strength+({post:0,screen:-.02,defense:.17}[style])));
 let text='';if(style==='post')text=shot?'ポストで受けてゴール下シュート成功！':'ポストシュートは惜しくも外れた。';
 if(style==='screen')text=shot?'ハルキのスクリーンから味方がシュート！':'スクリーンからのシュートは外れた。';
 if(style==='defense')text=shot?'攻撃では味方が得点！':'攻撃は無得点。';
 if(shot)m.us+=2;
 if(defend){text+=rand()<.5?' ハルキがブロック！':' ハルキがリバウンドを確保！'}else{let enemyScores=rand()<.7;if(enemyScores){m.them+=2;text+=' 相手も得点。'}else text+=' 相手のシュートは外れた。'}
 m.turn++;m.last=text;if(m.turn>=8){m.finished=true;s.matches.push({date:today(),full:true,opponent:m.team.name,level:m.team.level,score:[m.us,m.them],won:m.us>m.them});save()}render()}
