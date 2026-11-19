import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/db/prisma";
import { seed, DEMO_STAFF } from "../prisma/seed";
import { checkoutOrder, saveOrder } from "../src/lib/services/orders";
import { getGuestChecks, updateGuestChecks } from "../src/lib/services/guest-checks";
import { closeDay, getDayOverview, startDay } from "../src/lib/services/business-day";
import { createStaff, listStaff, updateStaff, verifyStaffPin } from "../src/lib/services/staff";
import { quoteTender, tipForPercent, parseTipPresets } from "../src/lib/domain/tender";
import { AppError } from "../src/lib/errors";

const daniel = { staffId: "staff_daniel" };
const ana = { staffId: "staff_ana" };

describe("tender rules", () => {
  it("adds tips, charges cards exactly and gives cash change", () => {
    expect(tipForPercent(4000, 15)).toBe(600);
    expect(tipForPercent(1999, 8)).toBe(160);
    expect(parseTipPresets("15, 5,8,10,10,abc,0,200")).toEqual([5, 8, 10, 15]);
    expect(quoteTender({ amountCents: 4000, tipCents: 600, method: "CARD", tenderedCents: 0 })).toEqual({ method: "CARD", amountCents: 4000, tipCents: 600, tenderedCents: 4600, changeCents: 0 });
    expect(quoteTender({ amountCents: 4000, tipCents: 400, method: "CASH", tenderedCents: 5000 })).toMatchObject({ tenderedCents: 5000, changeCents: 600 });
    expect(() => quoteTender({ amountCents: 4000, tipCents: 400, method: "CASH", tenderedCents: 4200 })).toThrow(/bill plus tip/);
    expect(() => quoteTender({ amountCents: 1000, tipCents: 1001 })).toThrow(/more than the bill/);
    expect(() => quoteTender({ amountCents: 1000, method: "CHEQUE" })).toThrow(/cash or card/);
  });
});

describe("staff sign-in, payments and end of day", () => {
  beforeAll(async () => {
    await seed(prisma);
    const overview = await getDayOverview();
    if (overview.current) await closeDay({ countedCashCents: overview.current.expectedCashCents, confirmOpenOrders: true }, null);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("seeds the demo team and checks PINs without exposing them", async () => {
    const staff = await listStaff();
    expect(staff.map((person) => person.name)).toEqual(expect.arrayContaining(DEMO_STAFF.map((person) => person.name)));
    expect(JSON.stringify(staff)).not.toMatch(/pin/i);
    await expect(verifyStaffPin("staff_daniel", "1111")).resolves.toMatchObject({ name: "Daniel", role: "SERVER" });
    await expect(verifyStaffPin("staff_daniel", "9999")).rejects.toMatchObject({ code: "WRONG_PIN" });
    await expect(verifyStaffPin("staff_daniel", "12a4")).rejects.toMatchObject({ code: "INVALID_PIN" });
    const temp = await createStaff({ name: "Temp Server", pin: "4321" });
    await updateStaff(temp.id, { active: false });
    await expect(verifyStaffPin(temp.id, "4321")).rejects.toBeInstanceOf(AppError);
    await expect(createStaff({ name: "Daniel", pin: "1234" })).rejects.toMatchObject({ code: "DUPLICATE_STAFF" });
    await expect(updateStaff("staff_maria", { active: false })).rejects.toMatchObject({ code: "LAST_MANAGER" });
  });

  it("records cash and card with tips per server and balances the day", async () => {
    const day = await startDay({ floatCents: 10000 }, "staff_maria");
    expect(day.openingFloatCents).toBe(10000);

    // Takeaway paid by card with a 10% tip, taken by Daniel.
    const takeaway = await saveOrder({ orderType: "TAKEAWAY", discountCents: 0, items: [{ productId: "prod_latte", quantity: 2 }] }, undefined, daniel);
    expect(takeaway.openedById).toBe("staff_daniel");
    const paidCard = await checkoutOrder(takeaway.id, { tenderedCents: 0, tipCents: tipForPercent(takeaway.totalCents, 10), method: "CARD", idempotencyKey: "closeout-card-1" }, undefined, daniel);
    expect(paidCard.payment).toMatchObject({ method: "CARD", amountCents: 1800, tipCents: 180, tenderedCents: 1980, changeCents: 0 });
    expect(paidCard.closedById).toBe("staff_daniel");

    // Dine-in table paid in cash with a custom tip, taken and closed by Ana.
    const table = await saveOrder({ orderType: "DINE_IN", tableId: "tbl_05", discountCents: 0, items: [{ productId: "prod_espresso", quantity: 2 }] }, undefined, ana);
    let check = await getGuestChecks(table.id);
    check = await updateGuestChecks(table.id, { action: "payRemaining", version: check.version, amountCents: check.totalCents, tipCents: 200, method: "CASH", tenderedCents: 2000, idempotencyKey: "closeout-cash-1" }, undefined, ana);
    expect(check.guests[0].payments[0]).toMatchObject({ method: "CASH", tipCents: 200, changeCents: 2000 - check.totalCents - 200, staffId: "staff_ana" });
    check = await updateGuestChecks(table.id, { action: "close", version: check.version }, undefined, ana);
    expect(check.status).toBe("COMPLETED");
    expect((await prisma.order.findUnique({ where: { id: table.id } }))?.closedById).toBe("staff_ana");

    // Float can't change once the day has payments.
    await expect(startDay({ floatCents: 5000 }, "staff_maria")).rejects.toMatchObject({ code: "DAY_IN_USE" });

    const { current } = await getDayOverview();
    expect(current?.totals).toMatchObject({ salesCents: 1800 + check.totalCents, cardSalesCents: 1800, cashSalesCents: check.totalCents, tipsCents: 380, cardTipsCents: 180, cashTipsCents: 200, orders: 2 });
    expect(current?.expectedCashCents).toBe(10000 + check.totalCents + 200);
    expect(current?.servers.map((server) => [server.name, server.salesCents, server.tipsCents])).toEqual(expect.arrayContaining([["Daniel", 1800, 180], ["Ana", check.totalCents, 200]]));

    // Closing with $1 short records the difference and locks the day.
    const closed = await closeDay({ countedCashCents: current!.expectedCashCents - 100, notes: "Short one dollar", confirmOpenOrders: true }, "staff_maria");
    expect(closed).toMatchObject({ differenceCents: -100, closedBy: "Maria", openedBy: "Maria", notes: "Short one dollar" });
    await expect(closeDay({ countedCashCents: 0 }, null)).rejects.toMatchObject({ code: "NO_OPEN_DAY" });
    const overview = await getDayOverview();
    expect(overview.current).toBeNull();
    expect(overview.history[0].id).toBe(closed.id);
  });

  it("opens the day automatically with the default float when nobody started it", async () => {
    const order = await saveOrder({ orderType: "TAKEAWAY", discountCents: 0, items: [{ productId: "prod_espresso", quantity: 1 }] });
    await checkoutOrder(order.id, { tenderedCents: 1000, idempotencyKey: "closeout-auto-day" });
    const { current, defaultFloatCents } = await getDayOverview();
    expect(current?.openingFloatCents).toBe(defaultFloatCents);
    expect(current?.totals.cashSalesCents).toBe(order.totalCents);
  });
});
