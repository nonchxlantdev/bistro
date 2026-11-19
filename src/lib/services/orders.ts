import type { Prisma } from "@/generated/prisma/client";
import { prisma, type PrismaClient } from "@/lib/db/prisma";
import { AppError, isUniqueConstraint } from "@/lib/errors";
import { calculateOrderTotals, lineTotalCents } from "@/lib/domain/totals";
import { quoteCashPayment } from "@/lib/domain/checkout";
import { canCheckoutOrder, canEditOrder } from "@/lib/domain/order-rules";
import { getTenant } from "@/lib/services/tenant";
import { ensureOpenDay } from "@/lib/services/business-day";
import { quoteTender } from "@/lib/domain/tender";
import type { Actor } from "@/lib/services/guest-checks";
import { kitchenOrderState } from "@/lib/domain/kitchen-snapshots";

type Tx = Prisma.TransactionClient;

const orderInclude = {
  items: { orderBy: { position: "asc" as const }, include: { modifiers: { orderBy: { id: "asc" as const } } } },
  table: true,
  payment: true,
  guests: { orderBy: { seatNumber: "asc" as const }, include: { payments: { orderBy: { createdAt: "asc" as const } } } },
  kitchenTickets: { select: { id: true, status: true, orderVersion: true, snapshotJson: true } },
} satisfies Prisma.OrderInclude;

type OrderRecord = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export type OrderDto = {
  id: string;
  orderNumber: string;
  orderType: "DINE_IN" | "TAKEAWAY";
  status: "OPEN" | "COMPLETED" | "CANCELLED";
  kitchenServed: boolean;
  lockedItemIds: string[];
  additionItemIds: string[];
  tableId: string | null;
  tableName: string | null;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  version: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  openedById: string | null;
  closedById: string | null;
  items: Array<{
    id: string;
    productId: string | null;
    name: string;
    unitPriceCents: number;
    quantity: number;
    lineTotalCents: number;
    instructions: string;
    modifiers: Array<{ optionId: string | null; groupName: string; optionName: string; priceDeltaCents: number }>;
  }>;
  payment: null | {
    method: string;
    amountCents: number;
    tipCents: number;
    tenderedCents: number;
    changeCents: number;
    idempotencyKey: string;
    createdAt: string;
  };
  guestPayments: Array<{ guestName: string; method: string; amountCents: number; tipCents: number; tenderedCents: number; changeCents: number; createdAt: string }>;
};

export function toOrderDto(order: OrderRecord): OrderDto {
  const kitchen = kitchenOrderState(order.kitchenTickets);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderType: order.orderType as OrderDto["orderType"],
    status: order.status as OrderDto["status"],
    kitchenServed: kitchen.served,
    lockedItemIds: kitchen.served ? kitchen.sentIds : [],
    additionItemIds: kitchen.served ? order.items.filter((item) => !kitchen.originalIds.includes(item.id)).map((item) => item.id) : [],
    tableId: order.tableId,
    tableName: order.table?.name ?? null,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    totalCents: order.totalCents,
    version: order.version,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    completedAt: order.completedAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    openedById: order.openedById,
    closedById: order.closedById,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.productNameSnapshot,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
      lineTotalCents: item.lineTotalCents,
      instructions: item.instructions,
      modifiers: item.modifiers.map(({ optionId, groupName, optionName, priceDeltaCents }) => ({ optionId, groupName, optionName, priceDeltaCents })),
    })),
    payment: order.payment
      ? {
          method: order.payment.method,
          amountCents: order.payment.amountCents,
          tipCents: order.payment.tipCents,
          tenderedCents: order.payment.tenderedCents,
          changeCents: order.payment.changeCents,
          idempotencyKey: order.payment.idempotencyKey,
          createdAt: order.payment.createdAt.toISOString(),
        }
      : null,
    guestPayments: order.guests.flatMap((guest) => guest.payments.map((payment) => ({
      guestName: guest.displayName, method: payment.method, amountCents: payment.amountCents, tipCents: payment.tipCents, tenderedCents: payment.tenderedCents,
      changeCents: payment.changeCents, createdAt: payment.createdAt.toISOString(),
    }))),
  };
}

