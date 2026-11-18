# GAS sync: isolated model only

This draft is not connected to Sheets, Apps Script, the app, or real data.
Do not deploy or use it for family data. The previous Supabase PR remains separate.

Run `node gas-draft/quest-core.test.cjs`.

The model demonstrates duplicate operation handling, per-record revision conflict detection,
completion undo and XP calculation. It does not implement migration, real authentication,
durable storage, cross-device queueing, legacy data merging, or the game integration.
A stale edit must be retained on-device and resolved by the client; it is never silently discarded.

Apps Script web-app request events do not provide a documented trustworthy client IP.
Rate-limiting a caller-supplied device ID can be evaded by changing that ID.
An attacker can continue trying the fixed five-digit code if there is no shared limit or an
independent abuse-control mechanism. A global lock is a denial-of-service risk.
A solution satisfying the request's limits must be verified before handling real records.

Formula safety, secret provisioning, random device credentials, revocation, crash-safe
persistence, and real Sheets concurrency remain unresolved and untested.
The earlier automated rejection applies to production Supabase changes;
this independent draft does not constitute approval for a real-data deployment.
