const fs=require('fs'),vm=require('vm'),assert=require('assert');
let clock=Date.parse('2026-11-18T14:59:00Z');
class FakeDate extends Date {constructor(...x){super(...(x.length?x:[clock]))}static now(){return clock}}
let store={},elements={};const el=id=>elements[id]??={innerHTML:'',value:'',checked:false};
let context={Date:FakeDate,Intl,console,Math,JSON,Blob,localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=v},setInterval(){},document:{getElementById:el,createElement:()=>({click(){}}),addEventListener(){}},window:{scrollTo(){}},alert(){},confirm(){return false},prompt(){return null},URL:{createObjectURL(){},revokeObjectURL(){}}};vm.createContext(context);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../game.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../eiken-words.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../eiken.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8'),context);
function run(x){return vm.runInContext(x,context)}
assert.equal(run('today()'),'2026-11-18');
el('kind').value='英検';el('subject').value='単語';el('minutes').value='35';run('addSession()');
el('kind').value='学校';el('subject').value='数学';el('minutes').value='25';run('addSession()');
assert.equal(run('total("英検")'),35);assert.equal(run('unlocked()'),true);
assert.equal(JSON.parse(store['haruki-quest-prototype-v1']).sessions.length,2);
run("go('EIKEN');quiz(false);answer(1)");let answers=JSON.parse(store['haruki-quest-prototype-v1']).answers;assert.equal(answers[0].correct,false);assert.equal(answers[0].first,true);assert.equal(answers[0].due,'2026-11-19');
clock+=120000;assert.equal(run('today()'),'2026-11-19');assert.equal(run('total("英検")'),0);assert.equal(run('unlocked()'),false);
run('quiz(true);answer(0)');answers=JSON.parse(store['haruki-quest-prototype-v1']).answers;assert.equal(answers[1].correct,true);assert.equal(answers[1].first,false);
run('s=load()');assert.equal(run('s.sessions.length'),2);
// Start and finish a game only after both goals are met.
el('kind').value='英検';el('subject').value='単語';el('minutes').value='35';run('addSession()');
el('kind').value='学校';el('subject').value='数学';el('minutes').value='25';run('addSession()');
let domestic=run('dailyTeams().find(i=>opponents[i].level===0)');assert.notEqual(domestic,undefined);
run(`startMatch(${domestic})`);assert.equal(run('match.turn'),0);
for(let i=0;i<8;i++)run("possession('defense')");
assert.equal(run('match.finished'),true);assert.equal(run('s.matches.filter(m=>m.full).length'),1);
assert.equal(run('match.us % 2'),0);assert.equal(run('match.them % 2'),0);
console.log('PASS: JST midnight, persistence, answer, review, unlock and 8-turn game');