async function loadOrder(tx: Tx | PrismaClient, id: string) {
  const order = await tx.order.findUnique({ where: { id }, include: orderInclude });
  if (!order) throw new AppError("Order not found.", 404, "ORDER_NOT_FOUND");
  return order;
}

type ItemInput = { productId: string; quantity: number; itemId?: string; modifierOptionIds?: string[]; instructions?: string };

function mergeItems(items: ItemInput[]) {
  const result = new Map<string, ItemInput>();
  for (const item of items) {
    const options = [...(item.modifierOptionIds ?? [])].sort();
    if (new Set(options).size !== options.length) throw new AppError("A modifier cannot be selected twice.", 400, "INVALID_MODIFIERS");
    const key = item.itemId ? `id:${item.itemId}` : JSON.stringify([item.productId, options, item.instructions?.trim() ?? ""]);
    const previous = result.get(key);
    if (previous && item.itemId) throw new AppError("The same order line was submitted twice.", 400, "DUPLICATE_LINE");
    const quantity = (previous?.quantity ?? 0) + item.quantity;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new AppError("Quantity must be from 1 to 999.", 400, "QUANTITY_LIMIT");
    result.set(key, { ...item, modifierOptionIds: options, instructions: item.instructions?.trim() ?? "", quantity });
  }
  return [...result.values()];
}

async function priceItems(
  tx: Tx,
  businessId: string,
  items: ItemInput[],
  existing: OrderRecord["items"] | undefined,
) {
  const used = new Set<string>();
  const explicitIds = new Set(items.flatMap((item) => item.itemId ? [item.itemId] : []));
  const lines = [];
  for (const item of items) {
    const requestedOptions = item.modifierOptionIds ?? [];
    const snapshot = item.itemId
      ? existing?.find((line) => line.id === item.itemId)
      : existing?.find((line) => !used.has(line.id) && !explicitIds.has(line.id) && line.productId === item.productId && line.modifiers.length === 0 && !line.instructions && requestedOptions.length === 0 && !item.instructions);
    if (item.itemId && (!snapshot || snapshot.productId !== item.productId || used.has(item.itemId))) {
      throw new AppError("An order line is invalid or belongs to another order.", 400, "INVALID_ORDER_LINE");
    }
    if (snapshot) {
      used.add(snapshot.id);
      const originalOptions = snapshot.modifiers.map((modifier) => modifier.optionId).filter((id): id is string => Boolean(id)).sort();
      if (item.itemId && (snapshot.instructions !== (item.instructions ?? "") || JSON.stringify(originalOptions) !== JSON.stringify(requestedOptions))) {
        throw new AppError("Remove and add a line to change its customization.", 409, "CUSTOMIZATION_LOCKED");
      }
      lines.push({
        existingItemId: snapshot.id,
        productId: item.productId,
        name: snapshot.productNameSnapshot,
        unitPriceCents: snapshot.unitPriceCents,
        quantity: item.quantity,
        instructions: snapshot.instructions,
        modifiers: snapshot.modifiers.map(({ optionId, groupName, optionName, priceDeltaCents }) => ({ optionId, groupName, optionName, priceDeltaCents })),
      });
      continue;
    }

    const product = await tx.product.findFirst({
      where: { id: item.productId, businessId, isActive: true },
      include: { modifierGroups: { include: { group: { include: { options: true } } } } },
    });
    if (!product) {
      throw new AppError("One of the products is unavailable.", 400, "PRODUCT_UNAVAILABLE");
    }
    const groups = product.modifierGroups.map((link) => link.group).filter((group) => group.isActive);
    const selected = groups.flatMap((group) => group.options.filter((option) => option.isActive && requestedOptions.includes(option.id)).map((option) => ({ optionId: option.id, groupName: group.name, optionName: option.name, priceDeltaCents: option.priceDeltaCents })));
    if (selected.length !== requestedOptions.length) throw new AppError("One of the selected modifiers is unavailable.", 400, "INVALID_MODIFIERS");
    for (const group of groups) {
      const count = group.options.filter((option) => option.isActive && requestedOptions.includes(option.id)).length;
      if (count < group.minSelect || count > group.maxSelect) throw new AppError(`Choose ${group.minSelect}–${group.maxSelect} options for ${group.name}.`, 400, "INVALID_MODIFIERS");
    }
    const unitPriceCents = product.priceCents + selected.reduce((sum, option) => sum + option.priceDeltaCents, 0);
    if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) throw new AppError("The customized price is invalid.", 400, "INVALID_MODIFIERS");
    lines.push({
      existingItemId: undefined,
      productId: product.id,
      name: product.name,
      unitPriceCents,
      quantity: item.quantity,
      instructions: item.instructions ?? "",
      modifiers: selected,
    });
  }

  let totals;
  try {
    totals = calculateOrderTotals(lines, 0);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Could not total the order.", 400, "TOTALS");
  }
  return { lines, subtotalCents: totals.subtotalCents };
}

