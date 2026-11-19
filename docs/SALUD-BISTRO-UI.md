# Salud Bistro — Demo UI

The later [menu/image/espresso refinement](MENU-IMAGES-AND-BRANDING.md) supersedes the light-sidebar and original menu-layout notes below, and adds persistent local uploads. The original overhaul audit and data-preservation decisions are retained here for reference.

Salud Bistro is the presentation brand for this local restaurant demonstration. Sora POS remains the platform, package name, service architecture and database model. Branding is centralized in `src/lib/brand.ts` and does not rename stored businesses, orders or receipts.

## Audit and implementation plan

The existing application uses Next.js 16 App Router, React 19, Tailwind CSS 4, Base UI/shadcn components, Zustand, Prisma and SQLite. The audit covered the shared shell, each operational screen, menu/settings forms, Prisma models, payment services, kitchen snapshots, allocation drafts, receipts and the Vitest integration suite.

The main UI issues were a bright accent on most controls, space spent on generic product icons, repeated heavy card styling, a sidebar hidden across much of the tablet/desktop range, dense cart actions, duplicate headings inside table popups, and little useful detail on the overview.

Implementation stages:
1. Shared typography, semantic tokens, official brand assets and responsive shell.
2. Overview, register/cart, table cards and popup entry points.
3. Split-bill clarity, kitchen queue, order history and receipt presentation.
4. Searchable/category-filtered menu, settings sections and shared controls.
5. Existing business regression tests, dashboard-data regression, lint, type checking and production build. Visual inspection remains with the user in Cursor; no browser automation was run for this overhaul.

## Design system

| Role | Value |
| --- | --- |
| Ground / Oat Milk | `#F5F0E7` |
| Card / Warm White | `#FFFDF8` |
| Elevated surface | `#FFFFFF` |
| Ink | `#2D2925` |
| Primary / Espresso | `#231C18` |
| Secondary text | `#72665C` |
| Border | `#DED7CA` |
| Sage Olive | `#A2A47B` |
| Terracotta | `#B76D50` |
| Brass | `#D6B783` |
| Focus | `#9A553D` |
| Success | `#4D6140` on `#E6ECDE` |
| Warning | `#86622D` on `#F4E9D1` |
| Danger | `#9B3E31` on `#F7E5DF` |
| Disabled | `#B8AFA3`, with disabled interaction states |

Tokens live in `src/app/globals.css` and map into Tailwind's theme. DM Sans is used for operations; Fraunces is reserved for selected headings/brand moments. Both variable fonts and their OFL licenses are bundled in `src/assets/fonts` and loaded with `next/font/local`. Numbers use tabular figures. There are no runtime font/CDN requests.

The official, unmodified supplied PNG lives at `public/branding/salud-bistro-logo.png`. `BrandLogo` preserves its square proportions against black. No product photography was invented or downloaded; product images are shown only where the existing product supplies one.

## Screens and workflow

- Shell: Overview, Register, Tables, Orders, Kitchen, Menu and Settings; neutral active navigation; Demo Environment / Local Development identity; actual configured location and local clock.
- Overview: real service metrics, active kitchen ticket count, unpaid open-check balance, five recent orders, table occupancy, and working shortcuts. New read-only queries use the existing database; financial calculations and writes are unchanged.
- Register: compact text-led product cards, optional existing images, clear category selection, visible cart at desktop sizes, and the existing cart drawer below desktop. Order types, modifiers, discounts, historical snapshots, saving and cash checkout remain intact.
- Cart: grouped original items/additions, item count, less prominent cancellation, compact discount disclosure, paired save/kitchen controls and a distinct checkout action. The served-order overlay and linked add-on behavior are retained.
- Tables: all/available/occupied/reserved filters with real counts; compact cards emphasize amount due and time open; direct View bill, Split bill and Checkout actions open the existing table popup. Table headings reopen the order. Existing reservation behavior is retained.
- Settlement: avoids the extra page heading/padding when embedded; shows table total, paid, outstanding and unassigned amounts together. Paid guest checks have a distinct state. Optional naming is tucked into a disclosure. Equal splits, custom shares, partial payments, exact cash, single payer and receipts still use the existing server logic. Unsaved-share and close-table safeguards remain intact.
- Kitchen: wider compact navigation, oldest active tickets first, high-contrast stage strips, larger table/time/quantity hierarchy, prominent special instructions, full-width status actions, linked additions and History. Three-second refresh and forward-only transitions are retained.
- Orders: neutral status indicators, readable cards/rows, search and filters, and scrollable detail dialogs. Completed/cancelled order behavior is unchanged.
- Menu: searchable list with category filtering, distinct category editing, product prices/availability, modifier information where provided, and existing creation/editing/assignment forms.
- Settings: Business Identity, Appearance and System; real save action; local brand preview; font/theme information; platform/version/database context; local-prototype notice.
- Receipts: warm preview framing around the existing white printable document. Table and guest receipts remain in popups; browser printing and the explicitly reserved direct-printer stub are preserved.

