import { describe, expect, it } from "vitest";
import { hasUnsavedAllocationDrafts, reconcileAllocationDrafts } from "../src/lib/domain/allocation-drafts";

describe("guest allocation drafts", () => {
  const guests = [{ id: "one" }, { id: "two" }];
  const items = [
    { id: "coffee", allocations: [{ orderGuestId: "one", amountCents: 850 }] },
    { id: "cake", allocations: [] },
  ];

  it("retains edits on other items when one share is saved", () => {
    const initial = reconcileAllocationDrafts({}, items, guests);
    const edited = { ...initial, coffee: { ...initial.coffee, two: "8.50" }, cake: { ...initial.cake, two: "12.00" } };
    const saved = [{ ...items[0], allocations: [...items[0].allocations, { orderGuestId: "two", amountCents: 850 }] }, items[1]];
    const next = reconcileAllocationDrafts(edited, saved, guests, "coffee");
    expect(next.coffee.two).toBe("8.50");
    expect(next.cake.two).toBe("12.00");
    expect(hasUnsavedAllocationDrafts(next, saved, guests)).toBe(true);
  });

  it("distinguishes equivalent amounts from invalid or changed drafts", () => {
    const initial = reconcileAllocationDrafts({}, items, guests);
    expect(hasUnsavedAllocationDrafts({ ...initial, coffee: { ...initial.coffee, one: "8.5" } }, items, guests)).toBe(false);
    expect(hasUnsavedAllocationDrafts({ ...initial, coffee: { ...initial.coffee, one: "8.555" } }, items, guests)).toBe(true);
    expect(hasUnsavedAllocationDrafts({ ...initial, coffee: { ...initial.coffee, one: "" } }, items, guests)).toBe(true);
  });
});
