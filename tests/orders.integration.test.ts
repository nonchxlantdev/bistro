import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/db/prisma";
import { seed } from "../prisma/seed";
import { cancelOrder, checkoutOrder, getOrder, saveOrder } from "../src/lib/services/orders";
import { listTables } from "../src/lib/services/tables";
import { AppError } from "../src/lib/errors";
import { getGuestChecks, updateGuestChecks } from "../src/lib/services/guest-checks";
import { listKitchenTickets, sendKitchenTicket, setKitchenStatus } from "../src/lib/services/kitchen";
import { listModifierGroups, saveModifierGroup } from "../src/lib/services/modifiers";
import { getPosCatalog, updateProduct } from "../src/lib/services/catalog";
import { getDashboard } from "../src/lib/services/dashboard";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

async function counts() {
  const [businesses, locations, tables, categories, products, orders, modifierGroups, modifierOptions, modifierLinks] = await Promise.all([
    prisma.business.count(),
    prisma.location.count(),
    prisma.restaurantTable.count(),
    prisma.category.count(),
    prisma.product.count(),
    prisma.order.count(),
    prisma.modifierGroup.count(),
    prisma.modifierOption.count(),
    prisma.productModifierGroup.count(),
  ]);
  return { businesses, locations, tables, categories, products, orders, modifierGroups, modifierOptions, modifierLinks };
}

