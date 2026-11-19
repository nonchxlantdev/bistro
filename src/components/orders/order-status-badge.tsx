import type { OrderStatus } from "@/types/api";
const labels: Record<OrderStatus, string> = { OPEN: "Open", COMPLETED: "Completed", CANCELLED: "Cancelled" };
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={"status-chip status-" + status.toLowerCase()}>{labels[status]}</span>;
}
