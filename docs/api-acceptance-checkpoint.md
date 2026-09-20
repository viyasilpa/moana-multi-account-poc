# API acceptance checkpoint

## Observed acceptance — 2026-09-20

Owner supplied a screenshot of the deployed signed-in acceptance runner showing all six checks passed:

1. Insert through the real API.
2. Read the inserted row from the database.
3. Update through the real API.
4. Reject more than two decimal places at the database boundary.
5. Deny a separate unauthenticated read request.
6. Delete the exact synthetic test row and verify its absence.

The screenshot also shows the pre-existing user row remains. Its contents and identifiers are intentionally not published. No repeat of this successful test is required.

Owner previously reported successful login following password recovery. URL Configuration screenshot showed the canonical Site URL and exact recovery redirect. A separate screenshot confirmed attachment backup restored one new copy and verified content without modifying the original.

## Scope and remaining gate

These are observed user-session results, not an agent-operated browser test. They do not prove the persisted UI edit/cancel/delete-confirmation flow or authenticated non-owner denial. SQL authorization simulations are separate evidence, not a substitute for an actual second-user session.

The approved specification explicitly requires local rendered UI interaction and fix/retest evidence before accounting implementation. That route remains blocked by browser access restrictions; no bypass or owner waiver has been performed. An explicit owner change accepting a deployed-UI verification route is needed before substituting that route for the local-browser requirement. The replacement flow must still be tested; acceptance of a limitation is not a test pass.

Full accounting export/restore belongs to the accounting delivery and release gates; it is not implemented or claimed by the attachment-only backup rehearsal. Do not extend the technical POC indefinitely by treating full accounting features as POC prerequisites.

## Runner implementation

The owner-triggered runner uses one random test ID, exact-ID cleanup, and a best-effort cleanup retry after uncertain insert responses. It does not modify pre-existing rows or files. No credentials are collected or exposed. Results appear in the UI. Build/typecheck previously passed.
