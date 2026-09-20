# Stage 4 — accounting UI checkpoint

## Follow-up verification

Stage 4 implementation and automated regression checkpoint is complete. This is
not full browser/device sign-off or permission to enter live operational data.
No owner action is needed for development to continue into stage 5.

`npm run test:ui`: seven real React component tests passed using jsdom and
synthetic RPC responses, with live Supabase calls explicitly forbidden:

1. Inline continue/discard prompt preserves the draft until explicit discard;
   no native `window.confirm` invocation.
2. Explicit payer/beneficiary command payload, successful form reset.
3. Unknown network outcome survives remount; retry uses identical key and payload.
4. Explicit SQL rollback keeps the form editable and clears pending retry.
5. Unavailable retry storage prevents sending a mutation.
6. Date input synchronization before submit.
7. Native download link filename, actual CSV Blob contents (period not cumulative
   amount), formula-name escaping, and URL cleanup.

The exact-money/CSV unit suite and all 79 SQL regressions were rerun and passed;
TypeScript/Vite production build passed. Test dependencies are pinned and dev-only.
Run all reproducible checks with `npm test` (Node 24).

The Cloud browser remained blocked by an old native confirmation: tab listing and
dialog dismissal timed out, while closing the tab reported that the confirmation
was still active. Component verification above is NOT claimed as a browser retest.
Actual Safari saved-file/open-file behavior and final deployed inline interaction
remain device/browser release checks. They do not require owner input to continue
implementing the separate stage-5 backup and release work.

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
  final native link was clicked and its download filename verified, but the
  browser's saved file was not retrieved. File-save acceptance on Safari remains.
- Final source `04dc12f008b8c681755fb4410c048f6a96e33338` deployed READY as
  `dpl_3sgGHPE3pi5cG1SJ7pfUtxo8TfhH`; final demo zero-opening and report smoke passed.
  A native unsaved-draft confirmation blocked the automated browser connection;
  it was replaced with an inline confirmation, avoiding browser-modal dependency.
  The replacement passes typecheck/build and the follow-up component tests above;
  deployed browser retest remains pending due to the browser connection issue.
- Final live database check: zero accounting transactions/lines, null start date,
  one preserved POC row. Read migration: `20260920021414 accounting_read_api`.

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
