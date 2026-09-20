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

## Verification at pre-apply checkpoint

Local PGlite executes the exact SQL with synthetic Auth roles and owner fixture.
70 integration checks passed, plus frontend TypeScript/Vite build passed.
Remote migration/test/advisor results will be recorded after execution, not inferred
from local tests. Actual simultaneous multi-session tests and browser use of these
new accounting RPCs are not claimed here.

## Remaining product work

The current website is still the POC UI. Accounting entry/setup UI, report screens,
transaction-bound attachments with server-side limits, full versioned ledger
backup/restore, phone usability and release acceptance are not done by this engine
checkpoint. No production readiness or go-live is claimed.
