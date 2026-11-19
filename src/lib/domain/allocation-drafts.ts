import { centsToInput, parseMoneyToCents } from "@/lib/domain/money";

type Guest = { id: string };
type Item = { id: string; allocations: Array<{ orderGuestId: string; amountCents: number }> };
export type AllocationDrafts = Record<string, Record<string, string>>;

/** Keep other edited rows when a single row or another part of the order is saved. */
export function reconcileAllocationDrafts(previous: AllocationDrafts, items: Item[], guests: Guest[], savedItemId?: string): AllocationDrafts {
  return Object.fromEntries(items.map((item) => [item.id, Object.fromEntries(guests.map((guest) => {
    const persisted = item.allocations.find((entry) => entry.orderGuestId === guest.id);
    const value = item.id !== savedItemId ? previous[item.id]?.[guest.id] : undefined;
    return [guest.id, value ?? (persisted ? centsToInput(persisted.amountCents) : "")];
  }))]));
}

export function hasUnsavedAllocationDrafts(drafts: AllocationDrafts, items: Item[], guests: Guest[]): boolean {
  return items.some((item) => guests.some((guest) => {
    const text = (drafts[item.id]?.[guest.id] ?? "").trim();
    const value = text ? parseMoneyToCents(text) : 0;
    const persisted = item.allocations.find((entry) => entry.orderGuestId === guest.id)?.amountCents ?? 0;
    return value === null || value !== persisted;
  }));
}
