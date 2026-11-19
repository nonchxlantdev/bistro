import type { Prisma } from "@/generated/prisma/client";
import { prisma, type PrismaClient } from "@/lib/db/prisma";
import { AppError, isUniqueConstraint } from "@/lib/errors";
import { quoteGuestPayment } from "@/lib/domain/split-bill";
import { splitEqually, guestDiscounts } from "@/lib/domain/split-bill";
import { planSettlement } from "@/lib/domain/settlement-plan";
import { getTenant } from "@/lib/services/tenant";

const include = {
  table: true,
  items: { orderBy: { position: "asc" as const }, include: { allocations: true, modifiers: { orderBy: { id: "asc" as const } } } },
  guests: { orderBy: { seatNumber: "asc" as const }, include: { allocations: true, payments: { orderBy: { createdAt: "asc" as const } } } },
  payment: true,
} satisfies Prisma.OrderInclude;
type CheckOrder = Prisma.OrderGetPayload<{ include: typeof include }>;
type Tx = Prisma.TransactionClient;

async function load(tx: Tx | PrismaClient, id: string, businessId: string) {
  const order = await tx.order.findFirst({ where: { id, businessId }, include });
  if (!order) throw new AppError("Order not found.", 404, "ORDER_NOT_FOUND");
  return order;
}

function summary(order: CheckOrder) {
  const allocated = order.items.map((item) => item.allocations.reduce((sum, a) => sum + a.amountCents, 0));
  const complete = order.items.every((item, index) => allocated[index] === item.lineTotalCents);
  const gross = order.guests.map((guest) => guest.allocations.reduce((sum, a) => sum + a.amountCents, 0));
  const discounts = guestDiscounts(gross, order.subtotalCents, order.discountCents, complete);
  const guests = order.guests.map((guest, index) => {
    const paidCents = guest.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
    const totalCents = gross[index] - discounts[index];
    return { ...guest, grossCents: gross[index], discountCents: discounts[index], totalCents, paidCents, balanceCents: totalCents - paidCents };
  });
  return {
    id: order.id, orderNumber: order.orderNumber, tableName: order.table?.name ?? null,
    status: order.status, version: order.version, createdAt: order.createdAt, subtotalCents: order.subtotalCents,
    discountCents: order.discountCents, totalCents: order.totalCents, complete, legacyPayment: order.payment,
    items: order.items.map((item, index) => ({ id: item.id, name: item.productNameSnapshot, quantity: item.quantity,
      unitPriceCents: item.unitPriceCents, lineTotalCents: item.lineTotalCents, allocatedCents: allocated[index],
      instructions: item.instructions, modifiers: item.modifiers.map((modifier) => ({ name: modifier.optionName, priceDeltaCents: modifier.priceDeltaCents })), allocations: item.allocations })),
    guests,
  };
}

function assertOpen(order: CheckOrder) {
  if (order.status !== "OPEN" || order.orderType !== "DINE_IN" || order.payment) {
    throw new AppError("Guest checks require an open dine-in order.", 409, "ORDER_LOCKED");
  }
}

async function claim(tx: Tx, order: CheckOrder, version: number) {
  const result = await tx.order.updateMany({ where: { id: order.id, status: "OPEN", version }, data: { version: { increment: 1 } } });
  if (result.count !== 1) throw new AppError("This order changed. Reload and try again.", 409, "VERSION_CONFLICT");
}

export async function getGuestChecks(id: string, db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  return summary(await load(db, id, tenant.business.id));
}

export type GuestAction =
  | { action: "addGuest"; version: number; name?: string }
  | { action: "renameGuest"; version: number; guestId: string; name: string }
  | { action: "allocate"; version: number; itemId: string; allocations: Array<{ guestId: string; amountCents: number; quantityUnits: number | null }> }
  | { action: "splitAll"; version: number }
  | { action: "configureSplit"; version: number; mode: "equal" | "custom"; count: number; amounts?: number[] }
  | { action: "payRemaining"; version: number; amountCents: number; tenderedCents: number; idempotencyKey: string }
  | { action: "pay"; version: number; guestId: string; amountCents: number; tenderedCents: number; idempotencyKey: string }
  | { action: "close"; version: number };

