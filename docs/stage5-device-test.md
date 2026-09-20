# Two-device acceptance preparation

`/device.html` mounts the real AccountingApp against ONLY the isolated synthetic
Supabase project bpedekosireooxrsaerp. Its client ignores production environment
variables, uses a separate nonpersistent Auth session, and requires the synthetic
owner password. No password or admin key is present in the public source.
The catalog must have six explicitly synthetic entities and an existing opening.

The prepare button posts one fixed idempotent synthetic expense through the
normal accounting_post RPC. Both devices resolve to the same transaction.
Instructions keep both edit forms on the same revision, save on Mac, then submit
the stale Android form. This proves two-device stale-edit handling, not simultaneous
network arrival; overlapping backend HTTP concurrency has separate prior evidence.
The UI can also exercise real mobile ledger controls and attachment workflows.

Preparing this revealed a UI defect: PT409 was omitted from known rollback errors,
leaving a stale edit in pending state. The fix clears pending state for PT409,
retains the draft and enables navigation to reload. Network-unknown errors still
preserve the exact request key. A mounted regression covers this distinction.

BLOCKER: no usable synthetic-owner password is available for the owner to log in.
Automatic approval review rejected deploying a JWT-and-random-secret-protected,
single-use setup Edge Function that would rotate that test user's password.
Reason: existing synthetic testing approval did not clearly authorize the exact
persistent privileged credential-management mechanism. It was NOT deployed and
the password was NOT changed. No alternative credential-changing path was tried.
Explicit approval is required before proceeding with that mechanism. Scope must
remain this synthetic user/project, with the setup endpoint disabled immediately
after verification. Original production credentials/data are untouched.

Do not mark the device flow passed until authenticated setup and owner observations
are complete. Physical iPad remains untested; Mac + Android is the available pair.
