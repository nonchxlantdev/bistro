import { prisma, type PrismaClient } from "@/lib/db/prisma";
import { getTenant } from "@/lib/services/tenant";

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function getDashboard(db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  const start = startOfToday();
  const [openOrders, completedToday, tables, occupied, activeKitchenTickets, openChecks, recentOrders] = await Promise.all([
    db.order.count({ where: { businessId: tenant.business.id, status: "OPEN" } }),
    db.order.findMany({
      where: {
        businessId: tenant.business.id,
        status: "COMPLETED",
        completedAt: { gte: start },
      },
      select: { totalCents: true },
    }),
    db.restaurantTable.count({ where: { locationId: tenant.location.id } }),
    db.tableSession.count({
      where: { table: { locationId: tenant.location.id } },
    }),
    db.kitchenTicket.count({ where: { status: { not: "SERVED" }, order: { businessId: tenant.business.id, locationId: tenant.location.id } } }),
    db.order.findMany({ where: { businessId: tenant.business.id, status: "OPEN" }, select: { totalCents: true, guests: { select: { payments: { select: { amountCents: true } } } } } }),
    db.order.findMany({ where: { businessId: tenant.business.id }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, orderNumber: true, status: true, totalCents: true, createdAt: true, orderType: true, table: { select: { name: true } } } }),
  ]);

  const salesCents = completedToday.reduce((sum, order) => sum + order.totalCents, 0);

  return {
    businessName: tenant.settings.businessName,
    locationName: tenant.location.name,
    currency: tenant.settings.currency,
    openOrders,
    occupiedTables: occupied,
    tableCount: tables,
    completedToday: completedToday.length,
    salesCents,
    activeKitchenTickets,
    awaitingPaymentCents: openChecks.reduce((sum, order) => sum + order.totalCents - order.guests.reduce((paid, guest) => paid + guest.payments.reduce((amount, payment) => amount + payment.amountCents, 0), 0), 0),
    recentOrders: recentOrders.map((order) => ({ id: order.id, orderNumber: order.orderNumber, status: order.status, totalCents: order.totalCents, createdAt: order.createdAt.toISOString(), tableName: order.table?.name ?? "Takeaway" })),
  };
}
