-- Canonical timestamp rendering must not depend on the client's database timezone.
-- Preserve microseconds; do not normalize through a JavaScript Date (millisecond precision).
alter function accounting.backup() set timezone = 'UTC';
