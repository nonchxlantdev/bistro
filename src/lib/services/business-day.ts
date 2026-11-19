import type { Prisma } from "@/generated/prisma/client";
import { prisma, type PrismaClient } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { getTenant } from "@/lib/services/tenant";
import { staffNames } from "@/lib/services/staff";

type Db = PrismaClient | Prisma.TransactionClient;
export type PaymentMethod = "CASH" | "CARD";
export const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "CARD"];

export async function currentDay(db: Db, businessId: string) {
  return db.businessDay.findFirst({ where: { businessId, closedAt: null }, orderBy: { openedAt: "desc" } });
}

/** Payments always belong to a day. If nobody started one, open it with the default float. */
export async function ensureOpenDay(db: Db, businessId: string, staffId: string | null) {
  const open = await currentDay(db, businessId);
  if (open) return open;
  const settings = await db.businessSettings.findUnique({ where: { businessId } });
  return db.businessDay.create({ data: { businessId, openedById: staffId, openingFloatCents: settings?.defaultFloatCents ?? 10000 } });
}

function money(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 100_000_000) throw new AppError(`Enter a valid ${label}.`, 400, "INVALID_AMOUNT");
  return value as number;
}

export async function startDay(input: { floatCents: unknown }, staffId: string | null, db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  const floatCents = money(input.floatCents, "opening float");
  return db.$transaction(async (tx) => {
    const open = await currentDay(tx, tenant.business.id);
    if (open) {
      // Allowed until the first payment, so a mistyped float can be fixed.
      const used = await tx.payment.count({ where: { dayId: open.id } }) + await tx.guestPayment.count({ where: { dayId: open.id } });
      if (used) throw new AppError("The day already has payments. Close it before starting a new one.", 409, "DAY_IN_USE");
      return tx.businessDay.update({ where: { id: open.id }, data: { openingFloatCents: floatCents, openedById: staffId ?? open.openedById } });
    }
    return tx.businessDay.create({ data: { businessId: tenant.business.id, openedById: staffId, openingFloatCents: floatCents } });
  });
}

type Row = { method: string; amountCents: number; tipCents: number; staffId: string | null; orderId: string };
async function dayPayments(db: Db, dayId: string): Promise<Row[]> {
  const [tables, guests] = await Promise.all([
    db.payment.findMany({ where: { dayId }, select: { method: true, amountCents: true, tipCents: true, staffId: true, orderId: true } }),
    db.guestPayment.findMany({ where: { dayId }, select: { method: true, amountCents: true, tipCents: true, staffId: true, guest: { select: { orderId: true } } } }),
  ]);
  return [...tables, ...guests.map(({ guest, ...rest }) => ({ ...rest, orderId: guest.orderId }))];
}

function totals(rows: Row[]) {
  const sum = (filter: (row: Row) => boolean, pick: (row: Row) => number) => rows.filter(filter).reduce((total, row) => total + pick(row), 0);
  const cash = (row: Row) => row.method !== "CARD";
  const card = (row: Row) => row.method === "CARD";
  return {
    payments: rows.length,
    orders: new Set(rows.map((row) => row.orderId)).size,
    salesCents: sum(() => true, (row) => row.amountCents),
    cashSalesCents: sum(cash, (row) => row.amountCents),
    cardSalesCents: sum(card, (row) => row.amountCents),
    tipsCents: sum(() => true, (row) => row.tipCents),
    cashTipsCents: sum(cash, (row) => row.tipCents),
    cardTipsCents: sum(card, (row) => row.tipCents),
  };
}

export async function daySummary(dayId: string, db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  const day = await db.businessDay.findFirst({ where: { id: dayId, businessId: tenant.business.id } });
  if (!day) throw new AppError("Day not found.", 404, "DAY_NOT_FOUND");
  const rows = await dayPayments(db, day.id);
  const all = totals(rows);
  const byStaff = new Map<string, Row[]>();
  for (const row of rows) { const key = row.staffId ?? ""; byStaff.set(key, [...(byStaff.get(key) ?? []), row]); }
  const names = await staffNames([...byStaff.keys(), day.openedById, day.closedById], db);
  const servers = [...byStaff.entries()].map(([staffId, list]) => ({ staffId: staffId || null, name: staffId ? names.get(staffId) ?? "Former staff" : "Unassigned", ...totals(list) })).sort((a, b) => b.salesCents - a.salesCents);
  const expectedCashCents = day.openingFloatCents + all.cashSalesCents + all.cashTipsCents;
  const openOrders = await db.order.count({ where: { businessId: tenant.business.id, status: "OPEN" } });
  return {
    id: day.id, openedAt: day.openedAt, closedAt: day.closedAt, openingFloatCents: day.openingFloatCents,
    openedBy: day.openedById ? names.get(day.openedById) ?? null : null, closedBy: day.closedById ? names.get(day.closedById) ?? null : null,
    countedCashCents: day.countedCashCents, notes: day.notes,
    expectedCashCents: day.closedAt ? day.expectedCashCents ?? expectedCashCents : expectedCashCents,
    differenceCents: day.countedCashCents === null ? null : day.countedCashCents - (day.expectedCashCents ?? expectedCashCents),
    totals: all, servers, openOrders,
  };
}

export async function getDayOverview(db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  const [open, settings, recent] = await Promise.all([
    currentDay(db, tenant.business.id),
    db.businessSettings.findUnique({ where: { businessId: tenant.business.id } }),
    db.businessDay.findMany({ where: { businessId: tenant.business.id, closedAt: { not: null } }, orderBy: { closedAt: "desc" }, take: 10, select: { id: true } }),
  ]);
  return {
    current: open ? await daySummary(open.id, db) : null,
    defaultFloatCents: settings?.defaultFloatCents ?? 10000,
    history: await Promise.all(recent.map((day) => daySummary(day.id, db))),
  };
}

export async function closeDay(input: { countedCashCents: unknown; notes?: unknown; confirmOpenOrders?: unknown }, staffId: string | null, db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  const counted = money(input.countedCashCents, "counted cash amount");
  const notes = typeof input.notes === "string" ? input.notes.trim().slice(0, 500) : "";
  const open = await currentDay(db, tenant.business.id);
  if (!open) throw new AppError("There is no open day to close.", 409, "NO_OPEN_DAY");
  const summary = await daySummary(open.id, db);
  if (summary.openOrders && input.confirmOpenOrders !== true) throw new AppError(`${summary.openOrders} order(s) are still open. Settle them, or confirm to close the day anyway.`, 409, "OPEN_ORDERS");
  const result = await db.businessDay.updateMany({ where: { id: open.id, closedAt: null }, data: { closedAt: new Date(), closedById: staffId, countedCashCents: counted, expectedCashCents: summary.expectedCashCents, notes } });
  if (result.count !== 1) throw new AppError("This day was already closed.", 409, "DAY_CLOSED");
  return daySummary(open.id, db);
}
