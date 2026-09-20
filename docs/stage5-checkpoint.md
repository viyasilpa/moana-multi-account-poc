# Stage 5 — evidence, backup and release checkpoint

## Replacement browser route: `/acceptance.html`

A separate Vite entrypoint provides a no-login, synthetic-only file acceptance
page for the owner's Chrome/Safari. It imports no Supabase client or live app
entrypoint. Its CSP restricts connections to its own origin for PGlite assets.
It creates six synthetic entities in memory, leaves opening/date unset, uses
the exact schema and production backup/restore functions, and creates native
JSON and PNG download links. Selecting the saved JSON checks its exact hash and
restores all tables in another isolated database. Selecting the PNG compares its
bytes. Only files matching this page's generated hashes reach validation/restore;
there is no upload. Refreshing starts a new fixture; use downloads from that run.

`npm run test:acceptance` passed an integration scenario with real in-memory
PGlite: preparation, both file-selection handlers, restore, and wrong-file
rejection. The DOM and file selection were simulated in jsdom. Build/typecheck
passed. The generated PNG's integrity was separately verified. These results
do NOT establish actual browser downloads, physical Safari/iPad acceptance,
hosted attachment HTTP, signed-link expiration, or multi-device concurrency.
The owner must download/select the two files and return the page's result before
the native-browser subset can be marked passed. The page labels the other gates
as pending; no opening or posted transaction is created to reach those gates.

## 2026-09-20: offline path without opening a ledger

Latest main was verified as `c4317f523325cc642536959ccfd8ff0ba77c19aa`.
`npm run test:unopened` passes nine checks using synthetic masters in disposable
PGlite only. It never submits an opening command, loads real data, or contacts a
hosted service. It saves a backup to a temporary disk file, reads it back,
restores into a fresh database with all table equality checks, rejects a modified
file, verifies owner-only export, rejects posting before opening and attachment
reservation without a posted transaction, and verifies source tables unchanged.
Temporary files are removed after the run. Start date and opening remain null.

This is disk I/O and isolated restore evidence, NOT browser save/reopen or
hosted attachment acceptance. Existing `npm test` uses synthetic opening
fixtures; it was intentionally not rerun under the current no-opening constraint.

Cloud Browser is not inherently required for acceptance. Another real browser
or test runner can provide browser evidence. In this workspace the alternate
browser CLI, Docker and PostgreSQL executables were unavailable; installing
PostgreSQL through apt failed due to unavailable package metadata and inability
to switch the package-fetch process user. No elevated retry was attempted.

Positive attachment tests require a posted transaction. With the no-opening
constraint and an unopened ledger, those tests cannot be reached through normal
application commands. Do not silently initialize the ledger, bypass constraints,
or relabel mock transport as hosted evidence. A separately scoped synthetic
fixture with posted transactions is a prerequisite for that acceptance gate.
Multi-session PostgreSQL and physical Safari/iPad acceptance remain unverified.

## Follow-up: file workflow and retention

Owner-supplied Safari screenshot confirms a downloaded JSON was selected and
rehearsed successfully: zero transactions, zero lines, zero attachments, live
data unchanged. This closes the empty-ledger Safari save/reopen check only.

The mounted React suite now has 16 checks. Seven new production-component tests
use synthetic SDK transport (no hosted service calls): normal non-overwriting
upload, lost upload response without a second upload, identical reservation-key
replay after an unknown result, double-tap suppression, pending upload finalize
after remount, reason-required archive / 60-second signed-URL request, and JSON
backup including archived bytes with corrupt download rejected.

The stage-5 database suite now has 42 checks. It additionally verifies an
attachment remains linked to revision 1 after edit and void, and rejects a new
reservation on a void transaction. Overlapping same-key and stale-edit requests
are tested against PGlite's queued execution. This is NOT a claim of concurrent
Postgres sessions or two-device race testing. Existing 79 engine checks remain.

The agent's remote browser still times out while listing tabs. Earlier evidence
reported an active native confirmation blocking closure. This suggests a stuck
remote session, not an outage of the user's Safari or GitHub/Supabase/Vercel;
the complete root cause is unconfirmed. No reconnection of those services,
permission weakening, new test owner, real opening, or live data change was made.
Hosted Storage HTTP and real concurrent-device acceptance remain open gates.

Implementation checkpoint, not production/device acceptance. No operational
opening date or balances are invented. Previous source checkpoint:
`e6e91b3166ba1844a4b3a5e512ef7245ad3bb732`.

## Implemented

- Settings: rename/reactivate/archive bank, cash, income/expense accounts and
  external named parties through the existing audited, idempotent master RPC.
  IDs, ownership and used history are retained; no deletion/reassignment UI.
- Private `accounting-attachments` bucket, separate from POC files. PDF/JPEG/PNG,
  5 MiB maximum. Server-generated transaction/revision/attachment UUID paths;
  owner-only reservation, upload/read policies, final Storage size/MIME check.
  No client overwrite/delete grant. Files remain after correction/void. Archive
  requires reason and retains evidence. Links are authorized and expire in 60s.
  MIME restrictions are not malware scanning or binary-content authentication.
