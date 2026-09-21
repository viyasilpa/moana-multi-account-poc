# Expense funding choice — 2026-09-21

Expenses use one required จ่ายจาก choice listing active bank/cash accounts with
their owning entity and PP จ่ายแทนกิจการ. The separate funding-type dropdown is
removed. PP selection removes any prior money_account_id and sets funding=pp;
selecting a bank sets funding=money and its account ID. PP remains a counterparty,
not a fabricated bank account. Income/transfer/settlement flows are unchanged.

Verification: 23 mounted UI checks pass, including bank-to-PP submission without
a bank ID and PP-to-bank submission with the chosen bank. Typecheck/build pass.
No live accounting records or balances were modified.
