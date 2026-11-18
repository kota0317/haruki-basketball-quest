import assert from 'node:assert/strict';
import {prepareLocal,acknowledge} from '../cloud/outbox.mjs';
let n=0, id=()=>`id-${++n}`;
let original={sessions:[{date:'2026-11-18',kind:'英検',minutes:20},{date:'2026-11-18',kind:'英検',minutes:20}],answers:[{id:'v1',correct:false,time:Date.parse('2026-11-18T16:00:00Z')}],matches:[]};
let a=prepareLocal(original,'child',id);assert.equal(a.cloud.pending.length,3);assert.notEqual(a.sessions[0]._eventId,a.sessions[1]._eventId);assert.equal(a.cloud.pending[2].occurred_on,'2026-11-19');assert.equal(original.sessions[0]._eventId,undefined);
let b=prepareLocal(a,'child',id);assert.deepEqual(b.cloud.pending,a.cloud.pending);let c=acknowledge(b,b.cloud.pending[0].event_id);assert.equal(c.cloud.pending.length,2);assert.equal(prepareLocal(c,'child',id).cloud.pending.length,2);
assert.throws(()=>prepareLocal(c,'other',id),/another account/);assert.throws(()=>acknowledge(c,'missing'),/unknown event/);
console.log('PASS: stable outbox IDs, retry, account isolation, identical rows and JST date');
