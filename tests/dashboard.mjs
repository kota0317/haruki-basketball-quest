import assert from 'node:assert/strict'; import {summarize} from '../cloud/dashboard.mjs';
const x=summarize([
{event_type:'study_session',occurred_on:'2026-11-18',payload:{kind:'英検',minutes:35}},
{event_type:'study_session',occurred_on:'2026-11-18',payload:{kind:'学校',minutes:25}},
{event_type:'study_session',occurred_on:'2026-11-17',payload:{kind:'学校',minutes:10}},
{event_type:'answer',payload:{id:'a',first:true,correct:false,time:100,due:'2026-11-18'}},
{event_type:'answer',payload:{id:'a',first:false,correct:true,time:200,due:'2026-11-19'}},
{event_type:'answer',payload:{id:'b',first:true,correct:true,time:300,due:'2026-11-18'}}
],[{id:'a',type:'文法'},{id:'b',type:'単語'}],'2026-11-18');
assert.equal(x.days[0][1].英検,35);assert.equal(x.streak,2);assert.equal(x.due,1);assert.equal(x.reviews,1);assert.equal(x.mockExams.length,0);assert.deepEqual(x.topics.find(([n])=>n==='文法')[1],{correct:0,total:1});
console.log('PASS: parent daily totals, first-attempt accuracy, review and streak');
