# Family synchronization: production safety evidence

Status: NOT APPROVED / DO NOT APPLY TO PRODUCTION. This document is evidence for a reviewer, not an authorization or a migration instruction. The user approved production publication subject to formal approval and verification. Previous automated approval explicitly rejected production RLS/privilege/function/table changes. No re-review submission or override mechanism has been exposed in this session.

## Proposed change

`family-code-draft.sql` adds two private tables (`hq_family_members`, `hq_family_invites`), one RLS-protected public append-only event table (`hq_family_quest_events`), four private security-definer functions and four public security-invoker wrappers. Existing tables, learner IDs, foreign keys, records and legacy policies are not dropped or modified. Five additional permissive policies apply to legacy learning events and study plans; permissive policies combine with existing policies using OR, so the effective permission is the union and must be reviewed as such. A new event table grants SELECT and INSERT to authenticated, with RLS; UPDATE/DELETE are not granted. Anonymous API role and PUBLIC receive no grants on the new tables/functions. Supabase anonymous sign-ins run as the authenticated role; a separate membership lookup predicates the added policies.

The browser generates a 256-bit random code; its digest is stored server-side, expires after 15 minutes and is consumed under a row lock. Membership is attached to the verified authenticated user ID. A family member may generate a replacement code. Both members share editing rights. The first anonymous user is the learner ID for a newly created family. Existing cloud-owner mismatch stops binding instead of overwriting local records; migration of a previously populated family with a different learner ID is not proven. Anonymous sessions are lost when browser data is cleared, and recovery requires another enrolled device able to issue a code.

## Verification

- Real isolated Supabase Auth/RLS: workflow `Isolated minimal family code QA`; inspect the latest PR checks. It tests membership creation, code reuse, an unrelated enrolled family with a known foreign learner ID, family quest reads/writes, legacy learning events and plan writes, and duplicate IDs.
- Mobile-sized browser contexts against the isolated Supabase project: run 44303379597 checks menu propagation, pre-existing local menu migration, session persistence after reload, completion, offline reconnect, undo and XP. These are emulations; physical Android devices remain untested.
- Isolated local PostgreSQL tests: `npm test`, including expiry and single-use codes, unrelated-family isolation, preserved legacy policy names, and the data-preserving recovery draft. The original migration's rollback test is local only.
- Source scan for `sb_secret_`, `service_role`, and private-key PEM headers in the draft app entry files was negative; this is not a full secret audit or a guarantee that no other secret exists.
- On 2026-11-18 a read-only production query found zero app rows and zero Auth users/sessions/identities. Do not assume this is still true later. Production app policies and functions/ACLs matched the previously saved metadata snapshot at verification time. Production anonymous sign-ins were disabled.

## Backup and recovery limits

The saved snapshot contains selected public/hq_private application metadata and empty application rows; it excludes a complete database backup, Auth service configuration and other platform state. Local reconstruction/rollback is not a hosted Supabase restore test. Production is on the free plan and the dashboard reports that scheduled project backups are unavailable. Full backup/restore and recovery under production conditions have not been verified; whether these are mandatory for the formal re-review cannot be determined from the available review interface.

`family-recovery-draft.sql` revokes the newly introduced API/function permissions and removes only the newly added family policies while retaining event and membership rows. It has been tested only in local PostgreSQL. It is not automatically authorized for production use, and would stop family sync. Do not apply migrations or recovery code in production without the applicable formal approval.

## Remaining work after formal approval

Recheck production state and exact approved commit, execute only an approved transactional migration, validate grants and RLS, enable anonymous sign-ins using an approved action, test separate authenticated sessions and outsider rejection, verify bidirectional/offline/idempotent sync and local migration, then merge/deploy and confirm actual Android devices. Monitor for a failure; preserve device-local and cloud data and use only the separately approved recovery procedure if needed. The current environment exposes no formal review or appeal submission tool, so no successful formal re-review is claimed.
