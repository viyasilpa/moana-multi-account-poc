# Private storage POC checkpoint

Owner created poc-attachments; database inspection confirmed public=false. Applied technical_poc_private_attachments from db/poc/private_attachments.sql. Verified storage.objects RLS enabled and exactly SELECT/INSERT owner policies present. No UPDATE/DELETE policy; files retained. Security advisor found only previously acknowledged leaked-password-protection warning.

UI provides a synthetic text-file upload/read-back SHA-256 comparison, optional file upload, list and authenticated download. No public URLs, signed links, secret keys or file deletion. POC files are standalone, not accounting evidence linked to ledger revisions. Frontend allows PDF/JPEG/PNG/TXT up to 5 MiB; this is a UX limit, NOT a server-enforced bucket limit. Bucket retains dashboard default size/type limits. No accounting rollout until final server file limits are set. POC uses ASCII filenames; Thai names are normalized to underscores.

Build/typecheck and whitespace check passed. Actual authenticated upload/read-back and unauthenticated access denial on an existing object are NOT yet verified. User must run the built-in test in their signed-in Safari; agent has no owner password/session. Prior cloud-browser verification was blocked by security review, not bypassed. No real attachments were accessed or modified.

Recovery: revert frontend via new commit; remove only named POC storage policies via new migration to deny client access. Never delete storage metadata directly; do not delete retained objects. Backup/restore and complete POC gates still outstanding.