## Responsive implementation

- 1440px+: full 224px navigation and persistent 380px cart.
- 1024–1439px: 80px navigation rail and 350px cart; kitchen keeps the rail even on larger displays.
- 768–1023px: navigation drawer, product grid and persistent cart-launch control.
- Below 768px: two-column product selection, stacked settlement/admin layouts, scroll-contained dialogs and usable navigation.

These are implemented source breakpoints, not claimed visual-test results. No before/after screenshots or physical touch-device tests were performed, following the user's instruction to leave browser inspection to Cursor.

## Data protection and known limitations

No live database migration, reset, reseed or business-settings update was performed for the rebrand. All existing order/payment/modifier/kitchen allocation services remain in place. Tests use the existing isolated test database.

Receipt business names currently come from live saved settings rather than per-order identity snapshots. To avoid relabeling old receipts, the overhaul deliberately leaves those settings unchanged. A future identity-snapshot migration is recommended before changing receipt-facing business names. The demo shell and metadata already use Salud Bistro — Demo.

The existing local-preview limits remain: one business/location, cash payments, no staff permissions, tax calculation or native printer integration. A saved receipt may therefore still display the previously configured business name.

Recommended next work: user-led desktop/tablet visual review in Cursor, physical touchscreen and printer checks, per-order receipt identity snapshots, then authentication/permissions before deployment.

## Validation results

- 36 automated tests passed across four test files, including existing checkout, guest allocations/payments, modifiers, served-order locking, additions and persistence logic. A new integration case checks overview balances/recent orders against an actual order and its settlement.
- Full ESLint check passed with no errors or warnings.
- TypeScript no-emit check and the final production build passed, including bundling local fonts and the official-logo favicon.
- Original logo copy was verified byte-for-byte with SHA-256 against the supplied PNG. The favicon is a scaled derivative of that same image.
- Calculated key text/status contrast ratios: primary text 12.71:1, secondary text 5.48:1, success 5.62:1, warning 4.59:1, danger 5.51:1, accent 7.13:1 and new-ticket state 6.39:1. This is a token-level check, not a full accessibility audit.
- Browser, screenshot, desktop/tablet visual and physical-device testing were not performed for this overhaul, per the user's instruction. Those remain for manual inspection in Cursor.

## Component structure

- `src/lib/brand.ts`: demo restaurant identity independent of platform/data.
- `src/components/layout/brand-logo.tsx`: shared official-logo rendering.
- `src/components/layout/app-shell.tsx`, `app-sidebar.tsx`, `app-header.tsx`: responsive shell, navigation, demo/location context and draft-exit warning.
- `src/app/globals.css`: centralized tokens, local font roles, service panels, status indicators, reduced-motion and existing receipt-print rules.
- Existing `dashboard`, `pos`, `tables`, `orders`, `kitchen`, `menu` and `settings` component folders retain their operational responsibilities. Existing shared buttons, inputs, dialogs, sheets, states and toast styling now follow the new system.
- `src/lib/services/dashboard.ts` and the menu catalog add read-only presentation data. Existing write/financial services, routes and Prisma models are unchanged by the overhaul.
