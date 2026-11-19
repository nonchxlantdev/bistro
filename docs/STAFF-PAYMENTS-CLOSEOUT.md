# Staff sign-in, close-out payments and end of day

## Flow
Demo password → disclaimer → welcome → **staff sign-in** (tap your name, enter a 4-digit PIN) → app.
The header shows who is signed in; tap it to switch staff. The red icon logs out of the demo entirely.

Demo team (added automatically when a business has no staff):

| Name   | Role    | PIN  |
| ------ | ------- | ---- |
| Maria  | Manager | 1234 |
| Daniel | Server  | 1111 |
| Ana    | Server  | 2222 |
| Luis   | Server  | 3333 |

Only managers can add staff, change roles or reset PINs (Settings → Staff). Deactivated staff keep their history.
PINs are hashed (scrypt) and never leave the server; five wrong tries lock that person for five minutes.

## Closing out an order
- Kitchen → **Mark served** shows a "Take payment" shortcut.
- Orders list: served open orders show **Ready to pay** with a **Take payment** button (`/orders/<id>/pay`).
- Tables: served tables read "Served, ready to pay"; the button is **Take payment**, then **Close out** once paid.
- Payment: **Cash** or **Card** → optional tip (No tip / presets / Custom % or $) → for cash, cash received and change.
  Card payments are recorded only (run the amount on the card machine). Split bills use the same panel per guest.
- Each payment stores method, tip, the staff member and the business day. Orders store who opened and who closed them.
- Receipts show "Served by", card/cash per payment, tips and the total with tip.

## End of day (`/closeout`)
- **Start the day** with the opening cash float (default from Settings, $100). Editable until the first payment.
  If nobody starts the day, the first payment opens it with the default float.
- Live totals: sales, cash, card, tips; **should be in the drawer** = float + cash sales + cash tips;
  **card batch total** = card sales + card tips (match against the card machine slip); a per-server table.
- **Close the day**: enter cash counted → shows Balanced / Short / Over; optional note; warns about open orders.
  Closed days are listed under Previous days and print as an 80mm slip.

## Settings
Payments & tips: tip prompt on/off, up to six tip percentages, default opening float.

## Data
Migration `20261119040000_staff_days_tips` is additive: existing payments read as cash, no tip, no staff.
