import type { Prisma, PrismaClient } from "../src/generated/prisma/client";
import { getTenant } from "../src/lib/services/tenant";
import { calculateOrderTotals, lineTotalCents } from "../src/lib/domain/totals";
import { splitEqually, quoteGuestPayment } from "../src/lib/domain/split-bill";
import { storeProductImage, removeStoredImages } from "../src/lib/services/product-images";
import { demoArtwork } from "./demo-artwork";

export const DEMO_PREFIX = "salud_service_demo_v1";
type Item = { productId: string; quantity: number; options?: string[]; note?: string };
type Scenario = { key: string; label: string; minutesAgo: number; table?: boolean; status?: "COMPLETED" | "CANCELLED"; kitchen?: "NEW" | "PREPARING" | "READY" | "SERVED"; items: Item[]; additions?: Item[]; guests?: string[]; allocation?: "equal" | "custom"; payment?: "partial" | "settled"; discount?: number };
const scenarios: Scenario[] = [
  { key: "new", label: "Breakfast check · New kitchen ticket", table: true, minutesAgo: 4, kitchen: "NEW", items: [{ productId: "prod_breakfast", quantity: 2, note: "Demo: eggs well done, toast on the side" }, { productId: "prod_cappuccino", quantity: 2, options: ["mod_large", "mod_oat"] }] },
  { key: "preparing", label: "Lunch for two · Preparing", table: true, minutesAgo: 13, kitchen: "PREPARING", items: [{ productId: "prod_beef_burger", quantity: 2, options: ["mod_cheese", "mod_bacon"], note: "Demo: one burger without onions" }, { productId: "prod_fries", quantity: 2 }, { productId: "prod_lemonade", quantity: 2 }] },
  { key: "ready", label: "Wraps & dessert · Ready to serve", table: true, minutesAgo: 19, kitchen: "READY", items: [{ productId: "prod_chicken_wrap", quantity: 2 }, { productId: "prod_iced_tea", quantity: 2 }, { productId: "prod_cheesecake", quantity: 1, note: "Demo: bring two forks" }] },
  { key: "addons", label: "Served lunch with a linked dessert add-on", table: true, minutesAgo: 31, kitchen: "SERVED", items: [{ productId: "prod_chicken_sandwich", quantity: 2 }, { productId: "prod_orange", quantity: 2 }], additions: [{ productId: "prod_brownie", quantity: 2 }, { productId: "prod_cappuccino", quantity: 1, options: ["mod_large"], note: "Demo add-on: extra hot" }] },
  { key: "partial", label: "Three-way equal split · Paid, part paid & unpaid", table: true, minutesAgo: 43, kitchen: "SERVED", guests: ["Maya", "Jordan", "Guest 3"], allocation: "equal", payment: "partial", items: [{ productId: "prod_beef_burger", quantity: 3 }, { productId: "prod_fries", quantity: 2 }, { productId: "prod_lemonade", quantity: 3 }] },
  { key: "custom", label: "Custom shares with dessert still unassigned", table: true, minutesAgo: 27, kitchen: "SERVED", guests: ["Alex", "Guest 2"], allocation: "custom", items: [{ productId: "prod_chicken_wrap", quantity: 2 }, { productId: "prod_iced_coffee", quantity: 2 }, { productId: "prod_chocolate_cake", quantity: 1 }] },
  { key: "close", label: "All guest balances paid · Ready to close table", table: true, minutesAgo: 56, kitchen: "SERVED", guests: ["Guest 1", "Guest 2"], allocation: "equal", payment: "settled", items: [{ productId: "prod_grilled_cheese", quantity: 2 }, { productId: "prod_water", quantity: 2 }] },
  { key: "takeaway", label: "Takeaway coffee · Saved and awaiting checkout", minutesAgo: 2, kitchen: "NEW", items: [{ productId: `${DEMO_PREFIX}_coffee`, quantity: 2 }, { productId: "prod_cookie", quantity: 2 }] },
  { key: "cash", label: "Completed takeaway · Discount & cash change", minutesAgo: 80, status: "COMPLETED", discount: 200, items: [{ productId: "prod_latte", quantity: 2 }, { productId: "prod_cookie", quantity: 2 }] },
  { key: "illustrated", label: "Completed bistro specials · Product illustrations", minutesAgo: 105, status: "COMPLETED", kitchen: "SERVED", items: [{ productId: `${DEMO_PREFIX}_burger`, quantity: 1 }, { productId: `${DEMO_PREFIX}_tart`, quantity: 1 }] },
  { key: "split_receipt", label: "Completed split bill · Individual guest receipts", minutesAgo: 130, status: "COMPLETED", kitchen: "SERVED", guests: ["Sam", "Guest 2"], allocation: "equal", payment: "settled", items: [{ productId: "prod_breakfast", quantity: 2 }, { productId: "prod_americano", quantity: 2 }] },
  { key: "yesterday", label: "Previous-day completed sale", minutesAgo: 24 * 60 + 30, status: "COMPLETED", items: [{ productId: "prod_mocha", quantity: 2 }, { productId: "prod_cheesecake", quantity: 1 }] },
  { key: "cancelled", label: "Cancelled takeaway · Read-only history", minutesAgo: 65, status: "CANCELLED", items: [{ productId: "prod_iced_coffee", quantity: 1 }] },
];

