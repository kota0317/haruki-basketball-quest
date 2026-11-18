// Synthetic proof only: no spreadsheet or real family data. Not deployed.
function doPost(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return reply_({ok:false,error:'busy'});
  try {
    var props = PropertiesService.getScriptProperties();
    var now = Date.now(), until = Number(props.getProperty('TEST_LOCK_UNTIL') || 0);
    if (now < until) return reply_({ok:false,error:'locked'});
    var parsed;
    try { parsed = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (_) { parsed = {}; }
    var input = typeof parsed.code === 'string' ? parsed.code : '';
    var configured = props.getProperty('TEST_ONLY_CODE') || '';
    var valid = /^\\d{4}$/.test(input) && /^\\d{4}$/.test(configured);
    var diff = 0;
    for (var i = 0; i < 4; i++) diff |= (input.charCodeAt(i) || 0) ^ (configured.charCodeAt(i) || 0);
    if (!valid || diff !== 0) {
      var failures = Number(props.getProperty('TEST_FAILURES') || 0) + 1;
      if (failures >= 3) { props.setProperty('TEST_LOCK_UNTIL', String(now + 30000)); failures = 0; }
      props.setProperty('TEST_FAILURES', String(failures));
      return reply_({ok:false,error:'denied'});
    }
    props.deleteProperty('TEST_FAILURES'); props.deleteProperty('TEST_LOCK_UNTIL');
    return reply_({ok:true});
  } finally { lock.releaseLock(); }
}
function reply_(v) { return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON); }
