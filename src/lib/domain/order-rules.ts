export type OrderStatus = "OPEN" | "COMPLETED" | "CANCELLED";

export function canEditOrder(status: string): boolean {
  return status === "OPEN";
}

export function canCheckoutOrder(status: string): boolean {
  return status === "OPEN";
}
