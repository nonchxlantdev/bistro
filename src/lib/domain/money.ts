const CURRENCY_SYMBOLS: Record<string, string> = {
  BZD: "BZ$",
};

export function formatMoney(cents: number, currency = "BZD"): string {
  if (!Number.isInteger(cents)) {
    throw new Error("Money amounts must be integer cents.");
  }
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const dollars = Math.floor(absolute / 100);
  const remainder = absolute % 100;
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${sign}${symbol} ${dollars}.${String(remainder).padStart(2, "0")}`;
}

export function centsToInput(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) return "";
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.trim().replace(/^[A-Z]{3}\s*/i, "").replace(/^BZ\$\s*/i, "").replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [dollars, fraction = ""] = cleaned.split(".");
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return null;
  return cents;
}
