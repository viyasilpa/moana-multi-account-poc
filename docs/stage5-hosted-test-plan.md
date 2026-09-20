# Hosted stage-5 acceptance: prepared scope, not executed

## Verified prerequisites and blocker

Supabase discovery on 2026-09-20 returned only the existing application project
and zero development branches. No separate hosted test target currently exists.
The production code rejects non-opening posts with `opening_required` and
attachment reservations without a posted transaction with
`posted_transaction_required`. These are intended invariants, not defects.

The owner's instruction prohibits opening balances and real data for tests.
Until explicitly narrowed, this also prevents creating an initialized synthetic
ledger. Do not bypass this by direct inserts, changing settings, disabling
constraints, or treating mock records as hosted evidence.

## Proposed exception for owner review

Allow an opening containing only invented test values inside a separately
provisioned disposable test environment. The current application project,
configured real masters, start date, balances, storage objects, and auth users
remain untouched. No copying of production data or credentials. Any paid resource
must have its price presented and approved before provisioning. This document
is a plan, not evidence of that approval or provisioning.

## Execution once prerequisites are satisfied

1. Verify the target project ID differs from the application project. Apply the
   exact app schema there; create synthetic owner/nonowner test identities and
   six clearly named synthetic entities. Verify owner-only access first.
2. If the exception is approved, initialize this synthetic ledger and post one
   small expense through the normal app command. Never insert ledger rows
   directly to evade opening or balancing rules.
3. Reserve a valid synthetic PNG/PDF attachment via accounting_attachment.
   Upload with overwrite disabled through authenticated Storage HTTP; finalize
   via the app RPC; download and compare SHA-256 with original bytes.
4. Verify anonymous/nonowner download denial, overwrite denial, and the signed
   URL both before and after its actual expiry. An HTTP outage is inconclusive,
   not a passing expiry test. Do not publish tokens or signed URLs as evidence.
5. Run two independently authenticated clients against the same test ledger:
   same-key create requests must return one transaction; differing payloads
   with the same key must conflict; edits with the same expected revision must
   produce exactly one success and one stale_revision rejection. Verify final
   revision, balanced journals and audit history. This proves API concurrency;
   physical-device controls require separate browser observation.
6. Edit and void the synthetic transaction and confirm its earlier attachment
   remains retained. Archive with a reason, verify retention, then export the
   full snapshot plus file bytes. Validate hashes, restore in isolation, and
   compare reports and every table. Save/reopen that complete backup through
   Safari; the earlier empty-ledger acceptance does not substitute for this.
7. Record exact source/deployment, target, timings and outcomes without secrets.
   Leave failed checks open. Stop/dispose only the explicitly created test
   resources under their lifecycle authorization; never delete app resources.

## Already passed, do not repeat unnecessarily

Owner-observed desktop Safari synthetic JSON and PNG save/reselect plus isolated
empty-ledger restore, reported 2026-09-20T05:13:06.522Z. No opening or live data
was involved. See stage5-checkpoint.md for this bounded evidence.
