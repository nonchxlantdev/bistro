import { describe, expect, it } from "vitest";
import { quoteGuestPayment, splitEqually } from "../src/lib/domain/split-bill";

describe("split-bill calculations", () => {
  it("allocates remainder cents deterministically and reconciles exactly", () => {
    const shares = splitEqually(1000, ["guest-1", "guest-2", "guest-3"]);
    expect(shares.map((share) => share.amountCents)).toEqual([334, 333, 333]);
    expect(shares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(1000);
  });

  it("rejects duplicate guests and invalid cents", () => {
    expect(() => splitEqually(100, ["a", "a"])).toThrow();
    expect(() => splitEqually(1.5, ["a"])).toThrow();
    expect(() => splitEqually(100, [])).toThrow();
  });

  it("records the intended partial payment and calculates change", () => {
    expect(quoteGuestPayment(2500, 1000, 2000)).toEqual({
      method: "CASH", amountCents: 1000, tipCents: 0, tenderedCents: 2000, changeCents: 1000,
    });
    expect(() => quoteGuestPayment(1000, 1001, 2000)).toThrow(/exceeds/);
    expect(() => quoteGuestPayment(1000, 500, 499)).toThrow(/less than/);
  });
});
