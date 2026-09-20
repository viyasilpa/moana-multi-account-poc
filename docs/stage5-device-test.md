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

RESOLVED — 2026-09-20: owner explicitly approved the temporary credential setup
after automatic approval review initially rejected it. A JWT-and-random-secret
protected, single-use, one-hour setup function rotated ONLY the synthetic owner
password. Password login and the synthetic catalog check succeeded. The test
verification session was signed out. The setup function was immediately replaced
with a JWT-protected HTTP 410 response (version 2); it contains no credentials or
admin operations. Original production credentials/data are untouched. No password
or setup secret is stored in this repository. Credentials are delivered privately
to the owner in the conversation for the two-device test.

Build/typecheck and 17 mounted UI checks passed, including the PT409 navigation
regression. Deployment cb4629b98943092cf2513b3bb9dfce4ab114883d is READY.

Do not mark the device flow passed until authenticated setup and owner observations
are complete. Physical iPad remains untested; Mac + Android is the available pair.
