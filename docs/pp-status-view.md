# PP counterparty status — 2026-09-21

Status filters offer PP as a read-only counterparty perspective, not a new entity.
Only accounts linked to party kind pp appear. Opening/closing balances are negated
and debit/credit swapped; positive means the entity owes PP, negative means PP owes
the entity. Receivable and payable totals are separate. CSV and drill-down ledger
use the same PP perspective. Source transaction detail remains explicitly labelled
as the entity's original accounting. This view covers only entries in this app.

Existing entity reports retain their original direction and consolidated reports
do not double-count PP. No database schema or balance writes. Verification: 24 UI
tests and typecheck/build pass, including both PP balance signs, totals, exclusion
of non-PP balances, ledger direction and switching back to an entity.
