import { describe, expect, it } from "vitest";
import {
  addProduct,
  changeQuantity,
  clearCart,
  removeProduct,
  setQuantity,
  type CartLine,
} from "../src/lib/domain/cart";
import { formatMoney, parseMoneyToCents } from "../src/lib/domain/money";
import { calculateOrderTotals } from "../src/lib/domain/totals";
import { quoteCashPayment } from "../src/lib/domain/checkout";
import { canCheckoutOrder, canEditOrder } from "../src/lib/domain/order-rules";
import { deriveTableStatus } from "../src/lib/domain/tables";

const cappuccino = { id: "prod_cappuccino", name: "Cappuccino", priceCents: 850 };
const sandwich = { id: "prod_sandwich", name: "Chicken Sandwich", priceCents: 1500 };

describe("cart", () => {
  it("adds a product to an empty cart", () => {
    const lines = addProduct([], cappuccino);
    expect(lines).toEqual([
      {
        productId: "prod_cappuccino",
        name: "Cappuccino",
        unitPriceCents: 850,
        quantity: 1,
      },
    ]);
  });

  it("increases quantity when the same product is added again and keeps the original price", () => {
    const once = addProduct([], cappuccino);
    const repriced = { ...cappuccino, priceCents: 999 };
    const twice = addProduct(once, repriced);
    expect(twice).toHaveLength(1);
    expect(twice[0]?.quantity).toBe(2);
    expect(twice[0]?.unitPriceCents).toBe(850);
  });

  it("updates quantities and removes a line when quantity drops to zero", () => {
    const lines = addProduct(addProduct([], cappuccino), sandwich);
    const increased = changeQuantity(lines, sandwich.id, 1);
    expect(increased.find((line) => line.productId === sandwich.id)?.quantity).toBe(2);

    const decreased = setQuantity(increased, cappuccino.id, 0);
    expect(decreased.map((line) => line.productId)).toEqual([sandwich.id]);
  });

  it("removes a product and clears an unsaved cart", () => {
    const lines = addProduct(addProduct([], cappuccino), sandwich);
    expect(removeProduct(lines, cappuccino.id)).toEqual([
      expect.objectContaining({ productId: sandwich.id }),
    ]);
    expect(clearCart()).toEqual([]);
  });

  it("keeps the same product separate when options or instructions differ", () => {
    const first = addProduct([], { ...cappuccino, priceCents: 1050, modifierOptionIds: ["oat"], instructions: "Extra hot" });
    const second = addProduct(first, { ...cappuccino, priceCents: 1150, modifierOptionIds: ["large"], instructions: "" });
    expect(second).toHaveLength(2);
    expect(second.map((line) => line.unitPriceCents)).toEqual([1050, 1150]);
    const updated = changeQuantity(second, second[0].lineKey!, 1);
    expect(updated.map((line) => line.quantity)).toEqual([2, 1]);
    expect(calculateOrderTotals(updated, 0).totalCents).toBe(3250);
  });
});

describe("money", () => {
  it("calculates line and order totals in integer cents", () => {
    const lines: CartLine[] = [
      { productId: "a", name: "Cappuccino", unitPriceCents: 850, quantity: 2 },
      { productId: "b", name: "Chicken Sandwich", unitPriceCents: 1500, quantity: 1 },
    ];
    const totals = calculateOrderTotals(lines, 0);
    expect(totals).toEqual({
      subtotalCents: 3200,
      discountCents: 0,
      totalCents: 3200,
    });
    expect(formatMoney(3200)).toBe("BZ$ 32.00");
    expect(formatMoney(850)).toBe("BZ$ 8.50");
  });

  it("applies a discount without floating point math", () => {
    const lines: CartLine[] = [
      { productId: "a", name: "Latte", unitPriceCents: 900, quantity: 1 },
    ];
    expect(calculateOrderTotals(lines, 150)).toEqual({
      subtotalCents: 900,
      discountCents: 150,
      totalCents: 750,
    });
  });

  it("rejects a discount larger than the subtotal", () => {
    const lines: CartLine[] = [
      { productId: "a", name: "Cookie", unitPriceCents: 400, quantity: 1 },
    ];
    expect(() => calculateOrderTotals(lines, 401)).toThrow(/discount/i);
  });

  it("rejects a subtotal that exceeds safe integer precision", () => {
    const lines: CartLine[] = [
      { productId: "a", name: "A", unitPriceCents: Number.MAX_SAFE_INTEGER, quantity: 1 },
      { productId: "b", name: "B", unitPriceCents: 1, quantity: 1 },
    ];
    expect(() => calculateOrderTotals(lines, 0)).toThrow(/too large/i);
  });

  it("parses cash entry into cents", () => {
    expect(parseMoneyToCents("30")).toBe(3000);
    expect(parseMoneyToCents("25.5")).toBe(2550);
    expect(parseMoneyToCents("25.50")).toBe(2550);
    expect(parseMoneyToCents("BZ$ 5.00")).toBe(500);
    expect(parseMoneyToCents("12.345")).toBeNull();
    expect(parseMoneyToCents("-1")).toBeNull();
  });
});

describe("checkout", () => {
  it("calculates change due", () => {
    expect(quoteCashPayment(2500, 3000)).toEqual({
      ok: true,
      amountCents: 2500,
      tenderedCents: 3000,
      changeCents: 500,
    });
  });

  it("rejects insufficient cash", () => {
    const result = quoteCashPayment(2500, 2000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.toLowerCase()).toContain("less than");
    }
  });

  it("rejects non-integer tendered amounts", () => {
    const result = quoteCashPayment(2500, 10.5);
    expect(result.ok).toBe(false);
  });
});

describe("order rules", () => {
  it("allows edits and checkout only for open orders", () => {
    expect(canEditOrder("OPEN")).toBe(true);
    expect(canCheckoutOrder("OPEN")).toBe(true);
    expect(canEditOrder("COMPLETED")).toBe(false);
    expect(canCheckoutOrder("COMPLETED")).toBe(false);
    expect(canEditOrder("CANCELLED")).toBe(false);
    expect(canCheckoutOrder("CANCELLED")).toBe(false);
  });
});

describe("tables", () => {
  it("derives occupancy from the active order before the reserved flag", () => {
    expect(deriveTableStatus({ hasOpenOrder: false, isReserved: false })).toBe("AVAILABLE");
    expect(deriveTableStatus({ hasOpenOrder: true, isReserved: false })).toBe("OCCUPIED");
    expect(deriveTableStatus({ hasOpenOrder: true, isReserved: true })).toBe("OCCUPIED");
    expect(deriveTableStatus({ hasOpenOrder: false, isReserved: true })).toBe("RESERVED");
  });
});
