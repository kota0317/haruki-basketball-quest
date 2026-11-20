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
  const api = { inspect };
  if (typeof module !== 'undefined') module.exports = api;
  else root.HQMigrationPreview = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
