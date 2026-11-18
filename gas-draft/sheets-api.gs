/* DRAFT: not deployed or verified with real family data. Requires quest-core.js. */
const HQ_MAX_OPS = 30;
function hqResponse(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  let input;
  try { input=JSON.parse(e.postData.contents); } catch (_) {return hqResponse({ok:false,error:'invalid_request'});}
  if (!input || typeof input !== 'object') return hqResponse({ok:false,error:'invalid_request'});
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(5000)) return hqResponse({ok:false,error:'busy'});
  try {
    const props=PropertiesService.getScriptProperties();
    const secret=props.getProperty('FAMILY_CODE');
    if (!HQSyncCore.familyCodeFormat(secret)) return hqResponse({ok:false,error:'not_configured'});
    const now=Date.now();
    if (Number(props.getProperty('LOCK_UNTIL')||0)>now) return hqResponse({ok:false,error:'unauthorized'});
    if (!HQSyncCore.familyCodeFormat(input.code) || input.code!==secret) {
      const failures=Number(props.getProperty('FAILURES')||0)+1;
      if (failures>=3) {props.setProperty('LOCK_UNTIL',String(now+30000)); props.deleteProperty('FAILURES');}
      else props.setProperty('FAILURES',String(failures));
      return hqResponse({ok:false,error:'unauthorized'});
    }
    props.deleteProperty('FAILURES'); props.deleteProperty('LOCK_UNTIL');
    if (!['getSnapshot','syncOperations'].includes(input.action)) return hqResponse({ok:false,error:'invalid_request'});
    if (input.action==='syncOperations' && (!Array.isArray(input.operations) || input.operations.length>HQ_MAX_OPS)) return hqResponse({ok:false,error:'invalid_request'});
    const id=props.getProperty('SHEET_ID');
    if (!id) return hqResponse({ok:false,error:'not_configured'});
    const sheet=SpreadsheetApp.openById(id).getSheetByName('SyncLog');
    if (!sheet) throw new Error('Missing SyncLog');
    let state=HQSyncCore.empty();
    const last=sheet.getLastRow();
    const rows=last>1 ? sheet.getRange(2,1,last-1,5).getValues() : [];
    for (const row of rows) {
      let op; try {op=JSON.parse(row[3]);} catch (_) {throw new Error('Corrupt operation log');}
      const next=HQSyncCore.apply(state,op);
      if (next.result.status!=='applied' || state.operations[op.id]) throw new Error('Invalid operation log');
      state=next.state;
    }
    const results=[];
    for (const op of input.action==='syncOperations' ? input.operations : []) {
      const previous=op && state.operations[op.id];
      const next=HQSyncCore.apply(state,op);
      if (next.result.status==='applied' && !previous) {
        sheet.appendRow([op.id,op.deviceId,op.type,JSON.stringify(op),new Date().toISOString()]);
        SpreadsheetApp.flush();
        state=next.state;
      }
      results.push({id:op && op.id,result:next.result});
    }
    return hqResponse({ok:true,snapshot:{revision:state.revision,tasks:state.tasks,completions:state.completions,history:state.history,xp:HQSyncCore.xp(state)},results});
  } catch (_) {return hqResponse({ok:false,error:'storage_error'});} finally {lock.releaseLock();}
}
