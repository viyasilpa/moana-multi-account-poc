# Opening counterpart display and owner correction — 2026-09-21

Opening forms previously omitted the automatically mirrored side of each related
pair. This led the owner to enter a duplicate under an external party. Both sides
now display, with the derived side read-only and its source identified. Only the
editable side is submitted. Inactive accounts are omitted from opening choices;
external-party choices follow active accounts of the selected entity and reset
when the entity changes.

Owner-confirmed live correction used the existing posting command to create an
opening revision, preserving original immutable history. Exactly three confirmed
duplicate external-party rows were removed only after verifying they matched the
already-generated Mam mirrors. All other non-equity net balances were asserted
unchanged in the same transaction. Master before/after states were audited.
The external party remains enabled only for Mam. Active relationships for SP/PTZ
are Mam, PP and each other; TSW has Mam and PP. Existing related account IDs and
links were retained; unused relationships were archived, not deleted. Mam account
labels read แหม่ม. No amounts or private backup data are stored in this repository.

Verification: 19 mounted UI checks including reciprocal display, one-sided payload,
inactive omission and reverse-side edit retention; typecheck/build pass. Live
readback confirms revision 2 with revision 1 retained and the requested active
account sets. No test postings were made in production. Opening equity adjusts
with the removal of duplicate balances; it is not artificially held constant.
