# Stage 5 — evidence, backup and release checkpoint

## Owner-observed full hosted backup on Safari — 2026-09-20

Owner returned acceptance v2 at 2026-09-20T05:44:59.468Z (12:44 Thailand),
Safari 26.5 on macOS, from the hosted-fixture acceptance page deployed from
`f10f24aaf46ed7e69142998c936d622f86946ac6`.

All five checks passed: synthetic hosted snapshot with 2 attachment files,
isolated restore matching every table, modified-envelope rejection, native
JSON save/reselect and native PNG save/reselect. This closes the desktop Safari
full hosted-fixture save/reopen gate. It is owner-observed evidence, not an
agent-controlled browser run or an authenticated main-app UI test.

Current remaining gates: physical iPad controls and actual two-device UI
observation; promotion of tested patch 008 and frontend to the original app.
Backend concurrent-client HTTP checks already passed separately. Actual
operational opening remains unset and is not required to continue development.
Historical pending statements below are superseded by this and the hosted
acceptance section.

## 2026-09-20: hosted synthetic acceptance and two real defects

Owner explicitly approved synthetic opening in a separate test environment.
Created `moana-stage5-synthetic-test` (`bpedekosireooxrsaerp`) in the existing
organization; the cost tool quoted $0/month. The original application project
was not modified. Two synthetic Auth users were created without sending email;
all entities, openings, transactions and files are invented test data.

Hosted HTTP acceptance passed after applying source patch 008 to the test
project: private upload/finalize/download hash, denied overwrite, anonymous and
nonowner denial, same-key concurrent HTTP idempotency, conflicting-payload
rejection, concurrent edits yielding one success and one stale_revision, and
attachment retention across edit/void/archive. A 60-second signed URL returned
HTTP 400 with an exp-claim timestamp failure after expiry; a fresh URL still
returned HTTP 200 and the original bytes. See stage5-hosted-results.json.

The first hosted post exposed a deferred-trigger privilege failure at HTTP
commit. Patch 008 drains only the balance constraint triggers inside the
existing owner-checked posting command, then restores deferred mode. It does
not add SECURITY DEFINER functions/triggers or widen grants; authenticated
users still cannot execute validate_batch or insert ledger lines directly.
See https://www.postgresql.org/docs/17/sql-set-constraints.html

Stale-revision conflicts previously used SQLSTATE 40001. In the hosted race the
loser timed out while the winning edit committed; the exact internal timeout
mechanism is not established. Mapping this expected client conflict to PT409
made the repeated hosted race return stale_revision immediately and correctly.
Both posting and attachment reservation now use PT409. See
https://docs.postgrest.org/en/stable/references/errors.html#raise-errors-with-http-status-codes

Full hosted synthetic backup contains 5 transactions, 11 revisions, 14 batches,
28 lines and 2 completed/archived file copies. Local restore matched every table
exactly; report amounts and rows match after normalizing unordered report arrays.
The public fixture contains ONLY the synthetic snapshot and file bytes, never
passwords/tokens. `npm run test:hosted-backup` reproduces this check.

Verification: 16 mounted UI tests, 79 engine checks, 42 stage-5 checks, 9 unopened
checks, 2 acceptance-page integration scenarios and build/typecheck passed.
Temporary runner required JWT plus a random secret, was limited to the test
project and a one-hour deadline, and allowed bootstrap once. It has now been
replaced with a JWT-protected HTTP 410 response. Temporary password and signed
URL state was removed. The two synthetic users and evidence remain in the
isolated free project. RLS on runner state intentionally has no client policies;
the test project's leaked-password-protection warning remains.

### Still open

- Physical iPad controls and actual two-device UI observation. The backend race
  evidence is overlapping HTTP calls from two signed-in clients, not two devices.
- Patch 008 is tested in the sandbox and stored in this branch ONLY; it has NOT
  been applied to the original app database or merged to main. Release promotion
  must include the SQL fix, not just the frontend.
- Actual operational start date/opening remains an owner decision.

## Owner-observed Safari acceptance — 2026-09-20

The owner returned the acceptance v1 report at 2026-09-20T05:13:06.522Z
(12:13 Thailand time), using Safari 26.5 on macOS. All five displayed checks
passed: synthetic unopened database, isolated restore with complete table
comparison, tampered-backup rejection, native JSON save/reselect/restore, and
native PNG save/reselect with exact-byte verification.

This closes the desktop Safari synthetic-file save/reopen subset for the
separate acceptance page deployed from
`732ae5519bd3f02c8482993783d089fd09e4e8ba`. It is user-observed evidence,
not an agent-controlled browser run. It does not prove the main app's
authenticated attachment flow, backups containing hosted attachments, signed
URL expiry, physical iPad controls, or concurrent-device edits. Those gates
remain open. No opening was posted and no real data was used.

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
