'use strict';
const assert=require('node:assert/strict');
const {merge}=require('./merge.js');
let a=merge({title:'a',xp:10},{title:'b',xp:10},{title:'a',xp:20});
assert.deepEqual(JSON.parse(JSON.stringify(a.value)),{title:'b',xp:20});assert.equal(a.conflicts.length,0);
a=merge({title:'a'},{title:'b'},{title:'c'});assert.equal(a.conflicts.length,1);assert.deepEqual(a.conflicts[0].path,['title']);assert.equal(a.conflicts[0].remote.value,'c');
a=merge({task:{title:'a'}},{},{task:{title:'b'}});assert.equal(a.conflicts.length,1);assert.equal(a.conflicts[0].local.exists,false);
a=merge({x:null},{},{x:null});assert.equal(a.conflicts.length,0);assert.equal('x' in a.value,false);
a=merge({arr:[1]},{arr:[1,2]},{arr:[1,3]});assert.equal(a.conflicts.length,1);
const proto=JSON.parse('{"__proto__":{"a":1}}');
a=merge(proto,JSON.parse('{"__proto__":{"a":2}}'),JSON.parse('{"__proto__":{"a":1,"b":3}}'));
assert.equal(a.conflicts.length,0);assert.equal(JSON.parse(JSON.stringify(a.value)).__proto__.a,2);assert.equal({}.a,undefined);
console.log('PASS independent edits, conflicts, deletes, nulls, arrays and unsafe keys');

const initial= require('./merge.js').initial;
let m=initial({questData:{menus:{a:{id:'a',title:'数学'}},completions:{}},rpg:{bonusXP:10,awards:{'word:2026-11-20:enjp:1':true,'word:2026-11-20:jpen:1':true}}}, {questData:{menus:{b:{id:'b',title:'国語'}},completions:{'t@2026-11-20':{id:'t',date:'2026-11-20',xp:10}}},rpg:{bonusXP:0,awards:{}}});
assert.deepEqual(Object.keys(m.value.questData.menus).sort(),['a','b']);assert.equal(m.value.rpg.bonusXP,10);assert.equal(m.blocked.length,0);
m=initial({questData:{menus:{x:{id:'x',title:'A'}}}},{questData:{menus:{x:{id:'x',title:'B'}}}});assert.equal(m.menuConflicts.length,1);assert.equal(m.blocked.length,0);
m=initial({rpg:{bonusXP:40},sessions:[{date:'1'}]},{rpg:{bonusXP:30},sessions:[{date:'2'}]});assert.equal(m.blocked.length,2);
console.log('PASS initial union, conflicting IDs, and ambiguous XP/history protection');

const done={'q@2026-11-20':{id:'q',date:'2026-11-20',title:'国語',xp:10}};
m=initial({questData:{menus:{d:{id:'d',deleted:true}},completions:{}} ,rpg:{bonusXP:0,awards:{}}},{questData:{menus:{q:{id:'q'}},completions:done},rpg:{bonusXP:5,awards:{'word:2026-11-20:enjp:1':true}}});
assert.equal(m.value.questData.menus.d.deleted,true);assert.equal(m.value.questData.completions['q@2026-11-20'].xp,10);assert.equal(m.value.rpg.bonusXP,5);assert.equal(m.blocked.length,0);assert.equal(m.hardErrors.length,0);
m=initial({questData:{completions:done}},{questData:{completions:done}});assert.equal(Object.keys(m.value.questData.completions).length,1);
m=initial({questData:{completions:done}},{questData:{completions:{'q@2026-11-20':{id:'q',date:'2026-11-20',title:'国語',xp:20}}}});assert.equal(m.blocked.length,1);
m=initial({rpg:{bonusXP:5,awards:{'word:2026-11-20:enjp:1':true}}},{rpg:{bonusXP:5,awards:{'word:2026-11-20:enjp:2':true}}});assert.equal(m.value.rpg.bonusXP,10);assert.equal(m.blocked.length,0);
m=initial({rpg:{bonusXP:5,awards:{'word:2026-11-20:enjp:1':true}}},{rpg:{bonusXP:13,awards:{'word:2026-11-20:enjp:1':true,'sentence:2026-11-20:s1':true}}});assert.equal(m.value.rpg.bonusXP,13);
m=initial({rpg:{bonusXP:5,awards:{unknown:true}}},{rpg:{bonusXP:8,awards:{'sentence:2026-11-20:s1':true}}});assert.equal(m.blocked.length,1);assert.deepEqual(m.blocked[0].path,['rpg']);
m=initial({questData:{completions:{bad:{id:'q',date:'2026-11-20',xp:10}}}},{questData:{completions:{}}});assert(m.hardErrors.length);
console.log('PASS deletion retention, completion identity, XP provenance and unknown awards');
// A stale snapshot deletion must not erase completed quest history.
const completion={id:'q',date:'2026-11-20',title:'国語',subject:'国語',minutes:30,xp:10};
let retained=merge({questData:{completions:{'q@2026-11-20':completion}}},{questData:{completions:{'q@2026-11-20':completion}}},{questData:{completions:{}}});
assert.deepEqual(JSON.parse(JSON.stringify(retained.value.questData.completions)),{'q@2026-11-20':completion});
assert.equal(retained.conflicts.length,0);
retained=merge({questData:{completions:{}}},{questData:{completions:{'q@2026-11-20':completion}}},{questData:{completions:{}}});
assert.deepEqual(JSON.parse(JSON.stringify(retained.value.questData.completions)),{'q@2026-11-20':completion});
assert.equal(retained.conflicts.length,0);
console.log('PASS stale snapshots cannot delete quest completion history');


