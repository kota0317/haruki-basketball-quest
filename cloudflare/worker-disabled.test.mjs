import assert from 'node:assert/strict';
import worker from './worker-disabled.mjs';
for (const method of ['GET','POST','OPTIONS','DELETE']) {
  const r=await worker.fetch(new Request('https://example.invalid/sync',{method}));
  assert.equal(r.status,503);
  assert.equal((await r.json()).error,'sync_not_configured');
  assert.equal(r.headers.get('access-control-allow-origin'),null);
}
console.log('PASS unconfigured Worker denies every method');
