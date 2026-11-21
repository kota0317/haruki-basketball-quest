const clone = value => JSON.parse(JSON.stringify(value));
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const ARRAY_KEYS = ['sessions', 'answers', 'matches', 'learningEvents'];
const generationKey = '__hq_sync_generation';

export function canonicalState(value) {
  const result = clone(value || {});
  delete result[generationKey];
  result.sessions ||= [];
  result.answers ||= [];
  result.matches ||= [];
  result.settings ||= {};
  result.questData ||= { menus: [], completions: {} };
  result.questData.menus ||= [];
  result.questData.completions ||= {};
  for (const [key, completion] of Object.entries(result.questData.completions)) completion.eventId ||= `legacy:${key}`;
  result.learningEvents ||= [];
  return result;
}

function itemKey(record) {
  return record?.eventId || record?.legacyId || record?.recordId || record?.id || null;
}

function appendUnique(target, incoming) {
  const keys = new Map(target.map((row, index) => [itemKey(row), index]).filter(([key]) => key));
  const conflicts = [];
  for (const row of incoming) {
    const key = itemKey(row);
    if (!key || !keys.has(key)) {
      target.push(clone(row));
      if (key) keys.set(key, target.length - 1);
      continue;
    }
    const current = target[keys.get(key)];
    if (JSON.stringify(current) !== JSON.stringify(row)) conflicts.push({ key, kept: clone(current), incoming: clone(row) });
  }
  return conflicts;
}

