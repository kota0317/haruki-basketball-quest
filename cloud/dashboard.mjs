// Pure aggregation: accepts only events returned under the caller's RLS policy.
export function summarize(events, questions, today) {
  const types = new Map(questions.map(q => [q.id, q.type]));
  const days = new Map(), topics = new Map(), latest = new Map();
  let reviews = 0, matches = 0;
  for (const event of events) {
    const row = event.payload || {}, day = event.occurred_on;
    if (event.event_type === 'study_session' && Number.isFinite(row.minutes) && row.minutes > 0) {
      let totals = days.get(day) || {英検:0, 学校:0};
      if (row.kind === '英検' || row.kind === '学校') totals[row.kind] += row.minutes;
      days.set(day,totals);
    }
    if (event.event_type === 'answer') {
      if (row.first) { let category = types.get(row.id) || 'その他'; let v=topics.get(category)||{correct:0,total:0};v.total++;if(row.correct)v.correct++;topics.set(category,v); }
      else reviews++;
      let prev=latest.get(row.id);if(!prev || (row.time || 0) > (prev.time || 0)) latest.set(row.id,row);
    }
    if (event.event_type === 'match') matches++;
  }
  const due=[...latest.values()].filter(x=>x.due&&x.due<=today).length;
  let streak=0, current=new Date(today+'T00:00:00Z');
  for(let i=0;i<3660;i++){const d=current.toISOString().slice(0,10),v=days.get(d);if(!v || v.英検+v.学校===0)break;streak++;current.setUTCDate(current.getUTCDate()-1)}
  return {days:[...days].sort(([a],[b])=>b.localeCompare(a)), topics:[...topics],due,reviews,matches,streak,mockExams:events.filter(e=>e.event_type==='mock_exam').map(e=>e.payload)};
}
