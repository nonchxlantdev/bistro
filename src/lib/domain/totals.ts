import type { CartLine } from "./cart";

export type OrderTotals = {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
};

export function lineTotalCents(unitPriceCents: number, quantity: number): number {
  if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) {
    throw new Error("Unit price must be a whole number of cents.");
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Quantity must be a positive whole number.");
  }
  const total = unitPriceCents * quantity;
  if (!Number.isSafeInteger(total)) {
    throw new Error("Line total is too large.");
  }
  return total;
}

export function calculateOrderTotals(lines: CartLine[], discountCents: number): OrderTotals {
  if (!Number.isInteger(discountCents) || discountCents < 0) {
    throw new Error("Discount must be a whole number of cents.");
  }

  const subtotalCents = lines.reduce((sum, line) => {
    const total = sum + lineTotalCents(line.unitPriceCents, line.quantity);
    if (!Number.isSafeInteger(total)) throw new Error("Order total is too large.");
    return total;
  }, 0);
  if (discountCents > subtotalCents) {
    throw new Error("Discount cannot exceed the subtotal.");
  }

  return {
    subtotalCents,
    discountCents,
    totalCents: subtotalCents - discountCents,
  };
}