export async function demoServiceReport(db: PrismaClient) {
  const orders = await db.order.findMany({ where: { id: { startsWith: DEMO_PREFIX + "_order_" } }, include: { table: true, payment: true, kitchenTickets: { orderBy: { orderVersion: "desc" }, take: 1 }, guests: { include: { payments: true } } }, orderBy: { orderNumber: "asc" } });
  return orders.map((order) => ({ orderId: order.id, orderNumber: order.orderNumber, scenario: scenarios.find((entry) => order.id === `${DEMO_PREFIX}_order_${entry.key}`)?.label ?? "Demo check", table: order.table?.name ?? (order.orderType === "DINE_IN" ? "Closed dine-in check" : "Takeaway"), status: order.status, kitchen: order.kitchenTickets[0]?.status ?? "Not sent", totalCents: order.totalCents, paidCents: (order.payment?.amountCents ?? 0) + order.guests.reduce((sum, guest) => sum + guest.payments.reduce((paid, payment) => paid + payment.amountCents, 0), 0) }));
}

export async function populateDemoService(db: PrismaClient, now = new Date()) {
  // Never replay, reopen or refresh checks the user has already interacted with.
  if (await db.order.count({ where: { id: { startsWith: DEMO_PREFIX + "_order_" } } })) return { alreadyPresent: true, orders: await demoServiceReport(db) };
  const tenant = await getTenant(db);
  const images: Array<{ imagePath: string; imageThumbnailPath: string }> = [];
  try {
    for (const kind of ["coffee", "burger", "tart"] as const) images.push(await storeProductImage(await demoArtwork(kind)));
    await db.$transaction(async (tx) => {
      if (await tx.order.count({ where: { id: { startsWith: DEMO_PREFIX + "_order_" } } })) throw new Error("Demo service is already being populated. Run again to view its guide.");
      const category = await tx.category.create({ data: { id: `${DEMO_PREFIX}_category`, businessId: tenant.business.id, name: "Bistro Specials (Demo)", sortOrder: 5, isActive: true } });
      const specials = [
        { key: "coffee", name: "House Flat White (Demo)", price: 950 },
        { key: "burger", name: "Bistro Burger (Demo)", price: 2200 },
        { key: "tart", name: "Chocolate Tart (Demo)", price: 1350 },
      ];
      for (const [index, special] of specials.entries()) await tx.product.create({ data: { id: `${DEMO_PREFIX}_${special.key}`, businessId: tenant.business.id, categoryId: category.id, name: special.name, description: "Demonstration menu item with an original local illustration, not a photograph.", priceCents: special.price, isActive: true, ...images[index] } });
      await tx.product.create({ data: { id: `${DEMO_PREFIX}_seasonal`, businessId: tenant.business.id, categoryId: category.id, name: "Seasonal Berry Tart (Demo)", description: "Hidden sample: enable availability in Menu to show this on the register.", priceCents: 1400, isActive: false } });
      await tx.modifierGroup.create({ data: { id: `${DEMO_PREFIX}_milk`, businessId: tenant.business.id, name: "Demo milk choices", minSelect: 0, maxSelect: 1, options: { create: [{ id: `${DEMO_PREFIX}_oat`, name: "Oat milk", priceDeltaCents: 200 }, { id: `${DEMO_PREFIX}_almond`, name: "Almond milk", priceDeltaCents: 200 }] }, products: { create: { productId: `${DEMO_PREFIX}_coffee` } } } });
      const products = await tx.product.findMany({ where: { businessId: tenant.business.id }, include: { modifierGroups: { include: { group: { include: { options: true } } } } } });
      const freeTables = await tx.restaurantTable.findMany({ where: { businessId: tenant.business.id, locationId: tenant.location.id, isReserved: false, session: null }, orderBy: { sortOrder: "asc" } });
      let extraTable = 0;
      async function takeTable(seats: number) {
        const index = freeTables.findIndex((table) => table.capacity >= seats);
        if (index >= 0) return freeTables.splice(index, 1)[0];
        return tx.restaurantTable.create({ data: { id: `${DEMO_PREFIX}_extra_${++extraTable}`, businessId: tenant.business.id, locationId: tenant.location.id, name: `Demo Patio ${extraTable}`, capacity: Math.max(4, seats), sortOrder: 20 + extraTable } });
      }
      for (const scenario of scenarios) {
        const id = `${DEMO_PREFIX}_order_${scenario.key}`;
        const createdAt = new Date(now.getTime() - scenario.minutesAgo * 60_000);
        const table = scenario.table ? await takeTable(scenario.guests?.length ?? 2) : null;
        const sourceItems = [...scenario.items, ...(scenario.additions ?? [])];
        const lines = sourceItems.map((input, position) => {
          const product = products.find((entry) => entry.id === input.productId);
          if (!product?.isActive) throw new Error(`Demo needs available product: ${input.productId}. No changes were committed.`);
          const groups = product.modifierGroups.map((link) => link.group).filter((group) => group.isActive);
          const options = groups.flatMap((group) => group.options.filter((option) => option.isActive && input.options?.includes(option.id)).map((option) => ({ optionId: option.id, optionName: option.name, groupName: group.name, priceDeltaCents: option.priceDeltaCents })));
          if (options.length !== (input.options?.length ?? 0)) throw new Error(`Demo modifier choices are unavailable for ${product.name}.`);
          for (const group of groups) { const selected = options.filter((option) => option.groupName === group.name).length; if (selected < group.minSelect || selected > group.maxSelect) throw new Error(`Demo choices do not match current rules for ${group.name}.`); }
          const unitPriceCents = product.priceCents + options.reduce((sum, option) => sum + option.priceDeltaCents, 0);
          return { id: `${id}_line_${position}`, productId: product.id, productNameSnapshot: product.name, name: product.name, quantity: input.quantity, unitPriceCents, lineTotalCents: lineTotalCents(unitPriceCents, input.quantity), instructions: input.note ?? "", modifiers: options, position };
        });
        const totals = calculateOrderTotals(lines, scenario.discount ?? 0);
        const issued = await tx.orderCounter.update({ where: { businessId: tenant.business.id }, data: { nextNumber: { increment: 1 } } });
        const orderNumber = `ORD-${String(issued.nextNumber - 1).padStart(6, "0")}`;
        const finishedAt = scenario.status ? new Date(createdAt.getTime() + 12 * 60_000) : null;
        const version = scenario.additions ? 5 : scenario.kitchen === "SERVED" ? 3 : scenario.kitchen ? 2 : 1;
        await tx.order.create({ data: { id, businessId: tenant.business.id, locationId: tenant.location.id, tableId: table?.id ?? null, orderNumber, orderType: table || scenario.guests ? "DINE_IN" : "TAKEAWAY", status: scenario.status ?? "OPEN", ...totals, version: version + (scenario.status === "COMPLETED" ? 1 : 0), createdAt, updatedAt: now, completedAt: scenario.status === "COMPLETED" ? finishedAt : null, cancelledAt: scenario.status === "CANCELLED" ? finishedAt : null, items: { create: lines.map((line) => ({ id: line.id, productId: line.productId, productNameSnapshot: line.productNameSnapshot, quantity: line.quantity, unitPriceCents: line.unitPriceCents, lineTotalCents: line.lineTotalCents, instructions: line.instructions, position: line.position, createdAt, modifiers: { create: line.modifiers } })) } } });
        if (table) await tx.tableSession.create({ data: { orderId: id, tableId: table.id, createdAt } });
        const snapshot = (entries: typeof lines) => entries.map((line) => ({ itemId: line.id, name: line.name, quantity: line.quantity, ...(line.modifiers.length ? { modifiers: line.modifiers.map((modifier) => modifier.optionName) } : {}), ...(line.instructions ? { instructions: line.instructions } : {}) }));
        const changes = (entries: typeof lines) => snapshot(entries).map((line) => ({ name: line.name, quantity: line.quantity, ...(line.modifiers ? { modifiers: line.modifiers } : {}), ...(line.instructions ? { instructions: line.instructions } : {}) }));
        if (scenario.kitchen) {
          const original = lines.slice(0, scenario.items.length);
          await tx.kitchenTicket.create({ data: { id: `${id}_ticket_1`, orderId: id, orderVersion: 2, status: scenario.kitchen, snapshotJson: JSON.stringify(snapshot(original)), changesJson: JSON.stringify(changes(original)), idempotencyKey: `${id}_kitchen_1`, createdAt, updatedAt: now } });
          if (scenario.additions) await tx.kitchenTicket.create({ data: { id: `${id}_ticket_2`, orderId: id, orderVersion: 5, status: "NEW", snapshotJson: JSON.stringify(snapshot(lines)), changesJson: JSON.stringify(changes(lines.slice(scenario.items.length))), idempotencyKey: `${id}_kitchen_2`, createdAt: new Date(now.getTime() - 2 * 60_000), updatedAt: now } });
        }
        if (scenario.guests) await createGuestChecks(tx, id, lines, scenario, createdAt, finishedAt ?? now);
        else if (scenario.status === "COMPLETED") {
          const tenderedCents = Math.ceil(totals.totalCents / 500) * 500;
          await tx.payment.create({ data: { orderId: id, method: "CASH", amountCents: totals.totalCents, tenderedCents, changeCents: tenderedCents - totals.totalCents, idempotencyKey: `${id}_cash`, createdAt: finishedAt! } });
        }
      }
      await tx.restaurantTable.create({ data: { id: `${DEMO_PREFIX}_reserved`, businessId: tenant.business.id, locationId: tenant.location.id, name: "Patio reservation (Demo)", capacity: 4, sortOrder: 19, isReserved: true } });
    }, { timeout: 30_000 });
  } catch (error) { await removeStoredImages(images.flatMap((entry) => Object.values(entry))); throw error; }
  return { alreadyPresent: false, orders: await demoServiceReport(db) };
}

