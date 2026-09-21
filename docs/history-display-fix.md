# Current view versus history — 2026-09-21

Transaction detail previously expanded every revision and reversal line at once,
confusing historical accounts with current balances. Default detail now shows only
the latest non-reversal lines, with an explicit checkbox to inspect full immutable
history. The table explains that journal lines belong to one transaction. A void
has no effective lines and offers history instead. Status reports exclude archived
zero-balance accounts even when showing zeros; nonzero archived balances remain
visible to prevent hiding outstanding amounts. Income/expense reports retain
archived accounts with period activity.

No database writes or history deletion. Read-only inspection confirmed one live
opening transaction and inactive, zero-net erroneous external-party accounts.
Verification: 21 mounted UI tests plus typecheck/build passed, including explicit
history expansion/collapse and archived zero-account filtering.
