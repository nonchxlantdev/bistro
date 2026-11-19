/** How a payment was made, the optional tip, and the cash change. Amounts are whole cents. */
export type TenderMethod = "CASH" | "CARD";

/** Tip for a percentage of the amount, rounded to the nearest cent. */
export function tipForPercent(amountCents: number, percent: number) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0 || !Number.isFinite(percent) || percent < 0) return 0;
  return Math.round((amountCents * percent) / 100);
}

/** Parse "5,8,10,15" into sorted unique whole percentages (1–100), max six. */
export function parseTipPresets(value: string | null | undefined) {
  const list = (value ?? "").split(/[\s,]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 100);
  return [...new Set(list)].sort((a, b) => a - b).slice(0, 6);
}

export function quoteTender(input: { amountCents: number; tipCents?: number; method?: string; tenderedCents?: number }) {
  const method: TenderMethod = input.method === "CARD" ? "CARD" : input.method === undefined || input.method === "CASH" ? "CASH" : (() => { throw new Error("Choose cash or card."); })();
  const tipCents = input.tipCents ?? 0;
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error("Enter a valid payment amount.");
  if (!Number.isSafeInteger(tipCents) || tipCents < 0) throw new Error("Enter a valid tip.");
  if (tipCents > input.amountCents) throw new Error("The tip can't be more than the bill.");
  const due = input.amountCents + tipCents;
  if (method === "CARD") return { method, amountCents: input.amountCents, tipCents, tenderedCents: due, changeCents: 0 };
  const tendered = input.tenderedCents ?? 0;
  if (!Number.isSafeInteger(tendered) || tendered < 0) throw new Error("Enter the cash received.");
  if (tendered < due) throw new Error(tipCents ? "Cash received is less than the bill plus tip." : "Cash received is less than the payment amount.");
  return { method, amountCents: input.amountCents, tipCents, tenderedCents: tendered, changeCents: tendered - due };
}
