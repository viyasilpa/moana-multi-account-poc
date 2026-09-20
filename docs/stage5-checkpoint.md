# Stage 5 — evidence, backup and release checkpoint

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
- 35 additional stage-5 checks: idempotency, stale revision, invalid filename /
  MIME / oversized reservation, missing/mismatched upload, owner/nonowner/anon
  permissions, no object update/delete, archive retention, exact backup strings,
  tamper/incomplete-file/count rejection, full synthetic restore and identical
  reports, unbalanced journals and broken current revisions rejected.

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
