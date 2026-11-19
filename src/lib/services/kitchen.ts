import { prisma, type PrismaClient } from "@/lib/db/prisma";
import { AppError, isUniqueConstraint } from "@/lib/errors";
import { getTenant } from "@/lib/services/tenant";

type SnapshotLine = { itemId: string; name: string; quantity: number; modifiers?: string[]; instructions?: string };
type ChangeLine = { name: string; quantity: number; modifiers?: string[]; instructions?: string };
function changeFor(item: SnapshotLine, quantity: number): ChangeLine {
  return { name: item.name, quantity, ...(item.modifiers?.length ? { modifiers: item.modifiers } : {}), ...(item.instructions ? { instructions: item.instructions } : {}) };
}
export type KitchenStatus = "NEW" | "PREPARING" | "READY" | "SERVED";

export async function sendKitchenTicket(id: string, version: number, idempotencyKey: string, db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  const previous = await db.kitchenTicket.findUnique({ where: { idempotencyKey }, include: { order: true } });
  if (previous) {
    if (previous.orderId !== id || previous.order.businessId !== tenant.business.id || previous.orderVersion !== version + 1) throw new AppError("This kitchen key belongs to another request.", 409, "IDEMPOTENCY_CONFLICT");
    return { ticketId: previous.id, created: false };
  }
  try {
  return await db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id, businessId: tenant.business.id }, include: { items: { orderBy: { position: "asc" }, include: { modifiers: { orderBy: { id: "asc" } } } } } });
    if (!order) throw new AppError("Order not found.", 404, "ORDER_NOT_FOUND");
    if (order.status !== "OPEN") throw new AppError("Only open orders can be sent to the kitchen.", 409, "ORDER_LOCKED");
    const hasServed = await tx.kitchenTicket.count({ where: { orderId: id, status: "SERVED" } });
    if (order.version !== version) throw new AppError("This order changed. Reload it first.", 409, "VERSION_CONFLICT");
    const last = await tx.kitchenTicket.findFirst({ where: { orderId: id }, orderBy: { orderVersion: "desc" } });
    const before: SnapshotLine[] = last ? JSON.parse(last.snapshotJson) : [];
    const after: SnapshotLine[] = order.items.map((item) => ({ itemId: item.id, name: item.productNameSnapshot, quantity: item.quantity, ...(item.modifiers.length ? { modifiers: item.modifiers.map((modifier) => modifier.optionName) } : {}), ...(item.instructions ? { instructions: item.instructions } : {}) }));
    const previousById = new Map(before.map((item) => [item.itemId, item]));
    const currentById = new Map(after.map((item) => [item.itemId, item]));
    const changes: ChangeLine[] = [];
    for (const item of after) {
      const prior = previousById.get(item.itemId);
      if (prior && (JSON.stringify(prior.modifiers ?? []) !== JSON.stringify(item.modifiers ?? []) || (prior.instructions ?? "") !== (item.instructions ?? ""))) {
        changes.push(changeFor(prior, -prior.quantity), changeFor(item, item.quantity));
      } else {
        const difference = item.quantity - (prior?.quantity ?? 0);
        if (difference) changes.push(changeFor(item, difference));
      }
    }
    for (const item of before) if (!currentById.has(item.itemId)) changes.push(changeFor(item, -item.quantity));
    if (hasServed && changes.some((line) => line.quantity < 0)) throw new AppError("Sent items cannot be changed. Send only additions to this order.", 409, "ORDER_SERVED");
    if (!changes.length) return { ticketId: last?.id ?? null, created: false };
    const claimed = await tx.order.updateMany({ where: { id, status: "OPEN", version }, data: { version: { increment: 1 } } });
    if (claimed.count !== 1) throw new AppError("This order changed. Reload it first.", 409, "VERSION_CONFLICT");
    const ticket = await tx.kitchenTicket.create({ data: { orderId: id, orderVersion: version + 1, changesJson: JSON.stringify(changes), snapshotJson: JSON.stringify(after), idempotencyKey } });
    return { ticketId: ticket.id, created: true };
  });
  } catch (error) {
    if (isUniqueConstraint(error)) {
      const replay = await db.kitchenTicket.findUnique({ where: { idempotencyKey }, include: { order: true } });
      if (replay?.orderId === id && replay.order.businessId === tenant.business.id && replay.orderVersion === version + 1) return { ticketId: replay.id, created: false };
    }
    throw error;
  }
}

export async function listKitchenTickets(db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  const tickets = await db.kitchenTicket.findMany({ where: { order: { businessId: tenant.business.id, locationId: tenant.location.id } }, include: { order: { include: { table: true, kitchenTickets: { select: { id: true, orderVersion: true }, orderBy: { orderVersion: "asc" } } } } }, orderBy: { createdAt: "desc" }, take: 500 });
  return tickets.map((ticket) => {
    const index = ticket.order.kitchenTickets.findIndex((entry) => entry.id === ticket.id);
    return { id: ticket.id, orderId: ticket.orderId, status: ticket.status, createdAt: ticket.createdAt.toISOString(), orderNumber: ticket.order.orderNumber, tableName: ticket.order.table?.name ?? "Takeaway", additionNumber: index, linkedTicketId: index > 0 ? ticket.order.kitchenTickets[index - 1].id : null, changes: JSON.parse(ticket.changesJson) as ChangeLine[] };
  });
}

export async function setKitchenStatus(id: string, from: KitchenStatus, to: KitchenStatus, db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  const next: Partial<Record<KitchenStatus, KitchenStatus>> = { NEW: "PREPARING", PREPARING: "READY", READY: "SERVED" };
  if (next[from] !== to) throw new AppError("Tickets move from New to Preparing, Ready and then Served. Served tickets cannot be changed yet.", 409, "INVALID_KITCHEN_TRANSITION");
  await db.$transaction(async (tx) => {
    const ticket = await tx.kitchenTicket.findFirst({ where: { id, order: { businessId: tenant.business.id, locationId: tenant.location.id } }, select: { orderId: true } });
    if (!ticket) throw new AppError("Ticket not found.", 404, "TICKET_NOT_FOUND");
    const changed = await tx.kitchenTicket.updateMany({ where: { id, status: from }, data: { status: to } });
    if (!changed.count) throw new AppError("This ticket changed or is unavailable. Refresh and try again.", 409, "TICKET_CONFLICT");
    if (to === "SERVED") await tx.order.update({ where: { id: ticket.orderId }, data: { version: { increment: 1 } } });
  });
}