async function createGuestChecks(tx: Prisma.TransactionClient, orderId: string, lines: Array<{ id: string; quantity: number; unitPriceCents: number; lineTotalCents: number }>, scenario: Scenario, createdAt: Date, now: Date) {
  const guests = [];
  for (const [index, name] of scenario.guests!.entries()) guests.push(await tx.orderGuest.create({ data: { id: `${orderId}_guest_${index}`, orderId, seatNumber: index + 1, displayName: name, createdAt: new Date(createdAt.getTime() + 60_000), updatedAt: now } }));
  const gross = new Map(guests.map((guest) => [guest.id, 0]));
  for (const [index, line] of lines.entries()) {
    if (scenario.allocation === "custom" && index === lines.length - 1) continue;
    const shares = scenario.allocation === "custom" ? [{ guestId: guests[index % guests.length].id, amountCents: line.lineTotalCents }] : splitEqually(line.lineTotalCents, guests.map((guest) => guest.id));
    for (const share of shares.filter((entry) => entry.amountCents > 0)) {
      await tx.guestItemAllocation.create({ data: { orderGuestId: share.guestId, orderItemId: line.id, amountCents: share.amountCents, quantityUnits: line.unitPriceCents > 0 && share.amountCents % line.unitPriceCents === 0 ? share.amountCents / line.unitPriceCents : null } });
      gross.set(share.guestId, gross.get(share.guestId)! + share.amountCents);
    }
  }
  for (const [index, guest] of guests.entries()) {
    const due = gross.get(guest.id)!;
    const amount = scenario.payment === "settled" || (scenario.payment === "partial" && index === 0) ? due : scenario.payment === "partial" && index === 1 ? Math.min(500, due) : 0;
    if (!amount) continue;
    const tendered = Math.ceil(amount / 500) * 500;
    await tx.guestPayment.create({ data: { orderGuestId: guest.id, ...quoteGuestPayment(due, amount, tendered), idempotencyKey: `${orderId}_guest_cash_${index}`, createdAt: new Date(now.getTime() - 60_000) } });
  }
}