- Full JSON accounting snapshot: settings, masters, transactions, revisions,
  batches, exact string amounts/sequences, audit events, idempotency requests and
  attachment manifest. STABLE RPC uses one statement snapshot. Completed and
  archived file bytes are copied and SHA-256 checked; pending reservations are
  explicitly disclosed and contain metadata only until finalized.
- Versioned envelope, SHA-256 corruption check and counts; a digest is not a
  digital signature or encryption. Backups contain sensitive information and
  must be kept private. 50 MiB payload safety cap fails closed, never truncates.
  No scheduled/paid backup service. Last download click is device-local and is
  explicitly NOT proof the browser saved the file.
- Restore rehearsal runs the exact schema in a new in-memory PGlite database.
  Fixed table names, parameterized input, foreign keys, immutable history and
  deferred balance/mirror constraints remain enabled. Re-export must match all
  tables exactly. Database is closed after checks. No live import/delete route.
  Backup file validation also checks every completed file's bytes and digest.
  PGlite is lazy-loaded only for demo/rehearsal (React bundle-size guidance).

## Reproducible verification

`npm test`:

- Nine mounted React/jsdom checks, including same-ID master archive and actual
  JSON Blob contents, native download link and stale URL removal on failure.
- Exact-money/CSV unit checks and 79 existing SQL regression checks.
- 37 additional stage-5 checks: idempotency, stale revision, invalid filename /
  MIME / oversized reservation, missing/mismatched upload, owner/nonowner/anon
  permissions, no object update/delete, archive retention, exact backup strings,
  tamper/incomplete-file/count rejection, full synthetic restore and identical
  reports, unbalanced journals and broken current revisions rejected.
  Source-session timezone variation also preserves canonical UTC timestamps and
  microsecond precision (never normalized through a JavaScript Date).
  Version 2 snapshots transport nested JSONB history as canonical text; a numeric
  JSON value of 9999999999999999.99 survives export/recovery without JS rounding.
  Version 1 UI-created backups remain readable. A digest verifies corruption,
  not provenance: only restore a backup from a trusted source.

Hosted migration `accounting_private_documents_backup` applied successfully.
Owner snapshot RPC worked; nonowner/anonymous API denial and private bucket /
5 MiB limit were verified on Supabase. Recursive comparison against the private
pre-change checkpoint found every existing accounting table unchanged. The
actual private snapshot also restored into an empty local database and matched
all exported tables exactly (zero live ledger entries, opening still unset).

That last rehearsal found a genuine issue missed by same-environment fixtures:
PGlite's default timezone rendered timestamps differently. Restore now uses UTC;
the additive `accounting_backup_utc` migration canonically exports UTC while
retaining microseconds. A timezone-variation regression covers the fix.

Initial source `6fb3454f516f9ab8ba6d1c86ee30c0b952742b33` deployed READY as
`dpl_51ugmse3c4ZDyAN23268Yke2wyNC` on the main application alias. Follow-up
verification/fix commit contains this checkpoint. Security advisor found no new
warnings; previously known leaked-password protection warning remains. See
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Storage tests use a metadata stub in PGlite. They do NOT prove the hosted Storage
HTTP upload/download, signed URL expiry, or actual binary MIME sniffing. jsdom
does NOT replace Safari or concurrent-device acceptance. Typecheck/build pass;
upstream PGlite eval/large lazy-chunk warnings remain.

## Remaining release gates

- Hosted, authenticated attachment upload/download/expiry and end-to-end backup
  file-save/reopen. The existing Cloud browser is blocked by an old confirmation;
  current tab refresh still times out. No bypass or credential extraction used.
- Real iPad/Safari controls/download acceptance and concurrent-device stress.
- Owner chooses actual common start date and approves actual opening balances.
  Until then the live ledger stays uninitialized; development is not approval
  to post zero balances or to call this production-ready.

## Recovery

Private pre-change accounting checkpoint saved outside this public repository.
It records the empty ledger and configured masters; POC Storage bytes are not
included and remain untouched. Never commit real master data or backup contents.

Migration is additive: leave new objects/bucket in place when rolling back UI;
revert the stage-5 UI commit or promote the prior deployment. Do not drop any
schema or bucket containing evidence. Source history alone is NOT a data backup.

Disaster recovery: retain the original JSON; verify envelope/counts/file hashes;
rehearse locally; provision a separately authorized empty target; apply exact
schema, restore owner-linked tables atomically with all constraints, upload file
copies without overwriting, compare counts/GL/P&L/reciprocal balances and audit
links, then obtain approval before switching the app. The app deliberately has
no in-place recovery button. Target creation/cutover is a separate authorized
operation, not something the rehearsal silently performs.

References: Supabase private buckets and upload restrictions:
https://supabase.com/docs/guides/storage/buckets/fundamentals
https://supabase.com/docs/guides/storage/buckets/creating-buckets
