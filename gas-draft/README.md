# Apps Script sync draft — not for production

This branch includes an unverified Apps Script API draft. It is not deployed, not connected to the existing app and must not be used for real family data. A separate test-only spreadsheet has been created; the deployed synthetic gateway does not access it.

Run `node gas-draft/quest-core.test.cjs` and `node gas-draft/sheets-api.test.cjs`. The latter uses mocked Apps Script/Sheets; it does not demonstrate actual persistence.

The draft API validates a five-digit string stored in Script Properties, reads an operation log from a private Sheet, serializes writes using a script lock, handles retries and per-record conflicts, and projects XP from current completion records. It uses a global temporary lock after wrong codes: this can delay legitimate users. It currently lacks safe migration, legacy records and game synchronization, client/UI, offline queue, testing with actual Apps Script Sheets access, and required release approval. The sample sheet and test script do not contain the family code.

The Google authorization screen currently says this app is unverified. Authorization and live test have not been completed. The previous production Supabase safety rejection is separate and must not be bypassed.
