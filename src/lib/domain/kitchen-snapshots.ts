type Ticket = { status: string; orderVersion: number; snapshotJson: string };

/** Kitchen snapshots retain the line IDs even after an order receives additions. */
export function kitchenOrderState(tickets: Ticket[]) {
  const ordered = [...tickets].sort((a, b) => a.orderVersion - b.orderVersion);
  const ids = (ticket?: Ticket): string[] => ticket ? (JSON.parse(ticket.snapshotJson) as Array<{ itemId: string }>).map((line) => line.itemId) : [];
  return {
    served: ordered.some((ticket) => ticket.status === "SERVED"),
    originalIds: ids(ordered[0]),
    sentIds: ids(ordered.at(-1)),
  };
}
