export type TableStatus = "AVAILABLE" | "OCCUPIED" | "RESERVED";

export function deriveTableStatus(input: { hasOpenOrder: boolean; isReserved: boolean }): TableStatus {
  if (input.hasOpenOrder) return "OCCUPIED";
  if (input.isReserved) return "RESERVED";
  return "AVAILABLE";
}
