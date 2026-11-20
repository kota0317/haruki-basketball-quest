/* Draft queue for Cloudflare sync. Not connected to the application. */
'use strict';
const HQOfflineQueue = (() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function create(storage, key) {
    function read() {
      const raw = storage.getItem(key);
      if (raw === null) return { version: 1, operations: [] };
      const value = JSON.parse(raw);
      if (!value || value.version !== 1 || !Array.isArray(value.operations)) throw new Error('Invalid sync queue; preserved for recovery');
      return value;
    }
    function write(value) { storage.setItem(key, JSON.stringify(value)); }
    function enqueue(op) {
      if (!op || typeof op.id !== 'string' || !op.id || !op.type) throw new Error('Invalid operation');
      const state = read();
      const old = state.operations.find(item => item.operation.id === op.id);
      if (old) {
        if (JSON.stringify(old.operation) !== JSON.stringify(op)) throw new Error('Operation ID reused');
        return;
      }
      state.operations.push({ operation: clone(op), status: 'pending' });
      write(state);
    }
    // Remove only operations acknowledged by the server; never discard conflicts.
    function applyResults(results) {
      if (!Array.isArray(results)) throw new Error('Invalid results');
      const byId = Object.create(null);
      for (const row of results) {
        if (!row || typeof row.id !== 'string' || has(byId, row.id) || !row.result || typeof row.result.status !== 'string') throw new Error('Invalid results');
        byId[row.id] = row.result;
      }
      const state = read();
      state.operations = state.operations.filter(item => {
        const result = byId[item.operation.id];
        if (!result) return true;
        if (result.status === 'applied') return false;
        if (result.status === 'conflict') { item.status = 'conflict'; item.server = clone(result.current === undefined ? null : result.current); }
        return true;
      });
      write(state);
    }
    function pending(limit = 30) { return clone(read().operations.filter(x => x.status === 'pending').slice(0, limit).map(x => x.operation)); }
    function inspect() { return clone(read()); }
    return { enqueue, applyResults, pending, inspect };
  }
  return { create };
})();
if (typeof module !== 'undefined') module.exports = HQOfflineQueue;