export function importLegacy(currentValue, incomingValue) {
  const current = canonicalState(currentValue);
  const incoming = canonicalState(incomingValue);
  const audit = { xp: null, wordStreak: null, conflicts: [] };
  current.settings = { ...(incoming.settings || {}), ...(current.settings || {}) };

  // Keep a snapshot of the prior ledger values for reconciliation. Device totals
  // are never added to the D1 totals during a legacy import.
  const cloudBonus = Number(current.rpg?.bonusXP) || 0;
  const cloudStreak = Number(current.rpg?.wordStreak) || 0;
  const localBonus = Number(incoming.rpg?.bonusXP) || 0;
  const localStreak = Number(incoming.rpg?.wordStreak) || 0;
  const cloudProgression = current.xpProgression ? clone(current.xpProgression) : null;
  if (cloudBonus !== localBonus || cloudStreak !== localStreak) {
    audit.xp = { d1BonusXP: cloudBonus, deviceBonusXP: localBonus, d1Progression: cloudProgression,
      deviceProgression: incoming.xpProgression ? clone(incoming.xpProgression) : null };
    audit.wordStreak = { d1: cloudStreak, device: localStreak,
      d1Date: current.rpg?.streakDate || null, deviceDate: incoming.rpg?.streakDate || null };
  }

  const menus = new Map(current.questData.menus.map(menu => [menu.id, menu]));
  for (const menu of incoming.questData.menus) {
    const existing = menus.get(menu.id);
    if (!existing) { current.questData.menus.push(clone(menu)); menus.set(menu.id, menu); }
    else if (JSON.stringify(existing) !== JSON.stringify(menu)) {
      // Keep the D1 menu as the active item, and preserve the device version in
      // the migration audit instead of silently selecting or discarding it.
      audit.conflicts.push({ kind: 'menu', id: menu.id, d1: clone(existing), device: clone(menu) });
    }
  }
  for (const [key, completion] of Object.entries(incoming.questData.completions)) {
    if (!own(current.questData.completions, key)) current.questData.completions[key] = clone(completion);
    else if (JSON.stringify(current.questData.completions[key]) !== JSON.stringify(completion))
      audit.conflicts.push({ kind: 'completion', id: key, d1: clone(current.questData.completions[key]), device: clone(completion) });
  }

  for (const key of ARRAY_KEYS) audit.conflicts.push(...appendUnique(current[key], incoming[key]).map(row => ({ kind: key, ...row })));

  current.eikenDaily ||= { days: {} };
  current.eikenDaily.days ||= {};
  for (const [date, sections] of Object.entries(incoming.eikenDaily?.days || {})) {
    current.eikenDaily.days[date] ||= {};
    for (const [section, value] of Object.entries(sections || {})) {
      if (current.eikenDaily.days[date][section] === undefined) current.eikenDaily.days[date][section] = clone(value);
      else if (JSON.stringify(current.eikenDaily.days[date][section]) !== JSON.stringify(value))
        audit.conflicts.push({ kind: 'eikenDaily', date, section, d1: clone(current.eikenDaily.days[date][section]), device: clone(value) });
    }
  }

  // Non-derived game collections can be unioned. Derived score and progression
  // fields stay D1 authoritative and the local values above remain auditable.
  current.rpg ||= {};
  const incomingRpg = incoming.rpg || {};
  for (const key of ['awards', 'unlocked', 'titles']) {
    current.rpg[key] ||= {};
    for (const [id, value] of Object.entries(incomingRpg[key] || {})) {
      if (!own(current.rpg[key], id)) current.rpg[key][id] = clone(value);
      else if (JSON.stringify(current.rpg[key][id]) !== JSON.stringify(value))
        audit.conflicts.push({ kind: `rpg.${key}`, id, d1: clone(current.rpg[key][id]), device: clone(value) });
    }
  }
  current.rpg.plays ||= [];
  audit.conflicts.push(...appendUnique(current.rpg.plays, incomingRpg.plays || []).map(row => ({ kind: 'rpg.plays', ...row })));
  for (const key of ['settings']) {
    current.rpg[key] ||= {};
    for (const [id, value] of Object.entries(incomingRpg[key] || {})) {
      if (!own(current.rpg[key], id)) current.rpg[key][id] = clone(value);
      else if (JSON.stringify(current.rpg[key][id]) !== JSON.stringify(value))
        audit.conflicts.push({ kind: `rpg.${key}`, id, d1: clone(current.rpg[key][id]), device: clone(value) });
    }
  }
  for (const key of ['giantWins']) {
    const cloud = Number(current.rpg[key]) || 0, device = Number(incomingRpg[key]) || 0;
    if (cloud !== device) audit.conflicts.push({ kind: `rpg.${key}`, d1: cloud, device });
    current.rpg[key] = Math.max(cloud, device);
    current.rpg.giantWinEvents ||= {};
    const eventTotal = Object.values(current.rpg.giantWinEvents).reduce((total, row) => total + (Number(row?.delta) || 0), 0);
    current.rpg.giantWinsBase = Math.max(Number(current.rpg.giantWinsBase) || 0, current.rpg[key] - eventTotal);
  }
  current.rpg.bonusXP = cloudBonus;
  current.rpg.wordStreak = cloudStreak;
  if (current.rpg.streakDate === undefined && incomingRpg.streakDate) current.rpg.streakDate = incomingRpg.streakDate;
  if (cloudProgression) current.xpProgression = cloudProgression;
  else if (incoming.xpProgression) current.xpProgression = clone(incoming.xpProgression);
  current.rpg.legacyBonusBase = Number(current.rpg.legacyBonusBase ?? cloudBonus) || 0;
  rebaseXp(current);
  current.migrationAudit ||= [];
  if (audit.xp || audit.wordStreak || audit.conflicts.length) current.migrationAudit.push(audit);
  return { state: current, audit };
}

function rebaseXp(state, newAward = 0) {
  const completions = Object.values(state.questData?.completions || {});
  const questXP = completions.reduce((total, row) => total + Math.max(0, Number(row?.xp) || 0), 0);
  const rpg = state.rpg ||= {};
  const currentBonus = Math.max(0, Number(rpg.bonusXP) || 0) + Math.max(0, Number(newAward) || 0);
  const prior = state.xpProgression || { version: 1, baseLevel: 1, baseQuestXP: 0, baseBonusXP: 0, carryXP: 0 };
  let remaining = Math.max(0, Number(prior.carryXP) || 0)
    + questXP - (Number(prior.baseQuestXP) || 0)
    + currentBonus - (Number(prior.baseBonusXP) || 0);
  let level = Math.max(1, Number(prior.baseLevel) || 1);
  const requirement = value => Math.ceil(120 * Math.pow(1.05, Math.max(0, value - 1)));
  for (let guard = 0; guard < 1000 && remaining >= requirement(level); guard++) { remaining -= requirement(level); level++; }
  for (let guard = 0; guard < 1000 && remaining < 0 && level > 1; guard++) { level--; remaining += requirement(level); }
  remaining = Math.max(0, remaining);
  rpg.bonusXP = currentBonus;
  state.xpProgression = { version: 1, baseLevel: level, baseQuestXP: questXP, baseBonusXP: currentBonus, carryXP: remaining };
}

