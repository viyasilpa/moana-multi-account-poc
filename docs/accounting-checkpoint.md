# Stage 3 — accounting engine checkpoint

## Scope

Approved six-entity solo-owner engine; PP expense funding only, PP income deferred.
Generic code and synthetic fixtures only in this public repository. Authoritative
business specification and private master labels remain outside the public source.

Pre-change main: `8fc862a9ce490653c7c2cd60bae9b81ef03deef4`.
Pre-change database: no accounting schema, one existing POC row, one owner binding.
Additive new schema; no POC table, Auth setting, existing row or file is changed.
No real opening balances/start date are assumed. Recovery route is in
`db/accounting/README.md`; source checkpoint is not a full data backup.

## Implementation

- Server-generated balanced journals for own/cross-entity income, expense,
  transfers, named-party payments/receipts, PP-paid expenses and source refunds.
- Atomic opening set with one input per related pair and opening equity offsets.
- Immutable reversal/replacement history, exact decimal arithmetic, current
  revision checks, owner-only commands, idempotent request receipts.
- Deferred database checks for per-entity balance and pair mirror balance.
- Protected catalog, GL, account balances and entity/consolidated P&L RPCs.
- Named external parties plus rename/archive operations with audit.

## Verification

Local PGlite executes the exact SQL with synthetic Auth roles and owner fixture.
70 integration checks passed, plus frontend TypeScript/Vite build passed.
The same 70-check suite passed on Supabase PostgreSQL 17.6, including deferred
constraint flushing, owner/non-owner/anonymous role checks and exact decimal
known-answer cases. The suite used transaction-local Auth claim simulation, not
real second-user sign-in. All synthetic fixtures were rolled back. Actual
simultaneous multi-session stress tests and browser use of these new accounting
RPCs are not claimed here; they remain release/integration checks.

Recorded migrations:

- 20260920015457 accounting_engine_core
- 20260920015509 accounting_engine_commands
- 20260920015520 accounting_engine_masters

Pre-apply source/test checkpoint: `be4fc7e6ff24942814bce037ff11093540a99416`.
After rollback: zero accounting entities, transactions and journal lines; one
existing POC row and owner binding remained. The approved private six-entity
manifest was then configured through the owner-checked admin function and
compared field-by-field with the specification: 110 initial accounts including
30 reciprocal entity accounts and six PP accounts. No start date or balances
were set. One additional owner-requested named external party was added through
the audited master command; its identity is deliberately not published here.
Other counterparties remain individually named, not one pooled receivable.

Security advisor found no new engine warnings. The existing owner-accepted Auth
leaked-password-protection warning remains unchanged. Reference:
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Stage 3 backend checkpoint is complete: schema, controlled posting, protected
read APIs, private masters and DB regression tests. Source rollback alone does
not reverse remote migrations. Use the fail-closed recovery instructions and
fix forward; never drop a nonempty accounting history.

## Remaining product work

The current website is still the POC UI. Accounting entry/setup UI, report screens,
transaction-bound attachments with server-side limits, full versioned ledger
backup/restore, phone usability and release acceptance are not done by this engine
checkpoint. No production readiness or go-live is claimed.
