# Moana Multi Account — development, not production

## Current checkpoint — 20 September 2026

Stage 2 technical POC is complete under the owner-approved deployed-browser
testing route. Authentication, persistent POC CRUD, private sample files,
attachment backup/restore and an observed UI defect/fix/retest are recorded in
`docs/api-acceptance-checkpoint.md`. The earlier historical notes below do not
describe current connector or POC status.

Stage 3 accounting-engine backend checkpoint is implemented in `db/accounting/`:
70 integration checks passed locally and on Supabase (fixtures rolled back).
See `docs/accounting-checkpoint.md` for exact verification and remaining scope.
The deployed website still shows the POC UI, not the accounting application.

Developer checks: `npm ci`, `npm run build`, `node scripts/test-accounting.mjs`.
Never commit private business specifications, account labels, real financial data,
owner identity or credentials to this public repository.

## Historical POC report (superseded by checkpoints above)

This isolated demo proves the local browser workflow only. It contains mock state, no database, no accounting engine, no real data and no production code.

Target check: add a mock item, edit it, open delete confirmation, cancel, confirm delete, and verify visible state after each action.

## Actual POC results — 19 September 2026

Overall: BLOCKED / NOT PASSED. No production app has been created. The results below describe the initial local test; see the GitHub follow-up for subsequent account setup.

## GitHub follow-up — 19 September 2026

The owner created the test repository and authorized the GitHub App for selected repositories. Access and file creation are verified: README commit `dac2e8f2cd7db5cb52af3b05ba6af073f75997ab` was created and read back successfully. The repository is currently public. No credentials or real accounting data are included. This test does not establish Supabase migration, UI interaction, deployment, or production readiness.

## Follow-up test checkpoint — 19 September 2026

- Repeated `npm run build`: PASS (TypeScript and Vite).
- Local server reported ready on 127.0.0.1:5173, but a separate HTTP check failed with curl code 7.
- Cloud Browser navigation to that local address returned `net::ERR_BLOCKED_BY_CLIENT`. Local UI tests remain BLOCKED; no tunnel or security bypass attempted.
- Provider discovery reports Supabase and Vercel plugins not installed in this conversation. Owner account registration alone does not grant this assistant access. Database and deployment tests remain NOT RUN, pending normal connector authorization.
- Existing mock source and lockfile are being checkpointed to this repository, not promoted to production. Known prototype limitations below remain unresolved and untested.
- Next: connect Supabase and Vercel for the named POC only. Verify their exposed tools and project scope. A deployed UI test would be reported separately from the still-unproven local UI loop.

## Initial local test results

| Check | Observed result |
|---|---|
| Dependency install | PASS; installed packages; lockfile retained |
| Initial build | FAIL: TS2882 missing CSS side-effect import declarations |
| Fix and rebuild | PASS after adding vite/client declaration and React type packages |
| Clean install and repeat build | PASS: npm ci then npm run build; Vite 8.3.0 |
| Dev server start | Original 0.0.0.0 binding failed on network-interface enumeration. Loopback-only start reported ready at 127.0.0.1:5173 |
| HTTP from separate terminal | FAIL: curl returned code 7 and HTTP 000. A ready log is not proof of cross-tool reachability |
| Browser local page | BLOCKED: browser returned net::ERR_BLOCKED_BY_CLIENT for the local URL. No alternate route or security bypass attempted |
| Rendered UI / Add / Edit / Delete / mobile | NOT RUN; browser could not reach the page |
| SQL / schema / migration / authenticated CRUD | NOT RUN; no connected Supabase access; psql, docker and supabase CLI not found in PATH |
| GitHub push / Vercel deployment | NOT RUN; no connected provider tools or selected remote repository |
| Provider discovery | GitHub, Supabase and Vercel integrations found, all uninstalled at check; suggestions issued, not connections |

This proves code edit → compile → diagnose → fix → rebuild, not the complete browser interaction loop. It does not prove direct control of Moana's Mac/VS Code. No SQL, UI interaction or storage test may be marked passing based on these results.

Known untested prototype limitations: data exists only in React memory; validation accepts non-numeric amounts; deleting the item currently being edited leaves stale edit state; confirmation dialog needs focus management. No real money or accounting logic. Address and verify these only after a supported UI test route is available.

## Reproduction and handoff

Developer commands: npm ci; npm run build; npm run dev. These instructions are for the developer, not technical homework for Moana. node_modules, dist, credentials and environment files are ignored. Lockfile is the reproducible dependency snapshot; avoid npm update until intentionally reviewing versions.

Next user action: authorize Supabase and Vercel integrations through their normal account flow, scoped to the test project. GitHub is already connected. The agent must check actual exposed write capabilities before promising autonomous migrations or deployment. Separately resolve the blocked browser-local route via a supported development environment; no tunnel or alternative browser control is authorized as a workaround. Hosting-only browser testing would prove a different, deployed workflow and must be labelled accordingly.

Production remains blocked until the specification and full Technical POC pass, unless the owner explicitly changes that gate. Account ownership, billing/terms decisions and initial permission consent remain owner actions. Code, tests, migration preparation and debugging remain developer work.
