import { describe, expect, it } from "vitest";
import { planSettlement } from "../src/lib/domain/settlement-plan";

describe("reviewed settlement allocation proposals", () => {
  it("reconciles final custom shares with the existing discount rule, including zero balances", () => {
    for (let subtotal = 1; subtotal <= 35; subtotal++) {
      for (let discount = 0; discount <= subtotal; discount++) {
        const net = subtotal - discount;
        for (let first = 0; first <= net; first++) {
          const check = { subtotalCents: subtotal, discountCents: discount, guests: [], items: [{ id: "item", unitPriceCents: subtotal, lineTotalCents: subtotal, allocations: [] }] };
          const targets = [first, net - first, 0];
          const plan = planSettlement(check, 3, "custom", targets);
          expect(plan.payees.map((guest) => guest.totalCents)).toEqual(targets);
          expect(plan.payees.reduce((sum, guest) => sum + guest.grossCents, 0)).toBe(subtotal);
          expect(plan.allocations.reduce((sum, entry) => sum + entry.amountCents, 0)).toBe(subtotal);
          expect(check.guests).toEqual([]);
          expect(check.items[0].allocations).toEqual([]);
        }
      }
    }
  });

  it("preserves a partially paid guest's item shares while dividing only unpaid items", () => {
    const check = { subtotalCents: 800, discountCents: 0, guests: [{ id: "paid", displayName: "Alex", seatNumber: 1, grossCents: 300, paidCents: 100 }, { id: "unpaid", displayName: "Guest 2", seatNumber: 2, grossCents: 500, paidCents: 0 }], items: [{ id: "a", unitPriceCents: 300, lineTotalCents: 300, allocations: [{ orderGuestId: "paid", amountCents: 300, quantityUnits: 1 }] }, { id: "b", unitPriceCents: 500, lineTotalCents: 500, allocations: [{ orderGuestId: "unpaid", amountCents: 500, quantityUnits: 1 }] }] };
    const plan = planSettlement(check, 3, "equal");
    expect(plan.payees.map((guest) => guest.totalCents)).toEqual([300, 250, 250]);
    expect(plan.payees[0].balanceCents).toBe(200);
    expect(plan.allocations.some((entry) => entry.guestId === "paid")).toBe(false);
    expect(plan.allocations.some((entry) => entry.itemId === "a")).toBe(false);
    expect(check.items[1].allocations[0].amountCents).toBe(500);
  });
});
