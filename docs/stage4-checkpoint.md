# Stage 4 — accounting UI checkpoint

Development only; not a production certification. No actual opening date or money
was set by the agent. Existing POC rows/files and Auth configuration are preserved.

## Delivered

- Four Thai tabs: entry, transactions, balances, reports. Payer bank/cash and
  beneficiary entity are separate required choices, with a review step.
- Income/expense, PP expense funding, transfers, individually named party payments
  and receipts, linked refunds. No pooled Other account; PP income remains deferred.
- Owner-entered opening date and signed balances. Related pairs entered once;
  opening correction retains date and journal history.
- Activity pages of 25, correction reasons, revision checks, cancellation with
  reversal rather than deletion, original/replacement/reversal journal drilldown.
- Date/entity reports, exact money formatting, status and GL, CSV formula escaping.
- Pending command key/payload retained in user-scoped sessionStorage after unknown
  network results; only explicit SQL rollback errors release the command. Same-key
  server replay is tested in the engine suite. Browser network interruption and
  concurrent-tab stress remain release checks, not claimed as observed here.
- Isolated `?demo=1` loads PGlite lazily and executes the same SQL migrations with
  generic synthetic masters. In-memory only; reload resets it. Never sends ledger
  mutations to Supabase. Do not enter real data in this demonstration.

## Verification observed

- Build/typecheck passed. 79 local SQL regression checks passed, including new
  activity/detail owner/non-owner/anonymous permission checks and exact strings.
- Exact-format unit tests pass: maximum single amounts, aggregate amounts above
  the single-entry limit, 0.10+0.20, negatives, invalid input, CSV injection/quotes.
- Additive migration `accounting_read_api` applied; owner read on the live empty
  ledger returns zero items. Security advisor has no new warnings; existing Auth
  leaked-password-protection warning unchanged.
- Deployed owner page loaded six configured entities and unset opening date.
  No actual opening or ledger transaction was created.
- Deployed demo browser: opening bank 10,000; cross-entity expense 1,500; correction
  to 1,200 with original/reversal/replacement history; refund 200; cancel-dialog
  dismissal then confirmed refund void with history retained; named loan 500;
  income 8,000; PP expense 300. Bank stayed 16,300 after PP expense, external
  receivable 500, PP payable 300, related balances opposite. Before PP expense,
  P&L showed 8,000 / 1,200 / 6,800; filtered entity report matched.
- Bank GL reconciled opening 10,000 and closing 8,300 before the income entry.
- Observed date-input synchronization defect fixed and opening flow retested.
  Desktop layout visually inspected. Real iPad/Safari behavior is not claimed.
- An automated CSV download-event wait timed out. Export changed to a native
  persistent download link. CSV contents/escaping tested independently; browser
  file-save verification is recorded separately after final deployment.

## Recovery and next release gates

Pre-stage UI checkpoint: `0fa25e956e89cdde8e9ba0d24c1b52f7a5173197`.
First UI source: `e8411723cf7d76c7bd90dcfb07028217f4942ab8`.
Date/orientation fix: `2e531dda6c0ac0eeab1e3778a73c3af4af19d688`.
Revert the UI commits or promote the previous deployment to roll back the UI.
The additive read functions can remain; do not remove the accounting schema or
reverse financial history to roll back a frontend. Source checkpoint is NOT a
complete data backup.

Stage 5: full-ledger JSON backup and restore rehearsal, transaction-linked private
attachments, release security/concurrency/retry checks, master rename/archive UI,
real-device acceptance. Owner actual start date and balances are still required
before live operational posting. No production-readiness claim until these gates
are explicitly checked or scoped by the owner.

Implementation references: Supabase database functions
(https://supabase.com/docs/guides/database/functions) and PGlite Vite bundling
(https://pglite.dev/docs/bundler-support). The demo's large lazy WASM bundle and
upstream eval build warnings do not affect the normal accounting route's loading.
