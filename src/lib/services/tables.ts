import { prisma, type PrismaClient } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { deriveTableStatus, type TableStatus } from "@/lib/domain/tables";
import { getTenant } from "@/lib/services/tenant";

export type TableDto = {
  id: string;
  name: string;
  capacity: number;
  sortOrder: number;
  isReserved: boolean;
  status: TableStatus;
  order: null | {
    id: string;
    orderNumber: string;
    totalCents: number;
    guestCount: number;
    paidCents: number;
    balanceCents: number;
    openedAt: string;
  };
};

export async function listTables(db: PrismaClient = prisma): Promise<TableDto[]> {
  const tenant = await getTenant(db);
  const tables = await db.restaurantTable.findMany({
    where: { locationId: tenant.location.id, businessId: tenant.business.id },
    include: {
      session: {
        include: {
          order: { include: { guests: { include: { payments: true } } } },
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  return tables.map((table) => {
    const openOrder = table.session?.order?.status === "OPEN" ? table.session.order : null;
    return {
      id: table.id,
      name: table.name,
      capacity: table.capacity,
      sortOrder: table.sortOrder,
      isReserved: table.isReserved,
      status: deriveTableStatus({ hasOpenOrder: Boolean(openOrder), isReserved: table.isReserved }),
      order: openOrder
        ? {
            id: openOrder.id,
            orderNumber: openOrder.orderNumber,
            totalCents: openOrder.totalCents,
            guestCount: openOrder.guests.length,
            paidCents: openOrder.guests.reduce((sum, guest) => sum + guest.payments.reduce((subtotal, payment) => subtotal + payment.amountCents, 0), 0),
            balanceCents: openOrder.totalCents - openOrder.guests.reduce((sum, guest) => sum + guest.payments.reduce((subtotal, payment) => subtotal + payment.amountCents, 0), 0),
            openedAt: openOrder.createdAt.toISOString(),
          }
        : null,
    };
  });
}

export async function getTable(id: string, db: PrismaClient = prisma) {
  const tables = await listTables(db);
  const table = tables.find((entry) => entry.id === id);
  if (!table) throw new AppError("Table not found.", 404, "TABLE_NOT_FOUND");
  return table;
}

export async function setTableReserved(id: string, isReserved: boolean, db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  const table = await db.restaurantTable.findFirst({
    where: { id, businessId: tenant.business.id, locationId: tenant.location.id },
  });
  if (!table) throw new AppError("Table not found.", 404, "TABLE_NOT_FOUND");
  await db.restaurantTable.update({ where: { id }, data: { isReserved } });
  return getTable(id, db);
}
