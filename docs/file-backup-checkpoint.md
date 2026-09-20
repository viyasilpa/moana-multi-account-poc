# Attachment file backup checkpoint

Added download of versioned JSON containing original file bytes (base64), MIME type, filename and SHA-256. Restore validates all entries before upload, creates new UUID-prefixed copies (no overwrite), downloads restored copies and compares digests. Partial network failure is explicitly reported; restore is not atomic. Backup files are not encrypted. Flat POC owner folder only, maximum 100 files and 10 MiB total, 5 MiB per restored file. This is not an accounting/database backup.

TypeScript/Vite build and diff whitespace check passed. Signed-in export/download/import/upload/read-back has NOT been executed by the agent; requires the owner's Safari session. Do not label stage 2 complete. Data rows and storage objects were not mutated by this code change. Remaining account recovery and full signed-in CRUD/logout acceptance still required. No attempt to access browser tokens or bypass cloud-browser policy.

Revert this frontend change via a new commit if needed; keep private storage policies. No schema changes.
