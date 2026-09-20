# Logical restore rehearsal — 2026-09-20

Executed db/poc/test_logical_restore.sql successfully on the POC project. One existing POC row plus two synthetic edge-case rows were copied into transaction-local temporary tables, serialized to a versioned JSON envelope and restored to a second temporary table. Bidirectional EXCEPT ALL comparison passed for every field. Large exact decimals are encoded as strings. Unicode, newlines, timestamps, IDs, notes, duplicate rejection and invalid decimal precision rejection verified. Transaction rolled back; source table and file objects untouched.

This is an in-database serialization/restore rehearsal, NOT a durable backup, downloaded-file restore, full disaster recovery test, schema/Auth backup or attachment binary restore. No personal row contents published in this repository. Full accounting backup/import remains unimplemented.

Storage evidence: owner ran the built-in upload test; one synthetic poc-test.txt object (31 bytes) observed. Actual anonymous requests to the existing object through authenticated and public endpoints returned errors without file bytes. Owner's upload/read-back success message has not been separately captured; do not claim a verified hash comparison solely from file existence.

Remaining gates: explicit full owner CRUD/reload/logout acceptance, independent authenticated-other-user API denial, account recovery, durable backup and restore including attachment bytes, UI verification where browser permission allows. Local browser access and a Vercel sign-in redirect were blocked; no bypass attempted. Full POC is not yet passed and no waiver granted. Accounting schema is not created.
