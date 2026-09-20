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

These are observed user-session results, not an agent-operated browser test. The API checks alone do not prove UI behavior; deployed UI evidence is recorded below. Actual authenticated non-owner denial remains separate from SQL simulation. SQL authorization simulations are separate evidence, not a substitute for an actual second-user session.

On 2026-09-20 the owner explicitly approved testing on the deployed Vercel POC instead of the blocked local-browser route. This changes only the test location; it does not waive interaction, correction or retest evidence. The deployed persisted UI flow has now been observed as detailed below. The primary deployed URL now renders its owner login form in the agent browser; no deployment protection or authentication was disabled or bypassed.

Full accounting export/restore belongs to the accounting delivery and release gates; it is not implemented or claimed by the attachment-only backup rehearsal. Do not extend the technical POC indefinitely by treating full accounting features as POC prerequisites.

## Runner implementation

The owner-triggered runner uses one random test ID, exact-ID cleanup, and a best-effort cleanup retry after uncertain insert responses. It does not modify pre-existing rows or files. No credentials are collected or exposed. Results appear in the UI. Build/typecheck previously passed.

## Agent-operated deployed UI evidence — 2026-09-20

Using the canonical Vercel app and secure browser authentication, the agent observed a signed-in page and performed this isolated disposable-row workflow:

- Create `POC UI acceptance 20260920` with amount 12.34; success notice and row observed.
- Open Edit, change amount to 99.99, cancel; list remains 12.34.
- Open Edit, save amount 56.78; success and updated row observed.
- Reload browser; 56.78 persists.
- Open Delete; dialog identifies the synthetic row. Cancel; row remains.
- Reopen Delete and confirm; synthetic row disappears.
- Reload browser again; only the pre-existing user row remains.

The test row was permanently deleted as intended test cleanup. Existing user data and files were not altered. No credentials, session material, user row contents or identifiers are published. No accounting engine behavior is claimed by this test. A new concrete defect/fix/retest cycle was not performed in this run; do not represent these successful interactions as that evidence.
