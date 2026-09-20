# Single-owner gate recovery

Before applying: poc_items contained zero rows; four per-user CRUD policies existed. Existing tables and policies are preserved by this additive migration.

Fail-closed emergency recovery: as database administrator, DELETE FROM public.app_owner WHERE singleton = true; this revokes all authenticated POC data access without deleting POC items or Auth users. Rebind only the verified owner using an administrative transaction. Never grant clients write access to app_owner.

Do not blindly revert to the earlier per-user-only policies: that would let other authenticated users create their own records. Keep the restrictive gate during frontend rollback. Record any future schema rollback as a new migration, never erase migration history.

The original test_items.sql predates the gate and uses an unapproved synthetic owner, so its positive-path assertions are superseded by owner-gate tests. This is not proof of real JWT login or Data API access.
