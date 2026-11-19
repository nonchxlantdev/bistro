import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SplitPlanner } from "@/components/orders/split-planner";

type Check = Parameters<typeof SplitPlanner>[0]["check"];
function check(paid: boolean, discount = 0): Check {
  const total = 7200 - discount;
  const guests = [1, 2].map((seat) => ({ id: `guest-${seat}`, orderId: "order", displayName: `Guest ${seat}`, seatNumber: seat, createdAt: new Date(), updatedAt: new Date(), allocations: [], payments: [], grossCents: 3600, totalCents: total / 2, discountCents: discount / 2, paidCents: paid ? total / 2 : 0, balanceCents: paid ? 0 : total / 2 }));
  return { id: "order", orderNumber: "ORD-000010", tableName: "Table 2", status: "OPEN", version: 1, createdAt: new Date(), subtotalCents: 7200, discountCents: discount, totalCents: total, complete: true, legacyPayment: null, openedById: null, closedById: null, guests, items: [{ id: "item", name: "Dinner", quantity: 2, unitPriceCents: 3600, lineTotalCents: 7200, allocatedCents: 7200, instructions: "", modifiers: [], allocations: guests.map((guest) => ({ id: `allocation-${guest.id}`, orderGuestId: guest.id, orderItemId: "item", amountCents: 3600, quantityUnits: 1 })) }] };
}
function render(value: Check) { return renderToStaticMarkup(createElement(SplitPlanner, { check: value, currency: "BZD", mode: "custom", pending: false, onDirtyChange: () => {}, onSave: async () => true })); }

describe("settled split presentation", () => {
  it("shows paid guest shares without editable fields or a redundant save proposal", () => {
    const html = render(check(true));
    expect(html).toContain("Split settled");
    expect(html).toContain("Guest 1");
    expect(html).toContain("Guest 2");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("Confirm &amp; save split");
    expect(html).not.toContain("This is a proposal");
  });
  it("shows settled discounted checks without a spurious allocation error", () => {
    const html = render(check(true, 1200));
    expect(html).toContain("Split settled");
    expect(html).not.toContain("Discounted allocations are locked");
  });
  it("retains custom split inputs and confirmation for an unpaid check", () => {
    const html = render(check(false));
    expect(html).toContain("Custom amount for Guest 1");
    expect(html).toContain("Custom amount for Guest 2");
    expect(html).toContain("Confirm &amp; save split");
  });
});
