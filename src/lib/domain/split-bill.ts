import { quoteTender } from "@/lib/domain/tender";
/** Divide cents in the supplied, stable guest order. Earlier guests receive the remainder. */
export function splitEqually(amountCents: number, guestIds: string[]) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new Error("Amount must be a non-negative whole number of cents.");
  }
  if (!guestIds.length || guestIds.some((id) => !id) || new Set(guestIds).size !== guestIds.length) {
    throw new Error("Choose at least one distinct guest.");
  }
  const base = Math.floor(amountCents / guestIds.length);
  const remainder = amountCents % guestIds.length;
  return guestIds.map((guestId, index) => ({
    guestId,
    amountCents: base + (index < remainder ? 1 : 0),
  }));
}

/** Validate a partial cash payment independently of the amount tendered. */
export function quoteGuestPayment(balanceCents: number, amountCents: number, tenderedCents: number, tipCents = 0, method: string = "CASH") {
  if (![balanceCents, amountCents, tenderedCents].every(Number.isSafeInteger) ||
      balanceCents < 0 || amountCents <= 0 || tenderedCents < 0) {
    throw new Error("Enter valid whole amounts in cents.");
  }
  if (amountCents > balanceCents) throw new Error("Payment exceeds the outstanding balance.");
  return quoteTender({ amountCents, tipCents, method, tenderedCents });
}

/** Existing proportional discount calculation; seat order breaks remainder ties. */
export function guestDiscounts(gross: number[], subtotalCents: number, discountCents: number, complete: boolean) {
  const discounts = gross.map(() => 0);
  if (complete && discountCents && subtotalCents) {
    const denominator = BigInt(subtotalCents);
    const shares = gross.map((amount, index) => {
      const numerator = BigInt(amount) * BigInt(discountCents);
      discounts[index] = Number(numerator / denominator);
      return { index, remainder: numerator % denominator };
    });
    let left = discountCents - discounts.reduce((sum, amount) => sum + amount, 0);
    shares.sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
    for (const share of shares) { if (left-- <= 0) break; discounts[share.index]++; }
  }
  return discounts;
}
