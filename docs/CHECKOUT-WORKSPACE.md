# Table checkout and split-bill workspace

## User flow

Tables > Checkout now opens a unified settlement dialog. One Payment is the default even when several guest checks already exist. The table total, amount paid and outstanding balance remain visible. Existing allocations/payments are summarized and are never cleared by switching views.

One Payment includes item details, discount, previously paid amounts, remaining balance, cash tendered, exact-cash/excess-cash shortcuts and calculated change. It uses the existing `payRemaining` transaction, including unassigned items. Payment leaves the table occupied; Close table is a separate explicit action after all balances and allocations are complete.

Split Bill is optional. Its methods are:
- Equal: enter a payee count, review the final per-person shares and confirm the proposed split. Remainder cents follow stable payee order.
- Guest/items: compact item rows open one allocation editor. Enter individual amounts, use whole units, or divide the remaining unpaid portion equally. Paid allocations are read-only.
- Custom: enter each payee's final total after discount. The proposal must reconcile exactly. The allocation planner converts final amounts into item shares while keeping the existing proportional discount calculation unchanged.

Guest cards show allocated, paid and outstanding amounts. Select one card for one payment form, optional naming, payment history and the guest receipt. Partial payments are supported. After a successful payment the workspace returns to the guest overview and offers a receipt.

Dine-in checkout from the register uses this same dialog. Takeaway cash checkout keeps its existing single-sale behavior, with dismissal blocked while a payment is in progress and order-version validation on submission.

## Safety and preserved behavior

- No migration or live data rewrite was required. SQLite and a source ZIP were backed up before implementation.
- Backups: `backups/pre-checkout-ux-2026-11-18T23-24-18-630Z.db` and `backups/checkout-ux-source-20261118-172419.zip`.
- Existing partial payments, item snapshots, kitchen links, additions and receipts remain in the existing models/services.
- Existing payment actions retain their idempotency keys and server validation. UI requests are blocked synchronously during an in-progress mutation; failed payment keys are retained for retry.
- `configureSplit` is a new version-checked atomic allocation action. It replaces only unpaid allocations after staff confirmation, preserves all paid allocation rows, removes only payees with no payments when reducing the count, and creates extra payees in stable seat order.
- The existing largest-remainder discount formula was extracted into a shared pure function so previews and saved summaries use the same calculation. There is no new payment or tax formula.
- The existing restriction on reallocating discounted checks after any payment remains. Staff can continue existing guest payments or use One Payment instead.
- A demonstrated whole-table settlement gap was fixed: if every old guest has already paid and new items are added, a new payee receives the new unassigned items. Old paid allocations remain untouched.
- Close table stays disabled for outstanding balances, incomplete assignments, unsaved proposals or pending requests. A 100% discounted check can be allocated at zero final shares and then explicitly closed without recording unnecessary cash.
- Escape/backdrop/close buttons cannot dismiss a pending table payment. Dirty allocation proposals require confirmation before switching modes, refreshing or closing. Focused item edits have their own discard guard. Receipt actions cannot display unsaved proposals as final bills.

## Layout and components

- `src/components/orders/settlement-workspace.tsx`: shared data/controller, mode navigation, guest overview, payment handling, header/footer and sole body scroll region.
- `cash-payment-fields.tsx`: cash/partial amount controls and existing-rule change preview.
- `split-planner.tsx`: reviewed equal/custom proposals and confirmation.
- `item-allocation-dialog.tsx`: focused amount/unit item editor.
- `src/components/tables/table-order-dialog.tsx`: Base UI dialog/focus shell and synchronous close guards.
- `split-bill-screen.tsx`: existing split route now uses the shared workspace.
- `src/lib/domain/settlement-plan.ts`: pure allocation proposals and locked-payee preservation.
- `src/lib/services/guest-checks.ts`: existing payment transactions plus atomic proposal saving and the demonstrated unassigned-item fix.

The desktop dialog is up to 1100px wide with a constrained viewport height. Tablet uses nearly the full viewport. Below 640px it fills the screen. Header and footer do not scroll; the body has one vertical scroll region. Item editing and receipts are separate focus-managed dialogs rather than additional nested main-content scrollers. Input labels, status/error announcements, visible focus controls and touch-size payment actions follow the existing espresso design system.

## Verification and remaining review

Automated tests cover two/four guests with one payer; two/three-way equal shares and remainder cents; custom totals; partial/full guest payments; whole-table settlement after partial payments; unassigned additions after every old payee has paid; stale-version rejection; duplicate payment replay; preservation of paid allocation rows; closure guards; receipt totals and payments through a fresh database connection; existing kitchen/add-on/history behavior; and final custom shares with discounts, including fully discounted checks.

The pure allocation tests exercise many small-cent combinations against the unchanged discount rule and verify proposals do not mutate saved inputs.

No browser was opened, per the user's instruction. Actual desktop/tablet/mobile rendering, focus/keyboard behavior, receipt printing and a running Next.js restart must be manually verified in Cursor. Source breakpoints and automated data tests do not substitute for those visual/device checks. Cash-only, no configured tax and no native direct printer connection remain existing platform limits.

Final checks passed: **48 tests across seven test files**, full ESLint, TypeScript and the production build. There were no live migrations, resets or scripted payment writes. The final live comparison showed activity on open demo check ORD-000010 after the backup, including two new UUID-keyed payments; that live progress was preserved rather than restored from the backup.