describe("orders, tables, checkout, and seed", () => {
  beforeAll(async () => {
    await seed(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("seeds demo data once and leaves existing sales in place", async () => {
    const first = await counts();
    expect(first).toMatchObject({
      businesses: 1,
      locations: 1,
      tables: 12,
      categories: 4,
      products: 20,
      orders: 0,
      modifierGroups: 3,
      modifierOptions: 8,
      modifierLinks: 3,
    });

    await seed(prisma);
    expect(await counts()).toEqual(first);

    const created = await saveOrder({
      orderType: "TAKEAWAY",
      discountCents: 0,
      items: [{ productId: "prod_espresso", quantity: 1 }],
    });
    await prisma.product.update({ where: { id: "prod_espresso" }, data: { priceCents: 550 } });
    await seed(prisma);

    const after = await counts();
    expect(after.businesses).toBe(1);
    expect(after.products).toBe(20);
    expect(after.orders).toBe(1);
    const espresso = await prisma.product.findUniqueOrThrow({ where: { id: "prod_espresso" } });
    expect(espresso.priceCents).toBe(550);
    const reopened = await getOrder(created.id);
    expect(reopened.items[0]?.unitPriceCents).toBe(500);
    expect(reopened.orderNumber).toBe("ORD-000001");

    await prisma.product.update({ where: { id: "prod_espresso" }, data: { priceCents: 500 } });
  });

  it("saves a dine-in order, occupies the table, and reopens the same items", async () => {
    const saved = await saveOrder({
      orderType: "DINE_IN",
      tableId: "tbl_03",
      discountCents: 0,
      items: [
        { productId: "prod_cappuccino", quantity: 2 },
        { productId: "prod_chicken_sandwich", quantity: 1 },
      ],
    });

    expect(saved.orderNumber).toBe("ORD-000002");
    expect(saved.totalCents).toBe(850 * 2 + 1500);
    expect(saved.items).toEqual([
      expect.objectContaining({ name: "Cappuccino", quantity: 2, unitPriceCents: 850 }),
      expect.objectContaining({ name: "Chicken Sandwich", quantity: 1, unitPriceCents: 1500 }),
    ]);

    const tables = await listTables();
    const table = tables.find((entry) => entry.id === "tbl_03");
    expect(table?.status).toBe("OCCUPIED");
    expect(table?.order?.id).toBe(saved.id);

    await expect(
      saveOrder({
        orderType: "DINE_IN",
        tableId: "tbl_03",
        discountCents: 0,
        items: [{ productId: "prod_water", quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "TABLE_OCCUPIED" });

    const reopened = await getOrder(saved.id);
    expect(reopened.items.map((item) => [item.name, item.quantity])).toEqual([
      ["Cappuccino", 2],
      ["Chicken Sandwich", 1],
    ]);

    const updated = await saveOrder({
      orderId: reopened.id,
      version: reopened.version,
      orderType: "DINE_IN",
      tableId: "tbl_03",
      discountCents: 0,
      items: [
        { productId: "prod_cappuccino", quantity: 2 },
        { productId: "prod_chicken_sandwich", quantity: 1 },
        { productId: "prod_brownie", quantity: 1 },
      ],
    });
    expect(updated.totalCents).toBe(850 * 2 + 1500 + 700);
    expect(updated.version).toBe(reopened.version + 1);
    expect(updated.items.slice(0, 2).map((item) => item.id)).toEqual(
      reopened.items.map((item) => item.id),
    );

    await expect(
      saveOrder({
        orderId: updated.id,
        version: reopened.version,
        orderType: "DINE_IN",
        tableId: "tbl_03",
        discountCents: 0,
        items: [{ productId: "prod_cappuccino", quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejects insufficient cash, completes a cash sale once, and frees the table", async () => {
    const open = await getOrder(
      (await listTables()).find((table) => table.id === "tbl_03")!.order!.id,
    );
    const total = open.totalCents;

    await expect(
      checkoutOrder(open.id, { tenderedCents: total - 1, idempotencyKey: "cash-short-1" }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CASH" });

    const paid = await checkoutOrder(open.id, {
      tenderedCents: total + 500,
      idempotencyKey: "cash-ok-1",
    });
    expect(paid.status).toBe("COMPLETED");
    expect(paid.payment).toMatchObject({
      method: "CASH",
      amountCents: total,
      tenderedCents: total + 500,
      changeCents: 500,
    });

    const replay = await checkoutOrder(open.id, {
      tenderedCents: total + 500,
      idempotencyKey: "cash-ok-1",
    });
    expect(replay.payment?.changeCents).toBe(500);
    expect(await prisma.payment.count({ where: { orderId: open.id } })).toBe(1);

    await expect(
      checkoutOrder(open.id, { tenderedCents: total + 500, idempotencyKey: "cash-second-key" }),
    ).rejects.toMatchObject({ code: "ALREADY_PAID" });

    await expect(
      saveOrder({
        orderId: open.id,
        version: paid.version,
        orderType: "DINE_IN",
        tableId: "tbl_03",
        discountCents: 0,
        items: [{ productId: "prod_cappuccino", quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "ORDER_LOCKED" });

    const tables = await listTables();
    expect(tables.find((table) => table.id === "tbl_03")?.status).toBe("AVAILABLE");
  });

  it("does not reuse order numbers after an order is removed", async () => {
    const created = await saveOrder({
      orderType: "TAKEAWAY",
      discountCents: 0,
      items: [{ productId: "prod_cookie", quantity: 1 }],
    });
    expect(created.orderNumber).toBe("ORD-000003");
    await prisma.order.delete({ where: { id: created.id } });
    const next = await saveOrder({
      orderType: "TAKEAWAY",
      discountCents: 0,
      items: [{ productId: "prod_cookie", quantity: 1 }],
    });
    expect(next.orderNumber).toBe("ORD-000004");
  });

  it("protects allocated items and paid guest checks from legacy actions", async () => {
    const order = await saveOrder({
      orderType: "DINE_IN", tableId: "tbl_04", discountCents: 0,
      items: [{ productId: "prod_cappuccino", quantity: 2 }],
    });
    const guest = await prisma.orderGuest.create({
      data: { orderId: order.id, displayName: "Guest 1", seatNumber: 1 },
    });
    await prisma.guestItemAllocation.create({
      data: { orderGuestId: guest.id, orderItemId: order.items[0].id, amountCents: 1700, quantityUnits: 2 },
    });
    await expect(saveOrder({
      orderId: order.id, version: order.version, orderType: "DINE_IN", tableId: "tbl_04",
      discountCents: 0, items: [{ productId: "prod_cappuccino", quantity: 1 }],
    })).rejects.toMatchObject({ code: "ALLOCATED_ITEM_LOCKED" });
    await expect(checkoutOrder(order.id, { tenderedCents: 1700, idempotencyKey: "legacy-guest-test" }))
      .rejects.toMatchObject({ code: "GUEST_CHECKS_EXIST" });
    await prisma.guestPayment.create({
      data: { orderGuestId: guest.id, amountCents: 500, tenderedCents: 500, changeCents: 0, idempotencyKey: "guest-guard-test" },
    });
    await expect(cancelOrder(order.id, order.version)).rejects.toMatchObject({ code: "PAYMENTS_EXIST" });
    expect((await getOrder(order.id)).status).toBe("OPEN");
  });

  it("allocates guest checks, takes partial payments idempotently, and closes only when settled", async () => {
    const order = await saveOrder({ orderType: "DINE_IN", tableId: "tbl_05", discountCents: 0,
      items: [{ productId: "prod_cappuccino", quantity: 2 }, { productId: "prod_beef_burger", quantity: 1 }, { productId: "prod_cheesecake", quantity: 1 }] });
    let state = await getGuestChecks(order.id);
    for (let n = 0; n < 3; n++) state = await updateGuestChecks(order.id, { action: "addGuest", version: state.version });
    const [g1, g2, g3] = state.guests;
    const [coffee, burger, cake] = state.items;
    state = await updateGuestChecks(order.id, { action: "allocate", version: state.version, itemId: coffee.id,
      allocations: [{ guestId: g1.id, amountCents: 850, quantityUnits: 1 }, { guestId: g2.id, amountCents: 850, quantityUnits: 1 }] });
    state = await updateGuestChecks(order.id, { action: "allocate", version: state.version, itemId: burger.id,
      allocations: [{ guestId: g1.id, amountCents: 1800, quantityUnits: 1 }] });
    state = await updateGuestChecks(order.id, { action: "allocate", version: state.version, itemId: cake.id,
      allocations: [{ guestId: g3.id, amountCents: 1200, quantityUnits: 1 }] });
    expect(state.complete).toBe(true);
    expect(state.guests.map((g) => g.totalCents)).toEqual([2650, 850, 1200]);
    await expect(updateGuestChecks(order.id, { action: "close", version: state.version })).rejects.toMatchObject({ code: "BALANCE_REMAINS" });
    const firstPayment = { action: "pay" as const, version: state.version, guestId: g1.id, amountCents: 2650, tenderedCents: 3000, idempotencyKey: "guest-payment-one" };
    state = await updateGuestChecks(order.id, firstPayment);
    const replay = await updateGuestChecks(order.id, firstPayment);
    expect(replay.guests[0].payments).toHaveLength(1);
    expect(replay.guests[0].payments[0].changeCents).toBe(350);
    await expect(updateGuestChecks(order.id, { ...firstPayment, tenderedCents: 3100 })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(updateGuestChecks(order.id, { action: "pay", version: state.version, guestId: g2.id, amountCents: 851, tenderedCents: 1000, idempotencyKey: "guest-overpayment" })).rejects.toMatchObject({ code: "INVALID_PAYMENT" });
    state = await updateGuestChecks(order.id, { action: "pay", version: state.version, guestId: g2.id, amountCents: 300, tenderedCents: 500, idempotencyKey: "guest-payment-two" });
    expect(state.guests.map((g) => g.balanceCents)).toEqual([0, 550, 1200]);
    await expect(saveOrder({ orderId: order.id, version: state.version, orderType: "TAKEAWAY", discountCents: 0,
      items: [{ productId: "prod_cappuccino", quantity: 2 }, { productId: "prod_beef_burger", quantity: 1 }, { productId: "prod_cheesecake", quantity: 1 }] })).rejects.toMatchObject({ code: "GUEST_CHECKS_EXIST" });
    await saveOrder({ orderId: order.id, version: state.version, orderType: "DINE_IN", tableId: "tbl_06", discountCents: 0,
      items: [{ productId: "prod_cappuccino", quantity: 2 }, { productId: "prod_beef_burger", quantity: 1 }, { productId: "prod_cheesecake", quantity: 1 }] });
    state = await getGuestChecks(order.id);
    expect((await listTables()).find((table) => table.id === "tbl_05")?.status).toBe("AVAILABLE");
    expect((await listTables()).find((table) => table.id === "tbl_06")?.status).toBe("OCCUPIED");
    await expect(updateGuestChecks(order.id, { action: "allocate", version: state.version, itemId: burger.id, allocations: [{ guestId: g2.id, amountCents: 1800, quantityUnits: 1 }] })).rejects.toMatchObject({ code: "PAID_ALLOCATION_LOCKED" });
    state = await updateGuestChecks(order.id, { action: "pay", version: state.version, guestId: g2.id, amountCents: 550, tenderedCents: 550, idempotencyKey: "guest-payment-three" });
    state = await updateGuestChecks(order.id, { action: "pay", version: state.version, guestId: g3.id, amountCents: 1200, tenderedCents: 1200, idempotencyKey: "guest-payment-four" });
    state = await updateGuestChecks(order.id, { action: "close", version: state.version });
    expect(state.status).toBe("COMPLETED");
    expect((await listTables()).find((table) => table.id === "tbl_06")?.status).toBe("AVAILABLE");
    expect((await getGuestChecks(order.id)).guests.reduce((sum, g) => sum + g.paidCents, 0)).toBe(order.totalCents);
  });

  it("reconciles discounted guest shares and prevents cross-order allocations", async () => {
    const order = await saveOrder({ orderType: "DINE_IN", tableId: "tbl_07", discountCents: 1,
      items: [{ productId: "prod_cappuccino", quantity: 2 }] });
    let state = await updateGuestChecks(order.id, { action: "addGuest", version: order.version });
    state = await updateGuestChecks(order.id, { action: "addGuest", version: state.version });
    const [one, two] = state.guests;
    await expect(updateGuestChecks(order.id, { action: "allocate", version: state.version, itemId: state.items[0].id,
      allocations: [{ guestId: "another-order", amountCents: 100, quantityUnits: null }] })).rejects.toMatchObject({ code: "INVALID_ALLOCATION" });
    state = await updateGuestChecks(order.id, { action: "allocate", version: state.version, itemId: state.items[0].id,
      allocations: [{ guestId: one.id, amountCents: 850, quantityUnits: 1 }, { guestId: two.id, amountCents: 850, quantityUnits: 1 }] });
    expect(state.guests.map((guest) => guest.totalCents)).toEqual([849, 850]);
    expect(state.guests.reduce((sum, guest) => sum + guest.totalCents, 0)).toBe(order.totalCents);
  });

  it("splits a whole bill automatically and lets one payer settle the rest", async () => {
    const order = await saveOrder({ orderType: "DINE_IN", tableId: "tbl_05", discountCents: 1, items: [{ productId: "prod_cappuccino", quantity: 2 }, { productId: "prod_brownie", quantity: 1 }] });
    let state = await updateGuestChecks(order.id, { action: "addGuest", version: order.version });
    state = await updateGuestChecks(order.id, { action: "addGuest", version: state.version });
    expect(state.guests.map((guest) => guest.displayName)).toEqual(["Guest 1", "Guest 2"]);
    state = await updateGuestChecks(order.id, { action: "splitAll", version: state.version });
    expect(state.complete).toBe(true);
    expect(state.guests.reduce((sum, guest) => sum + guest.totalCents, 0)).toBe(order.totalCents);
    state = await updateGuestChecks(order.id, { action: "pay", version: state.version, guestId: state.guests[0].id, amountCents: 100, tenderedCents: 100, idempotencyKey: "split-initial-payment" });
    const remaining = order.totalCents - 100;
    const request = { action: "payRemaining" as const, version: state.version, amountCents: remaining, tenderedCents: remaining + 500, idempotencyKey: "split-table-payment" };
    state = await updateGuestChecks(order.id, request);
    expect(state.guests.every((guest) => guest.balanceCents === 0)).toBe(true);
    expect(state.guests.flatMap((guest) => guest.payments).reduce((sum, payment) => sum + payment.changeCents, 0)).toBe(500);
    expect((await updateGuestChecks(order.id, request)).guests.flatMap((guest) => guest.payments)).toHaveLength(3);
    await expect(updateGuestChecks(order.id, { ...request, tenderedCents: remaining + 600 })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    state = await updateGuestChecks(order.id, { action: "close", version: state.version });
    expect(state.status).toBe("COMPLETED");
  });

  it("lets one payer cover unassigned items without requiring guest names", async () => {
    const order = await saveOrder({ orderType: "DINE_IN", tableId: "tbl_05", discountCents: 0, items: [{ productId: "prod_espresso", quantity: 1 }] });
    const state = await updateGuestChecks(order.id, { action: "payRemaining", version: order.version, amountCents: order.totalCents, tenderedCents: order.totalCents, idempotencyKey: "unassigned-table-payment" });
    expect(state.complete).toBe(true);
    expect(state.guests.every((guest) => guest.balanceCents === 0)).toBe(true);
    await updateGuestChecks(order.id, { action: "close", version: state.version });
  });

  it("sends only kitchen changes and keeps kitchen status independent of payment", async () => {
    const order = await saveOrder({ orderType: "DINE_IN", tableId: "tbl_08", discountCents: 0,
      items: [{ productId: "prod_cappuccino", quantity: 2 }] });
    const sent = await sendKitchenTicket(order.id, order.version, "kitchen-first-test");
    expect(sent.created).toBe(true);
    expect((await sendKitchenTicket(order.id, order.version, "kitchen-first-test")).ticketId).toBe(sent.ticketId);
    const current = await getOrder(order.id);
    expect((await sendKitchenTicket(order.id, current.version, "kitchen-unchanged-test")).created).toBe(false);
    const updated = await saveOrder({ orderId: order.id, version: current.version, orderType: "DINE_IN", tableId: "tbl_08", discountCents: 0,
      items: [{ productId: "prod_cappuccino", quantity: 1 }, { productId: "prod_brownie", quantity: 1 }] });
    const changed = await sendKitchenTicket(order.id, updated.version, "kitchen-change-test");
    const tickets = await listKitchenTickets();
    expect(tickets.find((ticket) => ticket.id === changed.ticketId)?.changes).toEqual([
      { name: "Cappuccino", quantity: -1 }, { name: "Brownie", quantity: 1 },
    ]);
    await setKitchenStatus(sent.ticketId!, "NEW", "PREPARING");
    expect((await getOrder(order.id)).status).toBe("OPEN");
    expect((await listKitchenTickets()).find((ticket) => ticket.id === sent.ticketId)?.status).toBe("PREPARING");
  });

  it("prices customized lines on the server, preserves snapshots, and sends them to the kitchen", async () => {
    const saved = await saveOrder({ orderType: "DINE_IN", tableId: "tbl_09", discountCents: 0, items: [
      { productId: "prod_cappuccino", quantity: 1, modifierOptionIds: ["mod_large", "mod_almond"], instructions: "Extra hot" },
      { productId: "prod_cappuccino", quantity: 1, modifierOptionIds: ["mod_oat"], instructions: "" },
    ] });
    expect(saved.items.map((item) => item.unitPriceCents)).toEqual([1350, 1050]);
    expect(saved.totalCents).toBe(2400);
    expect(saved.items[0].instructions).toBe("Extra hot");
    expect(saved.items[0].modifiers.map((modifier) => modifier.optionName).sort()).toEqual(["Almond milk", "Large"]);
    await expect(saveOrder({ orderId: saved.id, version: saved.version, orderType: "DINE_IN", tableId: "tbl_09", discountCents: 0,
      items: [{ productId: "prod_cappuccino", quantity: 2 }] })).rejects.toMatchObject({ code: "CUSTOMIZATION_CLIENT_OUTDATED" });
    await expect(saveOrder({ orderType: "TAKEAWAY", discountCents: 0, items: [{ productId: "prod_cappuccino", quantity: 1, modifierOptionIds: ["mod_bacon"] }] })).rejects.toMatchObject({ code: "INVALID_MODIFIERS" });
    await expect(saveOrder({ orderType: "TAKEAWAY", discountCents: 0, items: [{ productId: "prod_cappuccino", quantity: 1, modifierOptionIds: ["mod_small", "mod_large"] }] })).rejects.toMatchObject({ code: "INVALID_MODIFIERS" });
    await prisma.modifierOption.update({ where: { id: "mod_large" }, data: { name: "Huge", priceDeltaCents: 900 } });
    const updated = await saveOrder({ orderId: saved.id, version: saved.version, orderType: "DINE_IN", tableId: "tbl_09", discountCents: 0,
      items: saved.items.map((item) => ({ itemId: item.id, productId: item.productId!, quantity: item.quantity,
        modifierOptionIds: item.modifiers.map((modifier) => modifier.optionId!), instructions: item.instructions })) });
    expect(updated.items.map((item) => item.id)).toEqual(saved.items.map((item) => item.id));
    expect(updated.items[0].unitPriceCents).toBe(1350);
    expect(updated.items[0].modifiers.some((modifier) => modifier.optionName === "Large")).toBe(true);
    const ticket = await sendKitchenTicket(saved.id, updated.version, "kitchen-modifiers-test");
    const sent = (await listKitchenTickets()).find((entry) => entry.id === ticket.ticketId)!;
    expect(sent.changes[0]).toMatchObject({ name: "Cappuccino", quantity: 1, instructions: "Extra hot" });
    expect(sent.changes[0].modifiers).toEqual(expect.arrayContaining(["Large", "Almond milk"]));
    let check = await getGuestChecks(saved.id);
    expect(check.items[0].modifiers.map((modifier) => modifier.name)).toEqual(expect.arrayContaining(["Large", "Almond milk"]));
    check = await updateGuestChecks(saved.id, { action: "addGuest", version: check.version });
    check = await updateGuestChecks(saved.id, { action: "addGuest", version: check.version });
    check = await updateGuestChecks(saved.id, { action: "allocate", version: check.version, itemId: saved.items[0].id,
      allocations: [{ guestId: check.guests[0].id, amountCents: 1350, quantityUnits: 1 }] });
    check = await updateGuestChecks(saved.id, { action: "allocate", version: check.version, itemId: saved.items[1].id,
      allocations: [{ guestId: check.guests[1].id, amountCents: 1050, quantityUnits: 1 }] });
    expect(check.guests.map((guest) => guest.totalCents)).toEqual([1350, 1050]);
    check = await updateGuestChecks(saved.id, { action: "pay", version: check.version, guestId: check.guests[0].id, amountCents: 1350, tenderedCents: 1500, idempotencyKey: "guest-customized-test" });
    await expect(saveOrder({ orderId: saved.id, version: check.version, orderType: "DINE_IN", tableId: "tbl_09", discountCents: 0,
      items: updated.items.map((item, index) => ({ itemId: item.id, productId: item.productId!, quantity: index === 0 ? 2 : 1,
        modifierOptionIds: item.modifiers.map((modifier) => modifier.optionId!), instructions: item.instructions })) })).rejects.toMatchObject({ code: "ALLOCATED_ITEM_LOCKED" });
    await prisma.modifierOption.update({ where: { id: "mod_large" }, data: { name: "Large", priceDeltaCents: 300 } });
  });

  it("enforces required and single-select modifier group limits", async () => {
    await prisma.modifierGroup.create({ data: { id: "required-test", businessId: "biz_demo", name: "Preparation", minSelect: 1, maxSelect: 1,
      options: { create: [{ id: "required-one", name: "Warm", priceDeltaCents: 100 }, { id: "required-two", name: "Cold", priceDeltaCents: 0 }] },
      products: { create: { productId: "prod_cookie" } } } });
    await expect(saveOrder({ orderType: "TAKEAWAY", discountCents: 0, items: [{ productId: "prod_cookie", quantity: 1 }] })).rejects.toMatchObject({ code: "INVALID_MODIFIERS" });
    await expect(saveOrder({ orderType: "TAKEAWAY", discountCents: 0, items: [{ productId: "prod_cookie", quantity: 1, modifierOptionIds: ["required-one", "required-two"] }] })).rejects.toMatchObject({ code: "INVALID_MODIFIERS" });
    const saved = await saveOrder({ orderType: "TAKEAWAY", discountCents: 0, items: [{ productId: "prod_cookie", quantity: 1, modifierOptionIds: ["required-one"] }] });
    expect(saved.totalCents).toBe(500);
  });

  it("locks served orders and kitchen history while allowing checkout", async () => {
    const order = await saveOrder({ orderType: "TAKEAWAY", discountCents: 0, items: [{ productId: "prod_espresso", quantity: 1 }] });
    const sent = await sendKitchenTicket(order.id, order.version, "served-lock-test");
    const ticketId = sent.ticketId!;
    await expect(setKitchenStatus(ticketId, "NEW", "READY")).rejects.toMatchObject({ code: "INVALID_KITCHEN_TRANSITION" });
    await setKitchenStatus(ticketId, "NEW", "PREPARING");
    await expect(setKitchenStatus(ticketId, "PREPARING", "NEW")).rejects.toMatchObject({ code: "INVALID_KITCHEN_TRANSITION" });
    await setKitchenStatus(ticketId, "PREPARING", "READY");
    const beforeServed = await getOrder(order.id);
    await setKitchenStatus(ticketId, "READY", "SERVED");
    const served = await getOrder(order.id);
    expect(served.kitchenServed).toBe(true);
    expect(served.version).toBe(beforeServed.version + 1);
    await expect(setKitchenStatus(ticketId, "SERVED", "READY")).rejects.toMatchObject({ code: "INVALID_KITCHEN_TRANSITION" });
    await expect(saveOrder({ orderId: order.id, version: served.version, orderType: "TAKEAWAY", discountCents: 0, items: [{ productId: "prod_espresso", quantity: 2 }] })).rejects.toMatchObject({ code: "ORDER_SERVED" });
    await expect(cancelOrder(order.id, served.version)).rejects.toMatchObject({ code: "ORDER_SERVED" });
    expect((await sendKitchenTicket(order.id, served.version, "served-resend-test")).created).toBe(false);
    await expect(checkoutOrder(order.id, { tenderedCents: 1000, version: beforeServed.version, idempotencyKey: "served-stale-checkout" })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await checkoutOrder(order.id, { tenderedCents: 1000, version: served.version, idempotencyKey: "served-payment-test" });
    expect((await getOrder(order.id)).status).toBe("COMPLETED");
  });

  it("adds to served orders without changing sent items and links only additions in the kitchen", async () => {
    const order = await saveOrder({ orderType: "TAKEAWAY", discountCents: 0, items: [{ productId: "prod_espresso", quantity: 1 }] });
    const originalTicket = await sendKitchenTicket(order.id, order.version, "addon-original-ticket");
    await setKitchenStatus(originalTicket.ticketId!, "NEW", "PREPARING");
    await setKitchenStatus(originalTicket.ticketId!, "PREPARING", "READY");
    await setKitchenStatus(originalTicket.ticketId!, "READY", "SERVED");
    const served = await getOrder(order.id);
    const base = { orderId: order.id, version: served.version, orderType: "TAKEAWAY" as const, discountCents: 0, additionsOnly: true, supportsCustomizations: true };
    const originalLine = { itemId: served.items[0].id, productId: "prod_espresso", quantity: 1 };
    await expect(saveOrder({ ...base, items: [{ ...originalLine, quantity: 2 }] })).rejects.toMatchObject({ code: "ORDER_SERVED" });
    await expect(saveOrder({ ...base, items: [{ productId: "prod_brownie", quantity: 1 }] })).rejects.toMatchObject({ code: "ORDER_SERVED" });
    await expect(saveOrder({ ...base, discountCents: 100, items: [originalLine] })).rejects.toMatchObject({ code: "ORDER_SERVED" });
    const addition = await saveOrder({ ...base, items: [originalLine, { productId: "prod_espresso", quantity: 1 }] });
    expect(addition.totalCents).toBe(served.totalCents + 500);
    expect(addition.items).toHaveLength(2);
    expect(addition.lockedItemIds).toEqual([originalLine.itemId]);
    expect(addition.additionItemIds).toEqual([addition.items[1].id]);
    const sent = await sendKitchenTicket(order.id, addition.version, "addon-second-ticket");
    const kitchen = await listKitchenTickets();
    expect(kitchen.find((ticket) => ticket.id === originalTicket.ticketId)?.status).toBe("SERVED");
    expect(kitchen.find((ticket) => ticket.id === sent.ticketId)).toMatchObject({ additionNumber: 1, linkedTicketId: originalTicket.ticketId, changes: [{ name: "Espresso", quantity: 1 }] });
    const current = await getOrder(order.id);
    expect(current.lockedItemIds).toEqual(current.items.map((item) => item.id));
    await expect(saveOrder({ ...base, version: current.version, items: [originalLine, { itemId: current.items[1].id, productId: "prod_espresso", quantity: 2 }] })).rejects.toMatchObject({ code: "ORDER_SERVED" });
    await setKitchenStatus(sent.ticketId!, "NEW", "PREPARING");
    await setKitchenStatus(sent.ticketId!, "PREPARING", "READY");
    await setKitchenStatus(sent.ticketId!, "READY", "SERVED");
    const updated = await getOrder(order.id);
    await checkoutOrder(order.id, { version: updated.version, tenderedCents: 1000, idempotencyKey: "addon-checkout" });
    expect((await getOrder(order.id)).status).toBe("COMPLETED");
  });

  it("keeps the service overview tied to real open balances and settled sales", async () => {
    const before = await getDashboard();
    const order = await saveOrder({ orderType: "TAKEAWAY", discountCents: 0, items: [{ productId: "prod_brownie", quantity: 1 }] });
    const open = await getDashboard();
    expect(open.openOrders).toBe(before.openOrders + 1);
    expect(open.awaitingPaymentCents).toBe(before.awaitingPaymentCents + order.totalCents);
    expect(open.recentOrders[0]).toMatchObject({ id: order.id, status: "OPEN", tableName: "Takeaway", totalCents: order.totalCents });
    await checkoutOrder(order.id, { tenderedCents: order.totalCents, idempotencyKey: "overview-settlement" });
    const settled = await getDashboard();
    expect(settled.openOrders).toBe(before.openOrders);
    expect(settled.awaitingPaymentCents).toBe(before.awaitingPaymentCents);
    expect(settled.salesCents).toBe(before.salesCents + order.totalCents);
    expect(settled.completedToday).toBe(before.completedToday + 1);
    expect(settled.activeKitchenTickets).toBe(before.activeKitchenTickets);
  });

  it("edits modifier groups without changing historical sales and rejects stale edits", async () => {
    const sale = await saveOrder({ orderType: "TAKEAWAY", discountCents: 0, items: [{ productId: "prod_cappuccino", quantity: 1, modifierOptionIds: ["mod_large"] }] });
    await checkoutOrder(sale.id, { tenderedCents: 2000, idempotencyKey: "modifier-history-payment" });
    const group = (await listModifierGroups()).find((entry) => entry.id === "mod_group_coffee_size")!;
    const input = { name: group.name, minSelect: group.minSelect, maxSelect: group.maxSelect, isActive: group.isActive, revision: group.revision,
      productIds: [...group.productIds, "prod_beef_burger"], options: group.options.map((option) => ({ id: option.id, name: option.id === "mod_large" ? "Tall" : option.name,
        priceDeltaCents: option.id === "mod_large" ? 450 : option.priceDeltaCents, isActive: option.isActive })) };
    await saveModifierGroup(group.id, input);
    await expect(saveModifierGroup(group.id, input)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const historical = await getOrder(sale.id);
    expect(historical.items[0].modifiers[0]).toMatchObject({ optionName: "Large", priceDeltaCents: 300 });
    expect(historical.totalCents).toBe(1150);
    const catalog = await getPosCatalog();
    expect(catalog.products.find((product) => product.id === "prod_beef_burger")?.modifierGroups.some((entry) => entry.id === group.id)).toBe(true);
    expect(catalog.products.find((product) => product.id === "prod_cappuccino")?.modifierGroups.flatMap((entry) => entry.options).find((option) => option.id === "mod_large")).toMatchObject({ name: "Tall", priceDeltaCents: 450 });
    const current = (await listModifierGroups()).find((entry) => entry.id === group.id)!;
    await expect(saveModifierGroup(group.id, { ...input, revision: current.revision, minSelect: 4, maxSelect: 4 })).rejects.toMatchObject({ code: "INVALID_SELECTION_LIMITS" });
    await expect(saveModifierGroup(group.id, { ...input, revision: current.revision, productIds: ["other-business-product"] })).rejects.toMatchObject({ code: "INVALID_PRODUCT" });
    await expect(saveModifierGroup(group.id, { ...input, revision: current.revision, options: input.options.map((option) => ({ ...option, priceDeltaCents: -5000 })) })).rejects.toMatchObject({ code: "NEGATIVE_PRODUCT_PRICE" });
    const afterRejected = (await listModifierGroups()).find((entry) => entry.id === group.id)!;
    expect(afterRejected.revision).toBe(current.revision);
    await saveModifierGroup(null, { name: "Small cup discount", minSelect: 0, maxSelect: 1, isActive: true, productIds: ["prod_espresso"], options: [{ name: "Small cup", priceDeltaCents: -200, isActive: true }] });
    await expect(updateProduct("prod_espresso", { name: "Espresso", description: "Short, concentrated coffee.", categoryId: "cat_coffee", priceCents: 100, isActive: true })).rejects.toMatchObject({ code: "NEGATIVE_PRODUCT_PRICE" });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: "prod_espresso" } })).priceCents).toBe(500);
  });

  it("settles two or four existing guest checks with one payment and explicit closure", async () => {
    for (const count of [2, 4]) {
      const order = await saveOrder({ orderType: "DINE_IN", tableId: "tbl_10", discountCents: 0, items: [{ productId: "prod_water", quantity: 2 }] });
      let check = await getGuestChecks(order.id);
      for (let n = 0; n < count; n++) check = await updateGuestChecks(order.id, { action: "addGuest", version: check.version });
      await expect(updateGuestChecks(order.id, { action: "close", version: check.version })).rejects.toMatchObject({ code: "BALANCE_REMAINS" });
      const request = { action: "payRemaining" as const, version: check.version, amountCents: 600, tenderedCents: 1000, idempotencyKey: `one-payer-${count}` };
      check = await updateGuestChecks(order.id, request);
      expect(check.status).toBe("OPEN");
      expect(check.guests.reduce((sum, guest) => sum + guest.paidCents, 0)).toBe(600);
      expect(check.guests.every((guest) => guest.balanceCents === 0)).toBe(true);
      expect(check.guests.flatMap((guest) => guest.payments).reduce((sum, payment) => sum + payment.changeCents, 0)).toBe(400);
      expect((await updateGuestChecks(order.id, request)).guests.flatMap((guest) => guest.payments)).toHaveLength(1);
      expect((await listTables()).find((table) => table.id === "tbl_10")?.status).toBe("OCCUPIED");
      check = await updateGuestChecks(order.id, { action: "close", version: check.version });
      expect(check.status).toBe("COMPLETED");
    }
  });

  it("previews/saves a full equal split, adjusts payee count and handles remainder cents", async () => {
    const order = await saveOrder({ orderType: "DINE_IN", tableId: "tbl_10", discountCents: 0, items: [{ productId: "prod_water", quantity: 1 }, { productId: "prod_iced_tea", quantity: 1 }] });
    let check = await updateGuestChecks(order.id, { action: "configureSplit", version: order.version, mode: "equal", count: 3 });
    expect(check.complete).toBe(true);
    expect(check.guests.map((guest) => guest.totalCents)).toEqual([267, 267, 266]);
    const persisted = await getGuestChecks(order.id);
    expect(persisted.guests.map((guest) => guest.totalCents)).toEqual([267, 267, 266]);
    check = await updateGuestChecks(order.id, { action: "configureSplit", version: check.version, mode: "equal", count: 2 });
    expect(check.guests.map((guest) => guest.totalCents)).toEqual([400, 400]);
    await expect(updateGuestChecks(order.id, { action: "configureSplit", version: persisted.version, mode: "equal", count: 4 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    check = await updateGuestChecks(order.id, { action: "payRemaining", version: check.version, amountCents: 800, tenderedCents: 1000, idempotencyKey: "equal-new-ui-payment" });
    await updateGuestChecks(order.id, { action: "close", version: check.version });
  });

  it("reconciles custom totals, retains paid allocations, takes partial payments and persists receipts", async () => {
    const order = await saveOrder({ orderType: "DINE_IN", tableId: "tbl_10", discountCents: 0, items: [{ productId: "prod_water", quantity: 1 }, { productId: "prod_iced_tea", quantity: 1 }] });
    await expect(updateGuestChecks(order.id, { action: "configureSplit", version: order.version, mode: "custom", count: 3, amounts: [100, 200, 499] })).rejects.toMatchObject({ code: "INVALID_SPLIT" });
    expect((await getGuestChecks(order.id)).guests).toHaveLength(0);
    let check = await updateGuestChecks(order.id, { action: "configureSplit", version: order.version, mode: "custom", count: 3, amounts: [100, 200, 500] });
    expect(check.guests.map((guest) => guest.totalCents)).toEqual([100, 200, 500]);
    check = await updateGuestChecks(order.id, { action: "pay", version: check.version, guestId: check.guests[0].id, amountCents: 50, tenderedCents: 100, idempotencyKey: "custom-partial-new-ui" });
    check = await updateGuestChecks(order.id, { action: "pay", version: check.version, guestId: check.guests[1].id, amountCents: 200, tenderedCents: 200, idempotencyKey: "custom-full-new-ui" });
    await expect(updateGuestChecks(order.id, { action: "close", version: check.version })).rejects.toMatchObject({ code: "BALANCE_REMAINS" });
    const paidIds = check.guests.filter((guest) => guest.paidCents > 0).map((guest) => guest.id);
    const before = await prisma.guestItemAllocation.findMany({ where: { orderGuestId: { in: paidIds } }, orderBy: { id: "asc" } });
    check = await updateGuestChecks(order.id, { action: "configureSplit", version: check.version, mode: "custom", count: 3, amounts: [9999, 9999, 500] });
    expect(check.guests.map((guest) => guest.totalCents)).toEqual([100, 200, 500]);
    expect(await prisma.guestItemAllocation.findMany({ where: { orderGuestId: { in: paidIds } }, orderBy: { id: "asc" } })).toEqual(before);
    await expect(updateGuestChecks(order.id, { action: "configureSplit", version: check.version, mode: "equal", count: 1 })).rejects.toMatchObject({ code: "INVALID_SPLIT" });
    const request = { action: "payRemaining" as const, version: check.version, amountCents: 550, tenderedCents: 1000, idempotencyKey: "custom-final-table-new-ui" };
    check = await updateGuestChecks(order.id, request);
    expect(check.guests.reduce((sum, guest) => sum + guest.paidCents, 0)).toBe(800);
    expect(check.guests.every((guest) => guest.balanceCents === 0)).toBe(true);
    const paymentCount = check.guests.flatMap((guest) => guest.payments).length;
    expect((await updateGuestChecks(order.id, request)).guests.flatMap((guest) => guest.payments)).toHaveLength(paymentCount);
    const fresh = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }) });
    try {
      const receipt = await getGuestChecks(order.id, fresh);
      expect(receipt.totalCents).toBe(800);
      expect(receipt.guests[0]).toMatchObject({ totalCents: 100, paidCents: 100, balanceCents: 0 });
      expect(receipt.items.reduce((sum, item) => sum + item.allocatedCents, 0)).toBe(800);
      expect(receipt.guests.flatMap((guest) => guest.payments)).toHaveLength(paymentCount);
    } finally { await fresh.$disconnect(); }
    await updateGuestChecks(order.id, { action: "close", version: check.version });
  });

  it("covers newly added unassigned items after every old payee has already paid", async () => {
    const order = await saveOrder({ orderType: "DINE_IN", tableId: "tbl_10", discountCents: 0, items: [{ productId: "prod_water", quantity: 1 }] });
    let check = await updateGuestChecks(order.id, { action: "configureSplit", version: order.version, mode: "equal", count: 2 });
    check = await updateGuestChecks(order.id, { action: "payRemaining", version: check.version, amountCents: 300, tenderedCents: 300, idempotencyKey: "old-payees-all-paid" });
    const paidBefore = await prisma.guestItemAllocation.findMany({ where: { orderGuestId: { in: check.guests.map((guest) => guest.id) } }, orderBy: { id: "asc" } });
    const saved = await saveOrder({ orderId: order.id, version: check.version, orderType: "DINE_IN", tableId: "tbl_10", discountCents: 0, items: [{ itemId: order.items[0].id, productId: "prod_water", quantity: 1 }, { productId: "prod_orange", quantity: 1 }] });
    check = await updateGuestChecks(order.id, { action: "payRemaining", version: saved.version, amountCents: 600, tenderedCents: 1000, idempotencyKey: "new-unassigned-after-paid" });
    expect(check.complete).toBe(true);
    expect(check.guests).toHaveLength(3);
    expect(check.guests.reduce((sum, guest) => sum + guest.paidCents, 0)).toBe(900);
    expect(await prisma.guestItemAllocation.findMany({ where: { orderGuestId: { in: check.guests.slice(0, 2).map((guest) => guest.id) } }, orderBy: { id: "asc" } })).toEqual(paidBefore);
    await updateGuestChecks(order.id, { action: "close", version: check.version });
  });

  it("saves custom final amounts after discount and keeps discounted paid allocations locked", async () => {
    const items = [{ productId: "prod_water", quantity: 1 }, { productId: "prod_iced_tea", quantity: 1 }];
    const order = await saveOrder({ orderType: "DINE_IN", tableId: "tbl_10", discountCents: 101, items });
    let check = await updateGuestChecks(order.id, { action: "configureSplit", version: order.version, mode: "custom", count: 3, amounts: [100, 200, 399] });
    expect(check.guests.map((guest) => guest.totalCents)).toEqual([100, 200, 399]);
    expect(check.guests.reduce((sum, guest) => sum + guest.discountCents, 0)).toBe(101);
    check = await updateGuestChecks(order.id, { action: "payRemaining", version: check.version, amountCents: 699, tenderedCents: 1000, idempotencyKey: "discount-custom-final" });
    await expect(updateGuestChecks(order.id, { action: "configureSplit", version: check.version, mode: "equal", count: 3 })).rejects.toMatchObject({ code: "INVALID_SPLIT" });
    await updateGuestChecks(order.id, { action: "close", version: check.version });
    const free = await saveOrder({ orderType: "DINE_IN", tableId: "tbl_10", discountCents: 800, items });
    check = await updateGuestChecks(free.id, { action: "configureSplit", version: free.version, mode: "equal", count: 3 });
    expect(check.complete).toBe(true);
    expect(check.guests.map((guest) => guest.totalCents)).toEqual([0, 0, 0]);
    expect((await updateGuestChecks(free.id, { action: "close", version: check.version })).status).toBe("COMPLETED");
  });
});
