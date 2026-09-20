# Owner Auth checkpoint — 2026-09-20

Supersedes owner-provisioning status in poc-checkpoint.md. Technical POC only.

- Verified the approved owner's Auth record and confirmed email directly. Personal identifiers are not published here.
- Owner reports public signup disabled; configuration not independently verified.
- Applied remote migration 20260920001427 technical_poc_single_owner_gate from db/poc/owner_gate.sql.
- Bound exactly one verified owner in an administrative transaction, outside public source and migration history.
- app_owner is singleton, Auth-FK-backed, RLS protected, client SELECT-self only. Clients cannot self-enroll or alter owner.
- Existing per-row ownership checks remain. Additional restrictive gate applies to all POC CRUD.
- db/poc/test_owner_gate.sql passed: owner CRUD, reassignment denial, unauthorized read/update/delete isolation, unauthorized insert denial, self-enrollment denial, anon read denial. Test transaction rolled back.
- Tests simulate SQL roles/JWT claims; real login and token-based Data API tests are still required.
- Security advisor: no database RLS findings, one Auth warning: leaked password protection disabled. No paid-plan change authorized. See https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Recovery: db/poc/owner_gate_recovery.md; preserve fail-closed gate during frontend rollback.

Frontend remains in-memory. Next checkpoint: actual login and persistent POC CRUD; private storage/restore and full POC gates remain outstanding. Not a production accounting app.
