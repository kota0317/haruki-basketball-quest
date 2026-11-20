'use strict';
const assert = require('node:assert/strict');
const { inspect, compare } = require('./migration-preview.js');
const raw = JSON.stringify({sessions:[{date:'2026-11-19',minutes:15},{date:'2026-11-19',minutes:15}],answers:[],matches:[{won:true}],settings:{exam:false},questData:{menus:[{id:'m'}],completions:{'m@2026-11-19':{xp:10}}},futureField:{keep:true}}, null, 2);
const result=inspect(raw);
assert.equal(result.original,raw);
assert.deepEqual(result.counts,{sessions:2,answers:0,matches:1,menus:1,completions:1});
assert.deepEqual(JSON.parse(result.original).futureField,{keep:true});
assert.throws(()=>inspect('{'),/Invalid backup/);
assert.throws(()=>inspect('{"sessions":[]}'),/Unrecognized backup/);
assert.throws(()=>inspect(JSON.stringify({sessions:[],answers:[],matches:[],settings:{},questData:{menus:[],completions:[]}})),/Unrecognized quest/);
console.log('PASS: offline backup inspection preserves duplicates, unknown fields and original bytes');
const initial={sessions:[{date:'1',minutes:120},{date:'1',minutes:120}],answers:[],matches:[{id:'game'}],settings:{},questData:{menus:[{id:'m',deleted:true}],completions:{'m@1':{xp:10}}},rpg:{bonusXP:5,awards:{a:true}},eikenDaily:{days:{one:true}}};
const later=JSON.parse(JSON.stringify(initial));later.sessions.pop();later.questData.menus[0].deleted=false;delete later.rpg.awards.a;later.eikenDaily.days.one=false;
const diff=compare(JSON.stringify(initial),JSON.stringify(later));
assert.equal(diff.missingSessions,1);assert.deepEqual(diff.changedDeletionIds,['m']);assert.deepEqual(diff.missingAwardIds,['a']);assert.equal(diff.eikenChanged,true);assert.equal(diff.before.level,3);assert.equal(diff.after.level,2);
assert.throws(()=>compare('{}',JSON.stringify(later)),/Unrecognized backup/);
console.log('PASS: offline before/after summary detects lost duplicates, deletion changes, XP sources and English progress');

