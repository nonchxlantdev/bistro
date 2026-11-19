export type CashQuote =
  | {
      ok: true;
      amountCents: number;
      tenderedCents: number;
      changeCents: number;
    }
  | {
      ok: false;
      message: string;
    };

export function quoteCashPayment(totalCents: number, tenderedCents: number): CashQuote {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    return { ok: false, message: "The amount due is invalid. Save the order and try again." };
  }
  if (!Number.isInteger(tenderedCents) || tenderedCents < 0) {
    return { ok: false, message: "Enter the cash received as a valid amount." };
  }
  if (tenderedCents < totalCents) {
    return { ok: false, message: "Cash received is less than the amount due." };
  }
  return {
    ok: true,
    amountCents: totalCents,
    tenderedCents,
    changeCents: tenderedCents - totalCents,
  };
}
