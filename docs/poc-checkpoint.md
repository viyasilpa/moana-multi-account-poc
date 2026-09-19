# Technical POC checkpoint

This file supersedes outdated connector-availability statements in the root README. Not a production accounting app.

## Approved scope
Core services: GitHub, Vercel, Supabase. No owner-operated VS Code requirement.
Owner approved Phase 1 v0.3.1 with PP income collection excluded from V1; PP-paid expenses remain.
Do not publish the private specification or real accounting data into this public repository.

## Observed evidence
- GitHub write/commit/main update and Vercel automatic deployment verified.
- Deployed in-memory UI: empty-input rejection, add, edit 100 to 125, delete dialog, cancellation preserving row, confirmed deletion returning count to zero: PASS.
- Localhost UI and defect-fix/retest remain separate and NOT proven by deployed UI testing.
- Temporary deployment access was explicitly approved; no access token stored in source.
- Remote migrations applied successfully:
  - 20260919234659 technical_poc_items_rls: exact source db/poc/create_items.sql.
  - 20260919234755 technical_poc_items_note: exact source db/poc/add_note.sql.
- db/poc/test_items.sql passed before and after second migration.
- SQL-role tests: owner CRUD, other-user SELECT/UPDATE/DELETE isolation, forged INSERT denial, owner reassignment denial, invalid precision rejection, anon SELECT/INSERT denial.
- Test identities were synthetic request claims set within a rolled-back database transaction, NOT real signed-in users or API tokens.
- Security advisor returned no lints.

## Recovery
db/poc/rollback_items.sql removes only the exact POC table, refuses nonempty data and does not cascade. It has NOT been applied. Applied migration history must be preserved; record any future cleanup as a new remote migration.
No production tables or real financial data were touched.

## Still required
Real owner Auth provisioning/login/recovery, real token-based CRUD and denial through the Data API, private attachments, restore test, UI defect fixes and retest. Public signup configuration has not been verified. POC owner_id is synthetic and not a production owner allowlist.
The frontend is still in-memory and NOT connected to Supabase.
Full POC is NOT PASSED. Production accounting implementation remains gated.
