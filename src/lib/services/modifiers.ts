import { createHash, randomUUID } from "node:crypto";
import { prisma, type PrismaClient } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { getTenant } from "@/lib/services/tenant";
import type { Prisma } from "@/generated/prisma/client";

export type ModifierInput = {
  name: string;
  minSelect: number;
  maxSelect: number;
  isActive: boolean;
  productIds: string[];
  options: Array<{ id?: string; name: string; priceDeltaCents: number; isActive: boolean }>;
  revision?: string;
};

const include = {
  options: { orderBy: [{ sortOrder: "asc" as const }, { name: "asc" as const }] },
  products: { orderBy: { sortOrder: "asc" as const }, select: { productId: true } },
};

function revision(group: { name: string; minSelect: number; maxSelect: number; isActive: boolean; options: Array<{ id: string; name: string; priceDeltaCents: number; isActive: boolean; sortOrder: number }>; products: Array<{ productId: string }> }) {
  const snapshot = { name: group.name, minSelect: group.minSelect, maxSelect: group.maxSelect, isActive: group.isActive,
    options: [...group.options].sort((a, b) => a.id.localeCompare(b.id)), products: group.products.map((entry) => entry.productId).sort() };
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

/** Reject menu configurations that can produce a negative unit price. */
export async function assertModifierPrices(tx: Prisma.TransactionClient, productIds: string[]) {
  const products = await tx.product.findMany({ where: { id: { in: productIds } }, include: {
    modifierGroups: { include: { group: { include: { options: { where: { isActive: true } } } } } },
  } });
  for (const product of products) {
    let minimum = product.priceCents;
    for (const { group } of product.modifierGroups) {
      if (!group.isActive) continue;
      const prices = group.options.map((option) => option.priceDeltaCents).sort((a, b) => a - b);
      const count = Math.max(group.minSelect, Math.min(group.maxSelect, prices.filter((price) => price < 0).length));
      minimum += prices.slice(0, count).reduce((sum, price) => sum + price, 0);
    }
    if (!Number.isSafeInteger(minimum) || minimum < 0) throw new AppError(`Modifier choices could make ${product.name}'s price negative.`, 400, "NEGATIVE_PRODUCT_PRICE");
  }
}

export async function listModifierGroups(db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  const groups = await db.modifierGroup.findMany({ where: { businessId: tenant.business.id }, include, orderBy: { name: "asc" } });
  return groups.map((group) => ({ ...group, revision: revision(group), productIds: group.products.map((product) => product.productId), products: undefined }));
}

export async function saveModifierGroup(id: string | null, input: ModifierInput, db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  const optionIds = input.options.flatMap((option) => option.id ? [option.id] : []);
  if (new Set(optionIds).size !== optionIds.length || new Set(input.productIds).size !== input.productIds.length) {
    throw new AppError("Options and products cannot be repeated.", 400, "DUPLICATE_SELECTION");
  }
  const activeOptions = input.options.filter((option) => option.isActive).length;
  if (input.minSelect > input.maxSelect || (input.isActive && (activeOptions === 0 || input.minSelect > activeOptions))) {
    throw new AppError("An active group needs options and cannot require more selections than are available.", 400, "INVALID_SELECTION_LIMITS");
  }
  return db.$transaction(async (tx) => {
    const existing = id ? await tx.modifierGroup.findFirst({ where: { id, businessId: tenant.business.id }, include }) : null;
    if (id && !existing) throw new AppError("Modifier group not found.", 404, "MODIFIER_NOT_FOUND");
    if (existing && input.revision !== revision(existing)) throw new AppError("This group changed. Reload it before saving.", 409, "VERSION_CONFLICT");
    if (optionIds.some((optionId) => !existing?.options.some((option) => option.id === optionId))) {
      throw new AppError("A modifier option does not belong to this group.", 400, "INVALID_MODIFIER_OPTION");
    }
    const products = await tx.product.count({ where: { id: { in: input.productIds }, businessId: tenant.business.id } });
    if (products !== input.productIds.length) throw new AppError("Choose products from this business.", 400, "INVALID_PRODUCT");
    const groupId = id ?? randomUUID();
    const data = { name: input.name, minSelect: input.minSelect, maxSelect: input.maxSelect, isActive: input.isActive };
    if (existing) await tx.modifierGroup.update({ where: { id: groupId }, data });
    else await tx.modifierGroup.create({ data: { ...data, id: groupId, businessId: tenant.business.id } });
    // Omitted options are hidden, not deleted: old order snapshots remain valid.
    await tx.modifierOption.updateMany({ where: { groupId, id: { notIn: optionIds } }, data: { isActive: false } });
    for (const [sortOrder, option] of input.options.entries()) {
      const optionData = { name: option.name, priceDeltaCents: option.priceDeltaCents, isActive: option.isActive, sortOrder };
      if (option.id) await tx.modifierOption.update({ where: { id: option.id }, data: optionData });
      else await tx.modifierOption.create({ data: { ...optionData, id: randomUUID(), groupId } });
    }
    await tx.productModifierGroup.deleteMany({ where: { groupId, productId: { notIn: input.productIds } } });
    for (const productId of input.productIds) {
      await tx.productModifierGroup.upsert({ where: { productId_groupId: { productId, groupId } }, update: {}, create: { productId, groupId } });
    }
    await assertModifierPrices(tx, input.productIds);
    return tx.modifierGroup.findUniqueOrThrow({ where: { id: groupId }, include });
  });
}
