# API acceptance checkpoint

Owner confirmed successful login after the instructed password recovery flow. URL Configuration screenshot shows canonical Site URL and exact recovery redirect. Attachment backup/restore success previously confirmed by screenshot.

Added signed-in owner-triggered API acceptance runner: unique test row insert/read/update; invalid precision rejection; separate unauthenticated HTTP read denial; exact test-row delete and absent-row check; best-effort exact-ID cleanup even after uncertain insert. Does not modify pre-existing rows or files. No credentials collected or exposed. Results displayed locally in the UI, not posted elsewhere.

Build/typecheck passed. Runner has NOT yet been run with real owner session. This checks API data behavior, not UI cancel/delete dialog, other authenticated user denial, local browser rendering or full accounting backup. Do not claim all POC gates passed from compilation alone.
