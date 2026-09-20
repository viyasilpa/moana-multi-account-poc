# Login and persistence checkpoint

Technical POC only, not production accounting.

Implemented email/password login, SDK-managed sessions, local-device logout, owner-gated loading, Data API add/edit/delete, native confirmation dialog, exact two-decimal input validation with a bounded POC amount range, and busy-state protection. UPDATE/DELETE check original description and amount to detect most concurrent edits (not a full ledger revision protocol).

Supabase public project URL and publishable key are intentionally client-visible; no privileged keys or personal owner identifiers are included. VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY can override POC defaults. Do not point preview builds at future production financial data. Dependencies pinned with npm lockfile.

Validation: TypeScript and Vite production build passed; git diff --check passed. Local browser verification was blocked by browser policy for localhost, so not claimed. Real owner login, reload persistence, CRUD, cancellation, confirmed deletion, logout and recovery remain end-to-end acceptance tests. No passwords were requested in chat or handled by the agent. Private storage and restore gates remain pending.

Recovery: revert this frontend commit through a new commit. Keep the database owner gate; do not revert to unrestricted per-user access. No DB schema changed in this checkpoint.
