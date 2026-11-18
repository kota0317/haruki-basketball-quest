// Independent preparation for cloud migration. Not connected to the live app.
// The caller must persist the entire returned object atomically before upload.
export function prepareLocal(state, ownerId, makeId) {
  if (!state || !ownerId || typeof makeId !== 'function') throw Error('invalid input');
  const next = structuredClone(state);
  next.cloud = next.cloud || { ownerId, pending: [] };
  if (next.cloud.ownerId !== ownerId) throw Error('local records are bound to another account');
  if (!Array.isArray(next.cloud.pending)) throw Error('invalid outbox');
  const seen = new Set(next.cloud.pending.map(e => e.event_id));
  for (const [key, kind] of [['sessions','study_session'],['answers','answer'],['matches','match']]) {
    if (!Array.isArray(next[key])) throw Error('invalid local data');
    for (const row of next[key]) {
      if (!row._eventId) row._eventId = makeId();
      if (!seen.has(row._eventId) && !row._cloudAcknowledged) {
        const payload = {...row}; delete payload._eventId; delete payload._cloudAcknowledged;
        const time = typeof row.time === 'number' ? new Date(row.time) : null;
        const day = row.date || (time ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(time) : null);
        if (!day) throw Error('record has no recoverable date');
        next.cloud.pending.push({learner_id:ownerId,event_id:row._eventId,event_type:kind,occurred_at:time ? time.toISOString():null,occurred_on:day,schema_version:1,payload});
        seen.add(row._eventId);
      }
    }
  }
  return next;
}
export function acknowledge(state, eventId) {
  const next=structuredClone(state);
  if (!next.cloud?.pending?.some(x => x.event_id === eventId)) throw Error('unknown event');
  for (const key of ['sessions','answers','matches']) for(const row of next[key]) if(row._eventId === eventId) row._cloudAcknowledged=true;
  next.cloud.pending=next.cloud.pending.filter(x => x.event_id !== eventId);
  return next;
}