export function applyOperation(stateValue, operation) {
  const state = canonicalState(stateValue);
  const payload = operation.payload || {};
  const conflict = current => ({ status: 'conflict', current: current === undefined ? null : clone(current) });
  const applied = () => ({ status: 'applied' });
  switch (operation.type) {
    case 'state.patch': {
      if (!Array.isArray(payload.changes) || payload.changes.length > 100) throw new Error('invalid_patch');
      let next = state;
      for (const change of payload.changes) {
        const result = applyOperation(next, change);
        if (result.status === 'conflict') return result;
        next = result.state || next;
      }
      return { status: 'applied', state: next };
    }
    case 'sync.verify':
      return { status: 'applied', state };
    case 'rpg.flag': {
      if (!['unlocked', 'titles'].includes(payload.collection) || typeof payload.key !== 'string' || !payload.key || payload.value !== true) throw new Error('invalid_flag');
      state.rpg ||= {};state.rpg[payload.collection] ||= {};
      state.rpg[payload.collection][payload.key] = true;
      return { status: 'applied', state };
    }
    case 'rpg.increment': {
      if (payload.counter !== 'giantWins' || !Number.isSafeInteger(payload.delta) || payload.delta < 1 || payload.delta > 100) throw new Error('invalid_counter');
      state.rpg ||= {};state.rpg.giantWinEvents ||= {};
      const prior = state.rpg.giantWinEvents[operation.id];
      if (prior) return prior.delta === payload.delta ? applied() : conflict(prior);
      state.rpg.giantWinEvents[operation.id] = { delta: payload.delta, createdAt: payload.createdAt || null };
      state.rpg.giantWinsBase ??= Math.max(0, Number(state.rpg.giantWins) || 0);
      state.rpg.giantWins = Number(state.rpg.giantWinsBase) + Object.values(state.rpg.giantWinEvents).reduce((total, row) => total + (Number(row?.delta) || 0), 0);
      return { status: 'applied', state };
    }
    case 'quest.upsert': {
      const menu = payload.menu;
      if (!menu || typeof menu.id !== 'string') throw new Error('invalid_menu');
      const index = state.questData.menus.findIndex(item => item.id === menu.id);
      const current = index < 0 ? undefined : state.questData.menus[index];
      if (payload.expectedUpdatedAt !== undefined && (current?.updatedAt ?? null) !== payload.expectedUpdatedAt) return conflict(current);
      if (current && JSON.stringify(current) === JSON.stringify(menu)) return applied();
      if (index < 0) state.questData.menus.push(clone(menu)); else state.questData.menus[index] = clone(menu);
      return { status: 'applied', state };
    }
    case 'quest.delete': {
      const index = state.questData.menus.findIndex(item => item.id === payload.id);
      if (index < 0) return applied();
      const current = state.questData.menus[index];
      if ((current.updatedAt ?? null) !== (payload.expectedUpdatedAt ?? null)) return conflict(current);
      state.questData.menus[index] = { ...current, deleted: true, updatedAt: payload.updatedAt };
      return { status: 'applied', state };
    }
    case 'quest.complete': {
      const { key, completion } = payload;
      if (typeof key !== 'string' || !completion || typeof completion.id !== 'string') throw new Error('invalid_completion');
      const current = state.questData.completions[key];
      if (current) return JSON.stringify(current) === JSON.stringify(completion) ? applied() : conflict(current);
      state.questData.completions[key] = clone(completion);
      rebaseXp(state);
      return { status: 'applied', state };
    }
    case 'quest.undo': {
      const current = state.questData.completions[payload.key];
      if (!current) return applied();
      if (current.eventId !== payload.expectedEventId) return conflict(current);
      delete state.questData.completions[payload.key];
      rebaseXp(state);
      return { status: 'applied', state };
    }
    case 'record.append': {
      const validCollection = ARRAY_KEYS.includes(payload.collection) || payload.collection === 'rpg.plays';
      if (!validCollection || !payload.record || !itemKey(payload.record)) throw new Error('invalid_record');
      if (payload.collection === 'rpg.plays') state.rpg ||= {};
      const rows = payload.collection === 'rpg.plays' ? (state.rpg.plays ||= []) : state[payload.collection];
      const key = itemKey(payload.record);
      const current = rows.find(item => itemKey(item) === key);
      if (current) return JSON.stringify(current) === JSON.stringify(payload.record) ? applied() : conflict(current);
      rows.push(clone(payload.record));
      if (payload.collection === 'learningEvents' && ['enjp', 'jpen'].includes(payload.record.type)) {
        // The exact D1 streak is a legacy baseline; new answer events are
        // represented independently and never merge a terminal's counter.
        state.rpg ||= {};
        state.rpg.wordAnswerEvents ||= {};
        state.rpg.wordAnswerEvents[payload.record.eventId] = { date: payload.record.date, correct: !!payload.record.correct, time: Number(payload.record.time) || 0 };
        const date = payload.record.date;
        if (!state.rpg.streakDate || date > state.rpg.streakDate) {
          state.rpg.streakDate = date;
          state.rpg.wordStreak = payload.record.correct ? 1 : 0;
        } else if (date === state.rpg.streakDate) {
          state.rpg.wordStreak = payload.record.correct ? (Number(state.rpg.wordStreak) || 0) + 1 : 0;
        }
      }
      return { status: 'applied', state };
    }
    case 'rpg.award': {
      if (typeof payload.awardId !== 'string' || !payload.awardId || !Number.isSafeInteger(payload.xp) || payload.xp < 0 || payload.xp > 10000) throw new Error('invalid_award');
      state.rpg ||= {};
      state.rpg.bonusEvents ||= {};
      const prior = state.rpg.bonusEvents[payload.awardId];
      if (prior) return prior.xp === payload.xp ? applied() : conflict(prior);
      state.rpg.bonusEvents[payload.awardId] = { xp: payload.xp, eventId: operation.id, createdAt: payload.createdAt || null };
      state.rpg.eventBonusXP = Object.values(state.rpg.bonusEvents).reduce((total, row) => total + (Number(row.xp) || 0), 0);
      state.rpg.bonusXP = (Number(state.rpg.legacyBonusBase) || 0) + state.rpg.eventBonusXP;
      rebaseXp(state, 0);
      return { status: 'applied', state };
    }
    case 'state.set': {
      const { path, value, expected } = payload;
      if (!Array.isArray(path) || !path.length || !['settings', 'eikenDaily', 'activeMatch', 'rpg'].includes(path[0])) throw new Error('invalid_state_path');
      if (path[0] === 'rpg' && ['bonusXP', 'wordStreak', 'awards', 'bonusEvents', 'legacyBonusBase', 'eventBonusXP', 'giantWinsBase', 'giantWinEvents'].includes(path[1])) throw new Error('derived_state');
      if (path.length === 1 && path[0] === 'activeMatch') {
        if (JSON.stringify(state.activeMatch) !== JSON.stringify(expected)) return conflict(state.activeMatch);
        if (value === undefined) delete state.activeMatch; else state.activeMatch = clone(value);
        return { status: 'applied', state };
      }
      if (path.length < 2) throw new Error('invalid_state_path');
      let target = state;
      for (const key of path.slice(0, -1)) { if (!target[key] || typeof target[key] !== 'object') target[key] = {}; target = target[key]; }
      const key = path.at(-1);
      const current = own(target, key) ? target[key] : undefined;
      if (JSON.stringify(current) !== JSON.stringify(expected)) return conflict(current);
      if (value === undefined) delete target[key]; else target[key] = clone(value);
      return { status: 'applied', state };
    }
    default:
      throw new Error('unsupported_operation');
  }
}
