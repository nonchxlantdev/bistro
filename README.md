# Sora POS

Local restaurant and café point of sale. The 0.2 preview is a single-business register for a Windows PC, a Windows touchscreen, or a tablet browser. It stores everything in a SQLite file on this machine.

The restaurant demo interface is now **Salud Bistro — Demo**, with the supplied official logo, locally bundled DM Sans/Fraunces, a warm bistro theme and responsive service screens. Sora POS remains the underlying platform. Receipts display Salud Bistro; historical financial records are unchanged. See [the UI design and implementation notes](docs/SALUD-BISTRO-UI.md) for screen changes, responsive breakpoints, data preservation and known limitations.

Menu management now uses Products / Modifiers / Categories tabs and supports persistent local product-image uploads. The sidebar uses a cropped official wordmark on espresso, with a light workspace. See [menu images, storage, backup and branding notes](docs/MENU-IMAGES-AND-BRANDING.md). Apply migrations and restart the local server after updating. Back up `data/product-images` (or your configured `SORA_DATA_DIR`) together with SQLite.

To populate realistic operational examples, run `npm run demo:seed`. This additive command backs up the database, creates sample checks/kitchen stages/split payments/history and illustrated demo specials, and does not reset existing records or duplicate the examples on rerun. See [the demo service guide](docs/DEMO-SERVICE.md).

Table and dine-in checkout now use a shared One Payment / Split Bill workspace. Existing guest checks do not force a split; equal/custom proposals are reviewed before saving, item shares use focused editors, and one selected guest has one payment form. Table closure remains explicit. See [checkout implementation and safety notes](docs/CHECKOUT-WORKSPACE.md).

Demo access now requires the shared demo password, acceptance of the demo disclaimer, and then a brief official-logo welcome. First-use tips appear after key selections and can be replayed or disabled from Help. See [demo access and first-use notes](docs/DEMO-ACCESS-AND-TIPS.md) for setup and verification.

This build is for local demonstration. Its shared password gate does not provide individual staff accounts, roles, tenant isolation or card processing.

## Stack

- Next.js App Router, React, and TypeScript
- Tailwind CSS and shadcn/ui
- Prisma ORM with SQLite
- Zod validation
- Vitest for business-logic tests

## Prerequisites

- Windows 10 or 11
- Node.js 20 or newer (this project was built with Node.js 24)
- npm

## Install on Windows

Open PowerShell in the project folder:

```powershell
cd "D:\Entrepreneur\Vision Forge Ltd\SoraPOS System\sora-pos-management"
Copy-Item .env.example .env
npm install
if (-not (Test-Path prisma\dev.db)) { New-Item -ItemType File prisma\dev.db | Out-Null }
npx prisma migrate deploy
npm run seed
npm run demo:access
```

`npm install` generates the Prisma client. `npm run seed` creates the underlying Demo Café sample business, Main Branch, 12 tables, and the sample menu; the restaurant UI and receipts display Salud Bistro. Running the seed again does not duplicate that data and does not delete sales. Before running `npm run demo:access`, set the temporary `SORA_DEMO_PASSWORD` environment variable as explained in the access setup notes.

## Daily commands

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The home page sends you to the register.

```powershell
npm run lint
npm test
npx tsc --noEmit
npm run build
npm start
```

`npm start` serves the production build after `npm run build`.

## Database

The database file is `prisma/dev.db`.

Apply migrations:

```powershell
npx prisma migrate deploy
```

Create a new migration while developing:

```powershell
npm run db:migrate
```

Seed demo data without deleting orders:

```powershell
npm run seed
```

Reset the demo database, including sales:

```powershell
Remove-Item prisma\dev.db, prisma\dev.db-journal, prisma\dev.db-wal, prisma\dev.db-shm -ErrorAction SilentlyContinue
New-Item -ItemType File prisma\dev.db | Out-Null
npx prisma migrate deploy
npm run seed
```

Stop the dev server before deleting the database file.

## What works in 0.1

- Dark register with search, categories, and a cart
- Dine-in and takeaway orders
- Saved orders that survive refresh and a server restart
- One open dine-in order per table
- Cash checkout with change, recorded once per sale
- Menu, table, order, and settings management
- Money stored as integer cents in BZD

## Version 0.2 work in progress

- Saved dine-in orders can be split into guest checks. Assign each item's full amount, then record one or more cash payments per guest. A table remains occupied until all checks are settled and **Close table** is selected.
- Save each changed item's shares before taking payment or printing. Unsaved entries on other items remain in the workspace when one item is saved; navigation links and page refresh warn before leaving those entries behind.
- Amounts can be divided equally, with remainder cents assigned in guest order. Order discounts are allocated proportionally after all items have been assigned. Once a guest has paid, their allocations are locked; discounted orders cannot be reallocated after any payment.
- A saved order can be explicitly sent to the kitchen. The kitchen queue polls every three seconds and shows new or changed quantities; saving alone does not send a ticket.
- Product customization supports single- and multi-select modifier groups and kitchen instructions. Cappuccino size and milk choices and burger extras are seeded examples. Prices are calculated on the server and saved with the order; kitchen tickets, guest checks and receipts retain the historical selections.
- Menu Management includes modifier-group editing, option prices and availability, selection limits, and product assignments. Existing order snapshots do not change when the menu is edited.
- Print views are available for an entire table or an individual guest check. Use the browser's Print button and select the appropriate printer.
- To transfer a saved order, choose another available table in the register, confirm, and save the order. Guest payments and kitchen tickets remain with the order.

The three-guest cash workflow has been checked in a browser with an isolated database, including refresh, table release, order history, and persistence after restarting the server. Responsive layouts have been inspected in a browser; testing on physical touchscreens and receipt printers remains outstanding.

## Known limitations

- No staff login or permissions
- One seeded business and one location
- Cash only
- Tax is shown as "Not configured" and is not calculated
- No native receipt-printer integration, cash drawer or inventory
- Modifier groups are shared across their assigned products; editing a group changes the choices for all of those products
- Not production-ready and not tax-compliant

## Planned next milestone

Complete the browser acceptance tests and modifier management, then add staff authentication and real tenant isolation before any shared or hosted deployment. GST and multi-location support remain future work.