export async function updateGuestChecks(id: string, input: GuestAction, db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  if (input.action === "payRemaining") {
    const replay = await db.guestPayment.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { guest: true } });
    if (replay) {
      const parts = await db.guestPayment.findMany({ where: { OR: [{ idempotencyKey: input.idempotencyKey }, { idempotencyKey: { startsWith: `${input.idempotencyKey}:` } }] }, include: { guest: true } });
      if (parts.some((part) => part.guest.orderId !== id) || parts.reduce((sum, part) => sum + part.amountCents, 0) !== input.amountCents || parts.reduce((sum, part) => sum + part.tenderedCents, 0) !== input.tenderedCents) throw new AppError("That payment key was used for a different payment.", 409, "IDEMPOTENCY_CONFLICT");
      return getGuestChecks(id, db);
    }
  }
  if (input.action === "pay") {
    const replay = await db.guestPayment.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { guest: true } });
    if (replay) {
      if (replay.guest.orderId !== id || replay.orderGuestId !== input.guestId || replay.amountCents !== input.amountCents || replay.tenderedCents !== input.tenderedCents) {
        throw new AppError("That payment key was used for a different payment.", 409, "IDEMPOTENCY_CONFLICT");
      }
      return getGuestChecks(id, db);
    }
  }
  try {
  return await db.$transaction(async (tx) => {
    const order = await load(tx, id, tenant.business.id);
    assertOpen(order);
    const state = summary(order);
    if (input.action === "addGuest") {
      const seatNumber = Math.max(0, ...order.guests.map((g) => g.seatNumber)) + 1;
      await claim(tx, order, input.version);
      await tx.orderGuest.create({ data: { orderId: id, seatNumber, displayName: input.name?.trim() || `Guest ${seatNumber}` } });
    } else if (input.action === "renameGuest") {
      const guest = order.guests.find((g) => g.id === input.guestId);
      if (!guest) throw new AppError("Guest not found.", 404, "GUEST_NOT_FOUND");
      await claim(tx, order, input.version);
      await tx.orderGuest.update({ where: { id: guest.id }, data: { displayName: input.name.trim() } });
    } else if (input.action === "allocate") {
      const item = order.items.find((entry) => entry.id === input.itemId);
      if (!item) throw new AppError("Order item not found.", 404, "ITEM_NOT_FOUND");
      const ids = input.allocations.map((a) => a.guestId);
      if (new Set(ids).size !== ids.length || ids.some((guestId) => !order.guests.some((g) => g.id === guestId))) {
        throw new AppError("Choose distinct guests from this order.", 400, "INVALID_ALLOCATION");
      }
      const total = input.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
      if (total > item.lineTotalCents || !Number.isSafeInteger(total)) throw new AppError("Allocations exceed the item total.", 400, "OVER_ALLOCATED");
      for (const allocation of input.allocations) {
        if (allocation.quantityUnits !== null && allocation.quantityUnits * item.unitPriceCents !== allocation.amountCents) {
          throw new AppError("The quantity and amount do not match.", 400, "INVALID_ALLOCATION");
        }
      }
      if (input.allocations.reduce((sum, a) => sum + (a.quantityUnits ?? 0), 0) > item.quantity) {
        throw new AppError("Allocated quantity exceeds the item quantity.", 400, "OVER_ALLOCATED");
      }
      const old = new Map(item.allocations.map((a) => [a.orderGuestId, a]));
      const next = new Map(input.allocations.map((a) => [a.guestId, a]));
      for (const guest of state.guests) {
        const previous = old.get(guest.id); const updated = next.get(guest.id);
        if (guest.paidCents > 0 && ((previous?.amountCents ?? 0) !== (updated?.amountCents ?? 0) || (previous?.quantityUnits ?? null) !== (updated?.quantityUnits ?? null))) {
          throw new AppError("Paid guest allocations cannot be changed.", 409, "PAID_ALLOCATION_LOCKED");
        }
      }
      if (order.discountCents && state.guests.some((g) => g.paidCents > 0)) {
        throw new AppError("Allocations on a discounted order are locked after payment.", 409, "PAID_ALLOCATION_LOCKED");
      }
      await claim(tx, order, input.version);
      const paidGuestIds = state.guests.filter((guest) => guest.paidCents > 0).map((guest) => guest.id);
      await tx.guestItemAllocation.deleteMany({ where: { orderItemId: item.id, orderGuestId: { notIn: paidGuestIds } } });
      const replacements = input.allocations.filter((allocation) => !paidGuestIds.includes(allocation.guestId));
      if (replacements.length) await tx.guestItemAllocation.createMany({ data: replacements.map((a) => ({ orderItemId: item.id, orderGuestId: a.guestId, amountCents: a.amountCents, quantityUnits: a.quantityUnits })) });
    } else if (input.action === "configureSplit") {
      let plan;
      try { plan = planSettlement(state, input.count, input.mode, input.amounts); }
      catch (error) { throw new AppError(error instanceof Error ? error.message : "Invalid split.", 400, "INVALID_SPLIT"); }
      await claim(tx, order, input.version);
      const paidIds = state.guests.filter((guest) => guest.paidCents > 0).map((guest) => guest.id);
      await tx.guestItemAllocation.deleteMany({ where: { orderItemId: { in: order.items.map((item) => item.id) }, orderGuestId: { notIn: paidIds } } });
      if (plan.removedGuestIds.length) await tx.orderGuest.deleteMany({ where: { id: { in: plan.removedGuestIds }, orderId: id, payments: { none: {} } } });
      const ids = new Map<string, string>();
      for (const guest of plan.payees) {
        if (guest.id.startsWith("new:")) {
          const created = await tx.orderGuest.create({ data: { orderId: id, displayName: guest.displayName, seatNumber: guest.seatNumber } });
          ids.set(guest.id, created.id);
        } else ids.set(guest.id, guest.id);
      }
      if (plan.allocations.length) await tx.guestItemAllocation.createMany({ data: plan.allocations.map((entry) => ({ orderItemId: entry.itemId, orderGuestId: ids.get(entry.guestId)!, amountCents: entry.amountCents, quantityUnits: entry.quantityUnits })) });
    } else if (input.action === "splitAll") {
      if (!state.guests.length) throw new AppError("Add at least one guest first.", 400, "NO_GUESTS");
      if (state.guests.some((guest) => guest.paidCents > 0)) throw new AppError("The bill cannot be split again after a payment.", 409, "PAID_ALLOCATION_LOCKED");
      await claim(tx, order, input.version);
      await tx.guestItemAllocation.deleteMany({ where: { orderItemId: { in: order.items.map((item) => item.id) } } });
      const allocations = order.items.flatMap((item) => splitEqually(item.lineTotalCents, state.guests.map((guest) => guest.id)).filter((share) => share.amountCents > 0).map((share) => ({ orderItemId: item.id, orderGuestId: share.guestId, amountCents: share.amountCents, quantityUnits: item.unitPriceCents > 0 && share.amountCents % item.unitPriceCents === 0 ? share.amountCents / item.unitPriceCents : null })));
      if (allocations.length) await tx.guestItemAllocation.createMany({ data: allocations });
    } else if (input.action === "payRemaining") {
      const remaining = order.totalCents - state.guests.reduce((sum, guest) => sum + guest.paidCents, 0);
      if (remaining <= 0 || input.amountCents !== remaining || input.tenderedCents < remaining) throw new AppError("The balance or cash received has changed. Refresh and try again.", 409, "INVALID_PAYMENT");
      if (await tx.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } })) throw new AppError("That payment key was used for another sale.", 409, "IDEMPOTENCY_CONFLICT");
      await claim(tx, order, input.version);
      let recipient = state.guests.find((guest) => guest.paidCents === 0);
      for (const item of order.items) {
        const unassigned = item.lineTotalCents - item.allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0);
        if (unassigned > 0) {
          if (!recipient) {
            const seatNumber = Math.max(0, ...state.guests.map((guest) => guest.seatNumber)) + 1;
            recipient = { ...await tx.orderGuest.create({ data: { orderId: id, seatNumber, displayName: `Guest ${seatNumber}` } }), grossCents: 0, discountCents: 0, totalCents: 0, paidCents: 0, balanceCents: 0, allocations: [], payments: [] };
          }
          const recipientId = recipient.id;
          const previous = item.allocations.find((allocation) => allocation.orderGuestId === recipientId);
          if (previous) await tx.guestItemAllocation.update({ where: { id: previous.id }, data: { amountCents: previous.amountCents + unassigned, quantityUnits: null } });
          else await tx.guestItemAllocation.create({ data: { orderItemId: item.id, orderGuestId: recipientId, amountCents: unassigned, quantityUnits: null } });
        }
      }
      const allocated = summary(await load(tx, id, tenant.business.id));
      const balances = allocated.guests.filter((guest) => guest.balanceCents > 0);
      if (!allocated.complete || balances.reduce((sum, guest) => sum + guest.balanceCents, 0) !== remaining) throw new AppError("The guest balances could not be settled.", 409, "INVALID_PAYMENT");
      for (const [index, guest] of balances.entries()) {
        const change = index === 0 ? input.tenderedCents - remaining : 0;
        await tx.guestPayment.create({ data: { orderGuestId: guest.id, amountCents: guest.balanceCents, tenderedCents: guest.balanceCents + change, changeCents: change, idempotencyKey: index === 0 ? input.idempotencyKey : `${input.idempotencyKey}:${index}` } });
      }
    } else if (input.action === "pay") {
      if (await tx.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } })) {
        throw new AppError("That payment key was used for another sale.", 409, "IDEMPOTENCY_CONFLICT");
      }
      const guest = state.guests.find((g) => g.id === input.guestId);
      if (!guest) throw new AppError("Guest not found.", 404, "GUEST_NOT_FOUND");
      if (!state.complete) throw new AppError("Assign all items before taking payment.", 409, "UNASSIGNED_ITEMS");
      let quote;
      try { quote = quoteGuestPayment(guest.balanceCents, input.amountCents, input.tenderedCents); }
      catch (error) { throw new AppError(error instanceof Error ? error.message : "Invalid payment.", 400, "INVALID_PAYMENT"); }
      await claim(tx, order, input.version);
      await tx.guestPayment.create({ data: { ...quote, orderGuestId: guest.id, idempotencyKey: input.idempotencyKey } });
    } else {
      if (!state.complete || !state.guests.length || state.guests.some((g) => g.balanceCents !== 0)) {
        throw new AppError("Assign every item and settle every guest balance before closing.", 409, "BALANCE_REMAINS");
      }
      await claim(tx, order, input.version);
      await tx.order.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date() } });
      await tx.tableSession.deleteMany({ where: { orderId: id } });
    }
    return summary(await load(tx, id, tenant.business.id));
  });
  } catch (error) {
    if (input.action === "payRemaining" && isUniqueConstraint(error) && await db.guestPayment.findUnique({ where: { idempotencyKey: input.idempotencyKey } })) return updateGuestChecks(id, input, db);
    if (input.action === "pay" && isUniqueConstraint(error)) {
      const replay = await db.guestPayment.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { guest: true } });
      if (replay && replay.guest.orderId === id && replay.orderGuestId === input.guestId &&
          replay.amountCents === input.amountCents && replay.tenderedCents === input.tenderedCents) return getGuestChecks(id, db);
    }
    throw error;
  }
}

