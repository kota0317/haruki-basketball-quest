/* Isolated data model; not an API, not connected to real user data. */
'use strict';
const HQSyncCore = (() => {
  const copy = x => JSON.parse(JSON.stringify(x));
  const idOK = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(x) && !['__proto__','constructor','prototype'].includes(x);
  const dateOK = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x+'T00:00:00Z')) && new Date(x+'T00:00:00Z').toISOString().slice(0,10) === x;
  const integer = (x, min, max) => Number.isInteger(x) && x >= min && x <= max;
  const text = (x, max) => typeof x === 'string' && x.length <= max;
  const empty = () => ({version: 1, revision: 0, tasks: {}, completions: {}, operations: {}, history: []});
  function validTask(v, key) {
    return v && v.id === key && text(v.title,120) && v.title.trim() && text(v.note || '',160) && ['国語','数学','英語','理科','社会','その他'].includes(v.subject) && dateOK(v.date) && ['none','daily','weekly'].includes(v.repeat) && Array.isArray(v.weekdays) && v.weekdays.every(x=>integer(x,0,6)) && (v.repeat !== 'weekly' || v.weekdays.length) && integer(v.minutes,1,300) && integer(v.xp,1,500) && Number.isFinite(v.order) && ['英検','学校'].includes(v.kind) && (v.deleted === undefined || typeof v.deleted === 'boolean');
  }
  function apply(original, op) {
    if (!op || !idOK(op.id) || !idOK(op.deviceId) || !idOK(op.taskId) || !integer(op.expectedRevision,0,Number.MAX_SAFE_INTEGER) || !['task','completion'].includes(op.type)) return {state: original, result: {status:'invalid'}};
    const old = original.operations[op.id];
    if (old) return {state: original, result: old.fingerprint === JSON.stringify(op) ? copy(old.result) : {status:'operation_id_reused'}};
    const key = op.type === 'task' ? op.taskId : op.taskId + '@' + op.date;
    if (op.type === 'completion' && (!dateOK(op.date) || (op.value !== null && (!op.value || !integer(op.value.minutes,1,300) || !integer(op.value.xp,1,500))))) return {state:original,result:{status:'invalid'}};
    if (op.type === 'task' && !validTask(op.value, op.taskId)) return {state:original,result:{status:'invalid'}};
    const collection = op.type === 'task' ? original.tasks : original.completions;
    const current = collection[key];
    if ((current ? current.revision : 0) !== op.expectedRevision) return {state:original,result:{status:'conflict',current: current ? copy(current) : null}};
    if (op.type === 'completion' && (!original.tasks[op.taskId] || original.tasks[op.taskId].value.deleted)) return {state:original,result:{status:'invalid'}};
    const state = copy(original), revision = ++state.revision;
    const target = op.type === 'task' ? state.tasks : state.completions;
    const value = op.type === 'completion' && op.value !== null ? {minutes:op.value.minutes,xp:op.value.xp} : copy(op.value);
    target[key] = {revision,value};
    const result = {status:'applied', revision};
    state.history.push({id:op.id,deviceId:op.deviceId,type:op.type,key,revision});
    state.operations[op.id] = {fingerprint:JSON.stringify(op),result};
    return {state,result};
  }
  function xp(state) {return Object.values(state.completions).reduce((n,x)=>n+(x.value ? x.value.xp : 0),0)}
  return {empty,apply,xp};
})();
if (typeof module !== 'undefined') module.exports = HQSyncCore;
