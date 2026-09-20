# Recovery and acceptance checkpoint

Owner screenshot confirms attachment backup JSON was downloaded, selected, restored as a new copy and content verification passed for 1 file. Both original and restored object appear in the UI. This closes that tested single-file backup/restore flow; it is not a full accounting backup.

Implemented password recovery: generic reset-request response, explicit canonical redirect, recovery session form, 12-character minimum and confirmation, updateUser, global sign-out after success. No email sent or password changed by agent. Build/typecheck passed; actual email delivery and password reset remain unverified.

Dashboard configuration prerequisite (connector has no Auth configuration endpoint): Site URL https://moana-multi-account-poc.vercel.app and allowlisted Redirect URL https://moana-multi-account-poc.vercel.app/?recovery=1 . Preserve other valid URLs; do not use wildcard origins. Owner must check/configure this through their authenticated Supabase dashboard. Do not request passwords or email recovery tokens in chat.

Acceptance requires owner to request reset, follow newest email link, set a new password, then login and verify original test data remain. Email delivery may be limited by Supabase built-in SMTP; diagnose if it fails, do not assume success.

Stage 2 is NOT complete: remaining signed-in CRUD/cancel/confirm-delete/reload/logout acceptance, independent other-user authenticated API denial where feasible, and account recovery. Do not mutate Auth tables directly or extract session tokens to run tests. Frontend rollback via new commit is independent of owner/database policies.
