/* Offline-only migration inspection. Never writes storage or contacts a server. */
'use strict';
(function (root) {
  function inspect(raw) {
    if (typeof raw !== 'string') throw new Error('Expected a JSON backup');
    let value;
    try { value = JSON.parse(raw); } catch { throw new Error('Invalid backup JSON; original remains untouched'); }
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        !Array.isArray(value.sessions) || !Array.isArray(value.answers) ||
        !Array.isArray(value.matches) || !value.settings || typeof value.settings !== 'object' || Array.isArray(value.settings)) {
      throw new Error('Unrecognized backup; original remains untouched');
    }
    const q = value.questData;
    if (q !== undefined && (!q || typeof q !== 'object' || Array.isArray(q) || !Array.isArray(q.menus) || !q.completions || typeof q.completions !== 'object' || Array.isArray(q.completions))) {
      throw new Error('Unrecognized quest data; original remains untouched');
    }
    return {
      // The entire original string must be retained verbatim; unknown fields can matter.
      original: raw,
      counts: { sessions: value.sessions.length, answers: value.answers.length, matches: value.matches.length,
        menus: q ? q.menus.length : 0, completions: q ? Object.keys(q.completions).length : 0 },
      warnings: [
        'Legacy sessions and matches do not have reliable unique IDs; cross-device duplicates require review.',
        'No import, merge, deletion, or upload has occurred.'
      ]
    };
  }
  // Compare two exported backups entirely on the device. A difference is not
  // automatically data loss; report it for review without changing either file.
  function compare(beforeRaw,afterRaw){
    inspect(beforeRaw);inspect(afterRaw);
    const before=JSON.parse(beforeRaw),after=JSON.parse(afterRaw);
    const stable=x=>{if(Array.isArray(x))return '['+x.map(stable).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';return JSON.stringify(x)};
    const missingArray=(a,b)=>{const pool=new Map();for(const x of b){const k=stable(x);pool.set(k,(pool.get(k)||0)+1)}let n=0;for(const x of a){const k=stable(x),count=pool.get(k)||0;if(count)pool.set(k,count-1);else n++}return n};
    const summary=x=>{const out={sessions:x.sessions.length,minutes:x.sessions.reduce((n,s)=>n+(Number(s.minutes)||0),0),answers:x.answers.length,matches:x.matches.length,menus:(x.questData?.menus||[]).length,completions:Object.keys(x.questData?.completions||{}).length,questXP:Object.values(x.questData?.completions||{}).reduce((n,c)=>n+(Number(c?.xp)||0),0),bonusXP:Math.max(0,Number(x.rpg?.bonusXP)||0),plays:(x.rpg?.plays||[]).length};out.level=1+Math.floor(out.minutes/120)+Math.floor((out.questXP+out.bonusXP)/120);return out};
    const bm=before.questData?.menus||[],am=after.questData?.menus||[];
    const byId=new Map(am.map(x=>[x.id,x]));
    const menus=bm.filter(x=>!byId.has(x.id)).map(x=>String(x.id));
    const deletion=bm.filter(x=>byId.has(x.id)&&!!x.deleted!==!!byId.get(x.id).deleted).map(x=>String(x.id));
    const bc=before.questData?.completions||{},ac=after.questData?.completions||{};
    const missingCompletions=Object.keys(bc).filter(k=>!Object.hasOwn(ac,k));
    const changedCompletions=Object.keys(bc).filter(k=>Object.hasOwn(ac,k)&&stable(bc[k])!==stable(ac[k]));
    const awardMissing=Object.keys(before.rpg?.awards||{}).filter(k=>!Object.hasOwn(after.rpg?.awards||{},k));
    return {before:summary(before),after:summary(after),missingMenuIds:menus,changedDeletionIds:deletion,missingCompletionIds:missingCompletions,changedCompletionIds:changedCompletions,missingAwardIds:awardMissing,missingSessions:missingArray(before.sessions,after.sessions),missingAnswers:missingArray(before.answers,after.answers),missingMatches:missingArray(before.matches,after.matches),gameChanged:stable(before.rpg??null)!==stable(after.rpg??null),eikenChanged:stable(before.eikenDaily??null)!==stable(after.eikenDaily??null),otherFieldsChanged:Object.keys(before).filter(k=>!['sessions','answers','matches','questData','rpg','eikenDaily'].includes(k)&&stable(before[k])!==stable(after[k]))};
  }
  const api = { inspect, compare };
  if (typeof module !== 'undefined') module.exports = api;
  else root.HQMigrationPreview = api;
})(typeof globalThis === 'undefined' ? this : globalThis);

