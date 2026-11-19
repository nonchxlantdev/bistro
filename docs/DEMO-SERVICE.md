# Salud Bistro demo service

Run `npm run demo:seed` from the project root to add a one-time, additive sample service to the configured local SQLite database. It creates a consistent backup in `backups/` before the first population. It does not reset the database, restore original menu prices, rename the business, replace user images, or rewrite existing orders/payments.

The exact order numbers and assigned tables are printed by the command and saved in `data/demo-service-v1.json` (under `SORA_DATA_DIR` if configured).

## What to explore

| Scenario | Where to look / what to try |
| --- | --- |
| Breakfast for two | New kitchen ticket, large/oat cappuccino modifiers and kitchen instructions |
| Lunch for two | Preparing ticket with burger extras and multiple quantities |
| Wraps and dessert | Ready ticket; mark served to move it into History |
| Served lunch + dessert | Original ticket in History; linked add-on contains only Brownie and Cappuccino. Open its register check to add more while sent items stay locked |
| Three-way equal split | Guest 1 paid, Guest 2 partially paid, Guest 3 unpaid; outstanding balances agree with the check |
| Custom shares | Two guest checks with the last dessert unassigned. Save custom amounts, split equally, or use one payer for the full remaining balance |
| Fully paid table | Guest balances are zero but table remains occupied until Close table is selected |
| Open takeaway | Saved coffee/cookie order awaiting cash checkout |
| Completed takeaway | An order discount, cash received/change and a readable receipt |
| Completed specials | Illustrated demo menu products and served history |
| Completed split bill | Individual guest payment records and guest receipts |
| Previous-day sale | Historical completed order, excluded from today's sales |
| Cancelled takeaway | Read-only cancelled order in history |
| Patio reservation (Demo) | Reserved-state table, added as a separate table record |

The Overview reflects these actual persisted records through the existing database queries; no dashboard metrics are hardcoded.

## Menu and image examples

The new **Bistro Specials (Demo)** category includes House Flat White, Bistro Burger and Chocolate Tart, each with an original locally drawn illustration labeled **DEMO ILLUSTRATION**. They are not borrowed or simulated photographs. The images are processed through the same local WebP/thumbnail storage used by product uploads.

Seasonal Berry Tart (Demo) is hidden from the register until availability is enabled in Menu. Demo milk choices demonstrate a separate reusable modifier group without changing existing groups or assignments.

## Preservation and reruns

- Order numbers are issued using the existing counter. All original order numbers and records are retained.
- Only free, unreserved tables are used for new open checks, and the three-guest scenario requires enough seats. If needed, extra demo patio tables are added rather than moving existing checks or changing reservations.
- A separate reservation table is added; existing table names/capacities/reservation flags are retained.
- Demo creation is atomic in one database transaction. If it fails, its new image files are cleaned up and the database transaction is rolled back.
- Stable demo order IDs prevent duplication. Rerunning does **not** refresh timestamps, reopen paid checks, change kitchen progress, or reset allocations. It only reports the current scenario state.
- The default `npm run seed` still creates only the basic catalog/floor. Operational scenarios require the explicit `demo:seed` command.
- The command does not automatically repair a manually deleted partial demo set. There is no destructive reset/remove command.

These sample payments are demo cash records and will contribute to the local dashboard's sales totals. The environment is already identified as Demo. As time passes, elapsed ticket times increase and daily sales move out of today's totals normally; rerunning never rewrites history.

## Verification

A separate temporary SQLite database is used for the operational-demo test. It checks preservation of existing occupied/reserved tables and menu records, all kitchen stages, add-on snapshots, paid/partial/unpaid allocations, single-payer settlement, close-table behavior, another kitchen add-on, illustration files, hidden products and rerun idempotency. Existing application regression tests remain in the suite.

No browser is opened by this command or the implementation workflow. Inspect the populated screens in Cursor and refresh their data as needed.

The first local population added checks **ORD-000009–ORD-000021**, assigned the seven open dine-in examples to **Tables 1–7**, and added **Patio reservation (Demo)**. The live database now has 21 orders and 25 products. The original records were compared against the fresh backup and were unchanged (the order-number counter advanced normally). A second live run confirmed that examples were not reset or duplicated.

Validation: 41 tests passed across six files; the new scripts/tests passed ESLint and TypeScript checking. The backup created before population is `backups/pre-demo-service-2026-11-18T23-15-11-205Z.db`. Product illustrations and thumbnails are in the configured local image directory and should be backed up together with SQLite.