async function nextOrderNumber(tx: Tx, businessId: string) {
  const counter = await tx.orderCounter.update({
    where: { businessId },
    data: { nextNumber: { increment: 1 } },
  });
  const issued = counter.nextNumber - 1;
  if (issued < 1) {
    throw new AppError("Order numbering is not configured.", 500, "ORDER_COUNTER");
  }
  return `ORD-${String(issued).padStart(6, "0")}`;
}

async function syncTableSession(
  tx: Tx,
  input: {
    orderId: string;
    orderType: "DINE_IN" | "TAKEAWAY";
    tableId: string | null;
    businessId: string;
    locationId: string;
  },
) {
  if (input.orderType === "TAKEAWAY" || !input.tableId) {
    if (input.orderType === "DINE_IN") {
      throw new AppError("Select a table for dine-in orders.", 400, "TABLE_REQUIRED");
    }
    await tx.tableSession.deleteMany({ where: { orderId: input.orderId } });
    return null;
  }

  const table = await tx.restaurantTable.findFirst({
    where: { id: input.tableId, businessId: input.businessId, locationId: input.locationId },
  });
  if (!table) {
    throw new AppError("That table does not belong to this location.", 400, "TABLE_NOT_FOUND");
  }

  const occupying = await tx.tableSession.findUnique({ where: { tableId: table.id } });
  if (occupying && occupying.orderId !== input.orderId) {
    throw new AppError("This table already has an open order.", 409, "TABLE_OCCUPIED");
  }
  if (!occupying && table.isReserved) {
    throw new AppError("This table is reserved.", 409, "TABLE_RESERVED");
  }

  await tx.tableSession.deleteMany({
    where: { orderId: input.orderId, NOT: { tableId: table.id } },
  });

  if (!occupying) {
    try {
      await tx.tableSession.create({ data: { orderId: input.orderId, tableId: table.id } });
    } catch (error) {
      if (isUniqueConstraint(error)) {
        throw new AppError("This table already has an open order.", 409, "TABLE_OCCUPIED");
      }
      throw error;
    }
  }

  return table.id;
}

function applyDiscount(subtotalCents: number, discountCents: number) {
  try {
    return calculateOrderTotals(
      [{ productId: "subtotal", name: "Subtotal", unitPriceCents: subtotalCents, quantity: 1 }],
      discountCents,
    );
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Discount is invalid.", 400, "DISCOUNT");
  }
}

