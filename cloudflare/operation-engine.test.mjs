import assert from 'node:assert/strict';
import { applyOperation, importLegacy } from './operation-engine.mjs';

const cloud = {
  sessions: [], answers: [], matches: [], learningEvents: Array.from({ length: 23 }, (_, i) => ({ eventId: `d1-${i}`, type: 'enjp' })),
  settings: {}, questData: { menus: Array.from({ length: 5 }, (_, i) => ({ id: `q${i}`, title: `Quest ${i}` })), completions: {} },
  rpg: { bonusXP: 100, wordStreak: 13, streakDate: '2026-11-21', awards: {} },
  xpProgression: { version: 1, baseLevel: 1, baseQuestXP: 0, baseBonusXP: 100, carryXP: 100 }
};
const device = {
  sessions: [{ legacyId: 'device:session:0', date: '2026-11-21', minutes: 65 }], answers: [], matches: [],
  learningEvents: [{ eventId: 'device-eiken-1', type: 'jpen' }], settings: {},
  questData: {
    menus: cloud.questData.menus.map(x => ({ ...x })),
    completions: Object.fromEntries([0, 1, 2].map(i => [`q${i}@2026-11-21`, { id: `q${i}`, eventId: `c${i}`, date: '2026-11-21', minutes: 10, xp: 10 }]))
  },
  rpg: { bonusXP: 85, wordStreak: 1, streakDate: '2026-11-21', awards: {} },
  xpProgression: { version: 1, baseLevel: 1, baseQuestXP: 0, baseBonusXP: 85, carryXP: 85 }
};

const imported = importLegacy(cloud, device);
assert.equal(imported.state.questData.menus.length, 5);
assert.equal(Object.keys(imported.state.questData.completions).length, 3);
assert.equal(Object.values(imported.state.questData.completions).reduce((n, x) => n + x.minutes, 0) + imported.state.sessions.reduce((n, x) => n + x.minutes, 0), 95);
assert.equal(Object.values(imported.state.questData.completions).reduce((n, x) => n + x.xp, 0), 30);
assert.equal(imported.state.learningEvents.length, 24);
assert.equal(imported.state.rpg.bonusXP, 100);
assert.equal(imported.state.rpg.wordStreak, 13);
assert.equal(imported.state.xpProgression.carryXP, 10);
assert.deepEqual(imported.audit.xp && [imported.audit.xp.d1BonusXP, imported.audit.xp.deviceBonusXP], [100, 85]);
assert.deepEqual(imported.audit.wordStreak && [imported.audit.wordStreak.d1, imported.audit.wordStreak.device], [13, 1]);

const state = { ...cloud, questData: { menus: [], completions: {} } };
const completion = { id: 'q1', eventId: 'done-1', date: '2026-11-21', minutes: 10, xp: 10 };
const add = { id: 'op-1', type: 'quest.complete', payload: { key: 'q1@2026-11-21', completion } };
const first = applyOperation(state, add);
assert.equal(first.status, 'applied');
const after = applyOperation(first.state, add);
assert.equal(after.status, 'applied', 'retrying the same operation is idempotent');
assert.equal(Object.keys(first.state.questData.completions).length, 1);
assert.equal(applyOperation(first.state, { ...add, payload: { key: 'q1@2026-11-21', completion: { ...completion, xp: 20 } } }).status, 'conflict');

const menuState = { ...state, questData: { menus: [{ id: 'q1', title: 'new', updatedAt: '2' }], completions: {} } };
assert.equal(applyOperation(menuState, { id: 'op-2', type: 'quest.upsert', payload: { menu: { id: 'q1', title: 'old' }, expectedUpdatedAt: '1' } }).status, 'conflict');
const undo = applyOperation({ ...state, questData: { menus: [], completions: { 'q1@2026-11-21': completion } } },
  { id: 'op-3', type: 'quest.undo', payload: { key: 'q1@2026-11-21', expectedEventId: 'stale' } });
assert.equal(undo.status, 'conflict', 'a stale undo cannot remove a newer completion');
const undoApplied = applyOperation(first.state,
  { id: 'op-4', type: 'quest.undo', payload: { key: 'q1@2026-11-21', expectedEventId: 'done-1' } });
assert.equal(undoApplied.status, 'applied');
assert.equal(Object.keys(undoApplied.state.questData.completions).length, 0);
assert.equal(undoApplied.state.xpProgression.baseLevel, 1);
assert.equal(undoApplied.state.xpProgression.carryXP, 100, 'undo removes the completion XP from the canonical total');
const winOne = applyOperation(cloud, { id: 'game-win-0001', type: 'rpg.increment', payload: { counter: 'giantWins', delta: 1 } });
const winTwo = applyOperation(winOne.state, { id: 'game-win-0002', type: 'rpg.increment', payload: { counter: 'giantWins', delta: 1 } });
assert.equal(winTwo.state.rpg.giantWins, 2, 'concurrent game wins are additive events');
const flag = applyOperation(winTwo.state, { id: 'game-flag-0001', type: 'rpg.flag', payload: { collection: 'unlocked', key: 'dunk', value: true } });
assert.equal(flag.state.rpg.unlocked.dunk, true);
const eikenDate='2026-11-22';
const eikenFirst={original:['enjp:1','jpen:2'],index:0,retry:[],phase:'first',wrong:0,complete:false};
const eikenDone={original:['enjp:1','jpen:2'],index:0,retry:[],phase:'retry',wrong:2,complete:true};
const eikenCloud={eikenDaily:{days:{[eikenDate]:{words:eikenDone}}}};
const staleEiken=applyOperation(eikenCloud,{id:'eiken-stale-0001',type:'state.set',payload:{path:['eikenDaily','days',eikenDate,'words'],expected:eikenFirst,value:{...eikenFirst,index:1}}});
assert.equal(staleEiken.status,'applied','a stale incomplete phone state is safely reconciled with completed D1 progress');
assert.equal(staleEiken.state.eikenDaily.days[eikenDate].words.complete,true,'D1 completion remains authoritative');
assert.equal(staleEiken.state.eikenDaily.days[eikenDate].words.wrong,2,'D1 review mistakes remain');
const unsafeEiken=applyOperation({eikenDaily:{days:{[eikenDate]:{words:{...eikenFirst,index:2}}}}},{id:'eiken-unsafe-0001',type:'state.set',payload:{path:['eikenDaily','days',eikenDate,'words'],expected:eikenFirst,value:{...eikenFirst,index:1}}});
assert.equal(unsafeEiken.status,'conflict','divergent incomplete practice states remain protected for explicit review');
assert.equal(unsafeEiken.current.index,2);
console.log('PASS legacy conservation, audit-only disagreements, idempotency, stale edit protection, XP-correct undo and additive game progress');
