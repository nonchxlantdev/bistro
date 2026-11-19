import { prisma, type PrismaClient } from "@/lib/db/prisma";
import { AppError, isUniqueConstraint } from "@/lib/errors";
import { APP_VERSION } from "@/lib/version";
import { getTenant } from "@/lib/services/tenant";
import { demoReceiptFooter, demoReceiptName } from "@/lib/brand";

export async function getSettings(db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  return {
    businessName: demoReceiptName(tenant.settings.businessName),
    locationName: tenant.location.name,
    locationAddress: tenant.location.address,
    currency: tenant.settings.currency,
    receiptFooter: demoReceiptFooter(tenant.settings.receiptFooter),
    version: APP_VERSION,
  };
}

export async function updateSettings(
  input: { businessName: string; locationName: string; currency: string; receiptFooter: string },
  db: PrismaClient = prisma,
) {
  const tenant = await getTenant(db);
  const currency = input.currency.toUpperCase();
  try {
    await db.$transaction([
      db.business.update({
        where: { id: tenant.business.id },
        data: { name: input.businessName, currency },
      }),
      db.location.update({
        where: { id: tenant.location.id },
        data: { name: input.locationName },
      }),
      db.businessSettings.update({
        where: { id: tenant.settings.id },
        data: {
          businessName: input.businessName,
          currency,
          receiptFooter: input.receiptFooter,
        },
      }),
    ]);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      throw new AppError("A location with that name already exists.", 409, "DUPLICATE_LOCATION");
    }
    throw error;
  }
  return getSettings(db);
}
