# Accounting engine checkpoint (not production)

Private `accounting` schema, separate from existing POC data. Public RPC wrappers
are security-invoker; private privileged operations check the current owner gate.
Clients cannot write journals, revisions, audit history, requests or masters.

Apply `001_core.sql`, `002_commands.sql`, then `003_masters.sql`, with recorded Supabase migrations.
Master names and bank details are deliberately omitted from this public repository.
An admin calls `accounting.configure` with the approved private six-entity manifest
and verified owner auth context. Start date is NOT guessed: opening finalization is
an explicit later setup operation and must precede normal entries.

## Posting API

`accounting_post({p_request})` accepts a UUID `key`, `action` (create/edit/void),
and `entry` for create/edit. Edits/voids require `transaction_id`,
`expected_revision`, and a nonempty `reason`. An identical request retry returns
the original receipt; reusing a key for different input is rejected. Stored full
JSON equality, not the diagnostic hash alone, is authoritative.

Entry: `kind`, `date` (Bangkok calendar date), decimal-string `amount`, optional
`description`. Ordinary entries specify `funding: money`, `money_account_id`,
`for_entity_id`, and either `category_account_id` or external `party_id`.
Transfers have money source/destination IDs only. PP expense uses `funding: pp`,
for-entity and expense category; no tracked money account. PP income is rejected.
Refunds specify original `source_transaction_id`; route is derived server-side.
Opening uses `balances: [{account_id, signed_amount}]`, with each related pair
entered once. Zero opening finalizes setup without making an empty journal.

One short settings-row lock serializes this solo-owner app's writes. Same-key
requests, source refunds and expected revisions are checked under that lock.
Each entity balances independently; each related pair nets exactly zero in each
batch. Deferred triggers validate at transaction end as well as explicit checks.
Edits reverse the prior effect at its original date and replace it at the new
date. A void only reverses; history is immutable. Active refunds protect source
routes/date and limit reductions. Opening corrections retain the original date.

Exact money domain uses unrestricted `numeric` plus precision/range checks.
Unlike a `numeric(18,2)` typmod, it rejects excessive precision before coercion.
Range is 16 integer and 2 decimal digits. Read APIs return decimal strings.

## Read API

- `accounting_catalog()`: protected master data and setup status.
- `accounting_report(from,to)`: per-account opening/activity/closing, per-entity
  P&L and consolidated P&L from one stable SQL snapshot.
- `accounting_gl(account,from,to)`: chronological auditable running balance.
- `accounting_master(request)`: named external-party creation; rename/archive
  ordinary accounts or external parties with audit and idempotency.

Opening journals (including their reversals/replacements) count in opening,
not period activity when From equals the common start date. Reports include all
journals; they do NOT filter out voided originals a second time.

## Recovery / boundaries

This is an additive isolated schema. Existing POC tables/files are untouched.
Before apply, commit source and tests and record the pre-change schema/counts.
If verification fails, revoke the five public RPC execute grants from authenticated
to fail closed, then fix forward. Do not drop the schema once any ledger history
exists. The previous UI still uses POC tables and remains independently usable.
Full export/restore and accounting attachments require later release work; a
source commit is NOT a database backup. No real transactions or opening amounts
are entered as part of engine testing. Remote integration tests use ROLLBACK.

## Verification

Run `node scripts/test-accounting.mjs` for an isolated PostgreSQL-compatible
PGlite execution of the exact SQL plus test suite. Remote verification must also
run on Supabase PostgreSQL: local emulation is not proof of deployed Auth/API.
PGlite is a pinned development-only dependency, not part of the frontend bundle.

Implementation/test status is recorded in `docs/accounting-checkpoint.md`.