export async function saveOrder(
  input: {
    orderId?: string;
    version?: number;
    orderType: "DINE_IN" | "TAKEAWAY";
    tableId?: string | null;
    discountCents: number;
    supportsCustomizations?: boolean;
    additionsOnly?: boolean;
    items: ItemInput[];
  },
  db: PrismaClient = prisma,
  actor: Actor = { staffId: null },
) {
  const tenant = await getTenant(db);
  const items = mergeItems(input.items);
  const tableId = input.orderType === "DINE_IN" ? (input.tableId ?? null) : null;

  try {
    const order = await db.$transaction(async (tx) => {
      const priced = await priceItems(
        tx,
        tenant.business.id,
        items,
        input.orderId ? (await tx.order.findUnique({ where: { id: input.orderId }, include: orderInclude }))?.items : undefined,
      );
      const totals = applyDiscount(priced.subtotalCents, input.discountCents);

      if (!input.orderId) {
        const orderNumber = await nextOrderNumber(tx, tenant.business.id);
        const created = await tx.order.create({
          data: {
            businessId: tenant.business.id,
            locationId: tenant.location.id,
            tableId,
            orderNumber,
            orderType: input.orderType,
            status: "OPEN",
            openedById: actor.staffId,
            subtotalCents: totals.subtotalCents,
            discountCents: totals.discountCents,
            totalCents: totals.totalCents,
            version: 1,
            items: {
              create: priced.lines.map((line, position) => ({
                position,
                productId: line.productId,
                productNameSnapshot: line.name,
                unitPriceCents: line.unitPriceCents,
                quantity: line.quantity,
                lineTotalCents: lineTotalCents(line.unitPriceCents, line.quantity),
                instructions: line.instructions,
                modifiers: { create: line.modifiers },
              })),
            },
          },
        });
        await syncTableSession(tx, {
          orderId: created.id,
          orderType: input.orderType,
          tableId,
          businessId: tenant.business.id,
          locationId: tenant.location.id,
        });
        return loadOrder(tx, created.id);
      }

      const existing = await loadOrder(tx, input.orderId);
      if (existing.businessId !== tenant.business.id) {
        throw new AppError("Order not found.", 404, "ORDER_NOT_FOUND");
      }
      if (!canEditOrder(existing.status)) {
        throw new AppError(
          existing.status === "CANCELLED"
            ? "Cancelled orders cannot be edited."
            : "Completed orders cannot be edited.",
          409,
          "ORDER_LOCKED",
        );
      }
      const kitchen = kitchenOrderState(existing.kitchenTickets);
      if (kitchen.served) {
        const nextById = new Map(priced.lines.map((line) => [line.existingItemId, line]));
        if (!input.additionsOnly || input.orderType !== existing.orderType || tableId !== existing.tableId || input.discountCents !== existing.discountCents || existing.items.some((item) => {
          if (!kitchen.sentIds.includes(item.id)) return false;
          const next = nextById.get(item.id);
          return !next || next.quantity !== item.quantity || next.unitPriceCents !== item.unitPriceCents;
        })) throw new AppError("Served items, table and discount are locked. Use Add to this order for new items.", 409, "ORDER_SERVED");
      }
      if (!input.supportsCustomizations && existing.items.some((line) => (line.modifiers.length > 0 || line.instructions) && !items.some((item) => item.itemId === line.id))) {
        throw new AppError("This order contains customized items. Reload the register before editing it.", 409, "CUSTOMIZATION_CLIENT_OUTDATED");
      }
      if (input.version === undefined || input.version !== existing.version) {
        throw new AppError("This order changed somewhere else. Reload it and try again.", 409, "VERSION_CONFLICT");
      }

      if (input.orderType !== "DINE_IN" && await tx.orderGuest.count({ where: { orderId: existing.id } })) {
        throw new AppError("An order with guest checks must remain dine-in until it is closed.", 409, "GUEST_CHECKS_EXIST");
      }

      const allocated = await tx.guestItemAllocation.findMany({
        where: { item: { orderId: existing.id } },
        select: { orderItemId: true },
      });
      if (existing.discountCents > 0 && await tx.guestPayment.count({ where: { guest: { orderId: existing.id } } })) {
        const oldLines = new Map(existing.items.map((item) => [item.id, item.quantity]));
        if (priced.lines.length !== existing.items.length || priced.lines.some((line) => !line.existingItemId || oldLines.get(line.existingItemId) !== line.quantity)) {
          throw new AppError("Items on a discounted order cannot change after a guest payment.", 409, "PAID_ALLOCATION_LOCKED");
        }
      }
      if (allocated.length) {
        const allocatedIds = new Set(allocated.map((allocation) => allocation.orderItemId));
        const linesById = new Map(priced.lines.filter((line) => line.existingItemId).map((line) => [line.existingItemId, line]));
        if (input.discountCents !== existing.discountCents || existing.items.some((item) => {
          if (!allocatedIds.has(item.id)) return false;
          const next = linesById.get(item.id);
          return !next || next.quantity !== item.quantity || next.unitPriceCents !== item.unitPriceCents;
        })) {
          throw new AppError("Allocated items and discounts cannot be changed until their allocations are removed.", 409, "ALLOCATED_ITEM_LOCKED");
        }
      }

      const updated = await tx.order.updateMany({
        where: { id: existing.id, status: "OPEN", version: existing.version },
        data: {
          orderType: input.orderType,
          tableId,
          subtotalCents: totals.subtotalCents,
          discountCents: totals.discountCents,
          totalCents: totals.totalCents,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new AppError("This order changed somewhere else. Reload it and try again.", 409, "VERSION_CONFLICT");
      }

      // Preserve the identity of existing lines so future allocations and kitchen
      // history can reference them across saves. Never silently drop a snapshot
      // whose product has been deleted.
      if (existing.items.some((item) => !item.productId)) {
        throw new AppError("This order contains a deleted product and cannot be edited safely.", 409, "PRODUCT_DELETED");
      }
      const retainedIds: string[] = [];
      for (const [position, line] of priced.lines.entries()) {
        const previous = line.existingItemId ? existing.items.find((item) => item.id === line.existingItemId) : undefined;
        const data = {
          position,
          productNameSnapshot: line.name,
          unitPriceCents: line.unitPriceCents,
          quantity: line.quantity,
          lineTotalCents: lineTotalCents(line.unitPriceCents, line.quantity),
          instructions: line.instructions,
        };
        if (previous) {
          await tx.orderItem.update({ where: { id: previous.id }, data });
          retainedIds.push(previous.id);
        } else {
          const created = await tx.orderItem.create({
            data: { ...data, orderId: existing.id, productId: line.productId, modifiers: { create: line.modifiers } },
          });
          retainedIds.push(created.id);
        }
      }
      await tx.orderItem.deleteMany({ where: { orderId: existing.id, id: { notIn: retainedIds } } });
      await syncTableSession(tx, {
        orderId: existing.id,
        orderType: input.orderType,
        tableId,
        businessId: tenant.business.id,
        locationId: tenant.location.id,
      });
      return loadOrder(tx, existing.id);
    });

    return toOrderDto(order);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      throw new AppError("This table already has an open order.", 409, "TABLE_OCCUPIED");
    }
    throw error;
  }
}

export async function getOrder(id: string, db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  const order = await db.order.findFirst({
    where: { id, businessId: tenant.business.id },
    include: orderInclude,
  });
  if (!order) throw new AppError("Order not found.", 404, "ORDER_NOT_FOUND");
  return toOrderDto(order);
}

export async function listOrders(
  filters: { status?: string; query?: string },
  db: PrismaClient = prisma,
) {
  const tenant = await getTenant(db);
  const status = filters.status && filters.status !== "ALL" ? filters.status : undefined;
  const orders = await db.order.findMany({
    where: {
      businessId: tenant.business.id,
      ...(status ? { status } : {}),
    },
    include: orderInclude,
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const query = filters.query?.trim().toLowerCase() ?? "";
  const filtered = query
    ? orders.filter(
        (order) =>
          order.orderNumber.toLowerCase().includes(query) ||
          (order.table?.name.toLowerCase().includes(query) ?? false),
      )
    : orders;
  return filtered.map(toOrderDto);
}

export async function cancelOrder(id: string, version: number, db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  const order = await db.$transaction(async (tx) => {
    const existing = await loadOrder(tx, id);
    if (existing.businessId !== tenant.business.id) {
      throw new AppError("Order not found.", 404, "ORDER_NOT_FOUND");
    }
    if (existing.status !== "OPEN") {
      throw new AppError("Only open orders can be cancelled.", 409, "ORDER_LOCKED");
    }
    if (kitchenOrderState(existing.kitchenTickets).served) throw new AppError("Served orders cannot be cancelled yet.", 409, "ORDER_SERVED");
    if (await tx.guestPayment.count({ where: { guest: { orderId: id } } })) {
      throw new AppError("A partially paid order cannot be cancelled without a reversal.", 409, "PAYMENTS_EXIST");
    }
    const updated = await tx.order.updateMany({
      where: { id, status: "OPEN", version },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new AppError("This order changed somewhere else. Reload it and try again.", 409, "VERSION_CONFLICT");
    }
    await tx.tableSession.deleteMany({ where: { orderId: id } });
    return loadOrder(tx, id);
  });
  return toOrderDto(order);
}

export async function checkoutOrder(
  id: string,
  input: { tenderedCents: number; idempotencyKey: string; version?: number; tipCents?: number; method?: "CASH" | "CARD" },
  db: PrismaClient = prisma,
  actor: Actor = { staffId: null },
) {
  const tenant = await getTenant(db);

  const replay = await db.payment.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { order: { include: orderInclude } },
  });
  if (replay) {
    if (replay.orderId !== id || replay.order.businessId !== tenant.business.id) {
      throw new AppError("That payment key was already used for another sale.", 409, "IDEMPOTENCY_CONFLICT");
    }
    return toOrderDto(replay.order);
  }

  try {
    const order = await db.$transaction(async (tx) => {
      const existing = await loadOrder(tx, id);
      if (existing.businessId !== tenant.business.id) {
        throw new AppError("Order not found.", 404, "ORDER_NOT_FOUND");
      }
      if (existing.payment) {
        throw new AppError("This order already has a payment.", 409, "ALREADY_PAID");
      }
      if (await tx.guestPayment.findUnique({ where: { idempotencyKey: input.idempotencyKey } })) {
        throw new AppError("That payment key was used for another sale.", 409, "IDEMPOTENCY_CONFLICT");
      }
      if (await tx.orderGuest.count({ where: { orderId: id } })) {
        throw new AppError("Use guest checkout for this order.", 409, "GUEST_CHECKS_EXIST");
      }
      if (!canCheckoutOrder(existing.status)) {
        throw new AppError(
          existing.status === "CANCELLED"
            ? "Cancelled orders cannot be checked out."
            : "This order is already completed.",
          409,
          "ORDER_LOCKED",
        );
      }
      if (input.version !== undefined && existing.version !== input.version) {
        throw new AppError("This order changed. Reload it before checkout.", 409, "VERSION_CONFLICT");
      }
      if (existing.items.length === 0) {
        throw new AppError("Add items before checkout.", 400, "EMPTY_ORDER");
      }

      let subtotalCents = 0;
      for (const item of existing.items) {
        const expected = lineTotalCents(item.unitPriceCents, item.quantity);
        if (expected !== item.lineTotalCents) {
          throw new AppError("Order line totals do not match. Reload and try again.", 409, "TOTALS_CORRUPT");
        }
        subtotalCents += expected;
      }
      const totals = applyDiscount(subtotalCents, existing.discountCents);
      if (totals.totalCents <= 0) {
        // Nothing to charge (fully discounted): record a zero cash payment.
        const quote = quoteCashPayment(totals.totalCents, input.tenderedCents);
        if (!quote.ok) throw new AppError(quote.message, 400, "INSUFFICIENT_CASH");
      }
      let tender;
      try {
        tender = totals.totalCents > 0
          ? quoteTender({ amountCents: totals.totalCents, tipCents: input.tipCents, method: input.method, tenderedCents: input.tenderedCents })
          : { method: "CASH" as const, amountCents: 0, tipCents: 0, tenderedCents: input.tenderedCents, changeCents: input.tenderedCents };
      } catch (error) {
        throw new AppError(error instanceof Error ? error.message : "Check the payment.", 400, "INSUFFICIENT_CASH");
      }
      const day = await ensureOpenDay(tx, tenant.business.id, actor.staffId);

      await tx.payment.create({
        data: {
          orderId: existing.id,
          method: tender.method,
          amountCents: tender.amountCents,
          tipCents: tender.tipCents,
          tenderedCents: tender.tenderedCents,
          changeCents: tender.changeCents,
          staffId: actor.staffId,
          dayId: day.id,
          idempotencyKey: input.idempotencyKey,
        },
      });

      const updated = await tx.order.updateMany({
        where: { id: existing.id, status: "OPEN" },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          closedById: actor.staffId,
          subtotalCents: totals.subtotalCents,
          discountCents: totals.discountCents,
          totalCents: totals.totalCents,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new AppError("This order could not be completed.", 409, "CHECKOUT_CONFLICT");
      }
      await tx.tableSession.deleteMany({ where: { orderId: existing.id } });
      return loadOrder(tx, existing.id);
    });
    return toOrderDto(order);
  } catch (error) {
    if (!isUniqueConstraint(error)) throw error;
    const payment = await db.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { order: { include: orderInclude } },
    });
    if (payment?.orderId === id) return toOrderDto(payment.order);
    const existing = await db.order.findUnique({ where: { id }, include: orderInclude });
    if (existing?.status === "COMPLETED") {
      throw new AppError("This order is already completed.", 409, "ALREADY_PAID");
    }
    throw new AppError("Checkout could not be completed. Try again.", 409, "CHECKOUT_CONFLICT");
  }
}
