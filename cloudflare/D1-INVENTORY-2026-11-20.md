# D1 free-tier inventory and reuse outcome

Inventory was performed with GitHub Actions using read-only Cloudflare API calls on 2026-11-20. The D1 query endpoint received SELECT statements only. No database or Worker configuration was changed by the inventory.

Cloudflare returned **10 D1 databases** and **11 Worker scripts**. A subsequent settings read found the current D1 bindings shown below. Every D1 reports 16–20 KiB of file size; Cloudflare documents this field as bytes. The account subscription endpoint was unavailable because the existing API token does not have Billing Read, so the account plan itself cannot be proven from the API. The prior create attempt returned HTTP 403 / error 7406. Cloudflare defines 7406 as the D1 database-count limit. Its published Free plan limit is 10 databases. This matches the observed count.

| Database | UUID | Created (UTC) | Size | Current Worker binding | Snapshot metadata |
|---|---|---:|---:|---|---|
| haruki-sync-qa-44730215625 | 581ab796-2cf8-4976-87b8-e1100d5fb5ac | 2026-11-20 11:45 | 20 KiB | haruki-initial-qa-44730215625:DB | revision 15; 1,228 bytes |
| haruki-mobile-preview-44666798466 | d64cda1d-668f-411f-a708-58b41caab932 | 2026-11-20 03:19 | 20 KiB | haruki-sync-qa-44663139065:DB | revision 9; 1,721 bytes |
| haruki-sync-qa-44666798466 | 287a9296-a017-435a-8637-97e096e83b39 | 2026-11-20 03:18 | 20 KiB | none | revision 9; 976 bytes |
| haruki-sync-qa-44666529445 | 6d70828e-f786-4215-94b2-283e32bc1708 | 2026-11-20 03:16 | 20 KiB | none | revision 9; 976 bytes |
| haruki-sync-qa-44666118103 | c30d5c91-793b-42ad-9bfe-5ea19dab658a | 2026-11-20 03:12 | 20 KiB | none | revision 6; 896 bytes |
| haruki-sync-qa-44663546163 | 31dc86e4-3cc5-42dc-a738-5a9a6259747f | 2026-11-20 02:50 | 20 KiB | none | revision 0; NULL body |
| haruki-sync-qa-44663412194 | 1a784795-b853-4eb0-a74a-cba4db0e9867 | 2026-11-20 02:49 | 20 KiB | haruki-sync-qa-44663412194:DB | revision 0; NULL body |
| haruki-sync-qa-44663310113 | 244c4183-5538-4211-98e2-116b2668becf | 2026-11-20 02:48 | 20 KiB | haruki-sync-qa-44663310113:DB | revision 0; NULL body |
| haruki-sync-qa-44663139065 | 00feacbf-4232-405e-a73a-3e191686a914 | 2026-11-20 02:46 | 20 KiB | none | revision 1; 333 bytes |
| haruki-sync-verification-44660992355 | 313783f1-0350-4376-a58a-96d7b7773a24 | 2026-11-20 02:28 | 16 KiB | none | verification table only; no family snapshot table |

The four unattached D1 databases containing non-NULL snapshots have synthetic sync test data and must be treated as retained test records until separately approved for deletion. Their lack of a current Worker binding does not prove they are disposable.

## Free option

The selected no-cost D1 is `haruki-sync-qa-44663546163` (UUID `31dc86e4-3cc5-42dc-a738-5a9a6259747f`). Immediately before binding, read-only checks confirmed the exact name/UUID, compatible `family_snapshot` and `auth_limit` tables, revision 0 and NULL body. It is now bound as `DB` to the dedicated Worker `haruki-production-inactive-44733572133`. Wrangler's deployment output and the Worker's live response confirm the binding; Cloudflare Settings API readback also reports the UUID. D1 remains empty. Its old QA purpose is retired; no other database was changed or deleted.

An alternative is `haruki-sync-qa-44663412194` or `haruki-sync-qa-44663310113`; both are empty with the same schema, but currently remain bound to staging Workers and therefore should not be shared with production.

## Deletion and conversion impact

No deletion was required. The chosen D1 was not reset or renamed, and no other D1 was deleted or rebound. Deleting an attached D1 can break its Worker; deleting any nonempty snapshot removes stored data.

## Billing and verification limits

The official D1 docs state 10 databases per account on Workers Free and describe error 7406 as the database-count limit:
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- [Cloudflare D1 error 7406](https://developers.cloudflare.com/d1/observability/debug-d1/)
- [D1 database metadata](https://developers.cloudflare.com/api/resources/d1/)

The API token lacks Billing Read for the account subscription endpoint. Confirming the account's exact current plan requires adding Billing Read to a token or checking Cloudflare's billing page. This check should be read-only.

## Remaining gates

- Verify the actual Android backup exists and restore it only in the isolated no-sync site. Compare menus, history, XP/level, Eiken and game progress.
- Confirm which empty unbound D1 to assign as production; current recommendation is `haruki-sync-qa-44663546163`.
- Set production family code only as GitHub Environment secret `HARUKI_FAMILY_CODE`; never use test code `12345`.
- Do not run the manual production deploy workflow or enable GitHub Pages against production until the backup/restore check and the user's final release approval.
- Keep Draft PR #15 open. Re-run the requested XP concurrency regression and the production-candidate browser checks before release.
