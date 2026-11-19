import { guestDiscounts, splitEqually } from "@/lib/domain/split-bill";

type Check = {
  subtotalCents: number; discountCents: number;
  guests: Array<{ id: string; displayName: string; seatNumber: number; grossCents: number; paidCents: number }>;
  items: Array<{ id: string; unitPriceCents: number; lineTotalCents: number; allocations: Array<{ orderGuestId: string; amountCents: number; quantityUnits: number | null }> }>;
};

/** Plan unpaid item amounts only. Existing paid checks retain every allocation. */
export function planSettlement(check: Check, count: number, mode: "equal" | "custom", amounts?: number[]) {
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("Choose between 1 and 100 payees.");
  const locked = check.guests.filter((guest) => guest.paidCents > 0);
  if (locked.length && check.discountCents) throw new Error("Discounted allocations are locked after payment. Use the existing guest balances or One Payment.");
  if (count < locked.length) throw new Error("Paid payees cannot be removed.");
  const retained = new Set([...locked.map((guest) => guest.id), ...check.guests.filter((guest) => !guest.paidCents).slice(0, count - locked.length).map((guest) => guest.id)]);
  const payees = check.guests.filter((guest) => retained.has(guest.id)).map((guest) => ({ ...guest, locked: guest.paidCents > 0 }));
  const lastSeat = Math.max(0, ...check.guests.map((guest) => guest.seatNumber));
  for (let index = payees.length; index < count; index++) payees.push({ id: `new:${index}`, displayName: `Guest ${lastSeat + index - retained.size + 1}`, seatNumber: lastSeat + index - retained.size + 1, grossCents: 0, paidCents: 0, locked: false });
  const unlocked = payees.filter((guest) => !guest.locked);
  const remaining = check.subtotalCents - check.discountCents - locked.reduce((sum, guest) => sum + guest.grossCents, 0);
  if (remaining < 0) throw new Error("Existing allocations exceed the check total. Refresh this order.");
  if (remaining && !unlocked.length) throw new Error("Add an unpaid payee to allocate the remaining items.");
  const equal = unlocked.length ? splitEqually(remaining, unlocked.map((guest) => guest.id)) : [];
  const netTargets = payees.map((guest, index) => guest.locked ? guest.grossCents : mode === "equal" ? equal.find((entry) => entry.guestId === guest.id)!.amountCents : amounts?.[index] ?? -1);
  if (netTargets.some((amount) => !Number.isSafeInteger(amount) || amount < 0)) throw new Error("Enter a valid amount for every unpaid payee.");
  const netTotal = check.subtotalCents - check.discountCents;
  if (netTargets.reduce((sum, amount) => sum + amount, 0) !== netTotal) throw new Error("Custom final shares must add up exactly to the table total after discount.");
  // Lift the requested final shares into item amounts. Applying the unchanged
  // largest-remainder discount rule to these gross amounts yields the requested
  // final shares, without introducing a separate discount/payment calculation.
  const liftedDiscounts = guestDiscounts(netTargets, netTotal, check.discountCents, true);
  const targets = netTotal === 0 && check.subtotalCents > 0
    ? splitEqually(check.subtotalCents, payees.map((guest) => guest.id)).map((entry) => entry.amountCents)
    : netTargets.map((amount, index) => amount + liftedDiscounts[index]);
  const budget = new Map(payees.map((guest, index) => [guest.id, guest.locked ? 0 : targets[index]]));
  const lockedIds = new Set(locked.map((guest) => guest.id));
  const allocations: Array<{ itemId: string; guestId: string; amountCents: number; quantityUnits: number | null }> = [];
  for (const item of check.items) {
    let left = item.lineTotalCents - item.allocations.filter((entry) => lockedIds.has(entry.orderGuestId)).reduce((sum, entry) => sum + entry.amountCents, 0);
    if (left < 0) throw new Error("Settled shares exceed an item's value.");
    for (const guest of unlocked) {
      const amountCents = Math.min(left, budget.get(guest.id)!);
      if (!amountCents) continue;
      allocations.push({ itemId: item.id, guestId: guest.id, amountCents, quantityUnits: item.unitPriceCents > 0 && amountCents % item.unitPriceCents === 0 ? amountCents / item.unitPriceCents : null });
      budget.set(guest.id, budget.get(guest.id)! - amountCents); left -= amountCents;
    }
    if (left) throw new Error("The remaining item amounts could not be allocated.");
  }
  const discounts = guestDiscounts(targets, check.subtotalCents, check.discountCents, true);
  if (targets.some((amount, index) => amount - discounts[index] !== netTargets[index])) throw new Error("The requested shares could not be reconciled with the order discount.");
  return {
    payees: payees.map((guest, index) => ({ ...guest, grossCents: targets[index], discountCents: discounts[index], totalCents: targets[index] - discounts[index], balanceCents: targets[index] - discounts[index] - guest.paidCents })),
    allocations,
    removedGuestIds: check.guests.filter((guest) => !retained.has(guest.id)).map((guest) => guest.id),
  };
}