const baseRpg={bonusXP:0,awards:{},plays:[]};
const a5={bonusXP:5,awards:{'word:2026-11-20:enjp:1':true},plays:[]};
const b5={bonusXP:5,awards:{'word:2026-11-20:enjp:2':true},plays:[]};
let concurrent=merge({rpg:baseRpg},{rpg:a5},{rpg:b5});
assert.equal(concurrent.conflicts.length,0);assert.equal(concurrent.value.rpg.bonusXP,10);assert.equal(Object.keys(concurrent.value.rpg.awards).length,2);
concurrent=merge({rpg:baseRpg},{rpg:a5},{rpg:{bonusXP:8,awards:{'sentence:2026-11-20:s1':true},plays:[]}});
assert.equal(concurrent.conflicts.length,0);assert.equal(concurrent.value.rpg.bonusXP,13);
concurrent=merge({rpg:baseRpg},{rpg:a5},{rpg:{bonusXP:5,awards:{unknown:true},plays:[]}});
assert.deepEqual(concurrent.conflicts.map(c=>c.path),[['rpg']]);
assert.equal(concurrent.conflicts[0].remote.value.awards.unknown,true);
console.log('PASS concurrent bonus awards are reconciled or require explicit choice');

const baseEvents=[{eventId:'base-1',type:'enjp',id:1,correct:true}];
const leftEvents=[...baseEvents,{eventId:'device-a-1',type:'dialogue',id:31,question:'A asks',selectedAnswer:'yes',correctAnswer:'yes',correct:true}];
const rightEvents=[...baseEvents,{eventId:'device-b-1',type:'enjp',id:2,question:'word?',selectedAnswer:'wrong',correctAnswer:'right',correct:false}];
concurrent=merge({learningEvents:baseEvents},{learningEvents:leftEvents},{learningEvents:rightEvents});
assert.equal(concurrent.conflicts.length,0);assert.equal(concurrent.value.learningEvents.length,3);assert.deepEqual(new Set(concurrent.value.learningEvents.map(x=>x.eventId)),new Set(['base-1','device-a-1','device-b-1']));
m=initial({learningEvents:leftEvents},{learningEvents:rightEvents});assert.equal(m.blocked.length,0);assert.equal(m.value.learningEvents.length,3);
console.log('PASS learning answer history joins by attempt ID without loss or duplicates');

// Synthetic reproduction of the reported unsynced-device state. Completion
// records and their minutes/XP are retained automatically; opaque bonus XP
// and progression metadata remain blocked instead of being guessed or added.
const questRows={
 'q-a@2026-11-20':{id:'q-a',date:'2026-11-20',title:'英語',minutes:25,xp:10},
 'q-b@2026-11-20':{id:'q-b',date:'2026-11-20',title:'数学',minutes:25,xp:10}
};
const conflictBase={sessions:[],questData:{menus:{},completions:{}},rpg:{bonusXP:90,awards:{'unknown-legacy-award':true}},xpProgression:{version:1,baseLevel:1,baseQuestXP:0,baseBonusXP:90,carryXP:90}};
const conflictLocal={sessions:[{date:'2026-11-20',kind:'学校',subject:'学習',minutes:50}],questData:{menus:{},completions:questRows},rpg:{bonusXP:85,awards:{'unknown-local-award':true}},xpProgression:{version:1,baseLevel:1,baseQuestXP:0,baseBonusXP:85,carryXP:85}};
const conflictRemote={sessions:[],questData:{menus:{},completions:{}},rpg:{bonusXP:100,awards:{'unknown-cloud-award':true}},xpProgression:{version:1,baseLevel:1,baseQuestXP:0,baseBonusXP:100,carryXP:100}};
const reported=merge(conflictBase,conflictLocal,conflictRemote);
assert.equal(Object.keys(reported.value.questData.completions).length,2);
assert.equal(Object.values(reported.value.questData.completions).reduce((n,x)=>n+x.xp,0),20);
assert.equal(Object.values(reported.value.questData.completions).reduce((n,x)=>n+x.minutes,0),50);
assert.equal(reported.value.sessions.reduce((n,x)=>n+x.minutes,0),50);
assert.deepEqual(reported.conflicts.map(x=>x.path),[['xpProgression','baseBonusXP'],['xpProgression','carryXP'],['rpg']]);
assert.equal(reported.conflicts.find(x=>x.path[0]==='rpg').local.value.bonusXP,85);
assert.equal(reported.conflicts.find(x=>x.path[0]==='rpg').remote.value.bonusXP,100);
assert.equal(reported.conflicts.find(x=>x.path[1]==='carryXP').local.value,85);
assert.equal(reported.conflicts.find(x=>x.path[1]==='carryXP').remote.value,100);
const repeated=merge(conflictLocal,reported.value,reported.value);
assert.equal(Object.keys(repeated.value.questData.completions).length,2);
assert.equal(Object.values(repeated.value.questData.completions).reduce((n,x)=>n+x.xp,0),20);
console.log('PASS reported conflict fixture retains two completions and 50 minutes, deduplicates XP history and blocks ambiguous progression');
