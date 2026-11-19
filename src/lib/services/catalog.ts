import { randomUUID } from "node:crypto";
import { prisma, type PrismaClient } from "@/lib/db/prisma";
import { AppError, isUniqueConstraint } from "@/lib/errors";
import { getTenant } from "@/lib/services/tenant";
import { assertModifierPrices } from "@/lib/services/modifiers";
import { storeProductImage, removeStoredImages, type ProductImageChange, type StoredProductImage } from "@/lib/services/product-images";

async function cleanUnusedImages(paths: Array<string | null>, db: PrismaClient) {
  for (const imagePath of paths) {
    if (!imagePath) continue;
    try {
      if (!await db.product.count({ where: { OR: [{ imagePath }, { imageThumbnailPath: imagePath }] } })) await removeStoredImages([imagePath]);
    } catch (error) { console.warn("Unused product image could not be cleaned up.", error); }
  }
}

function toCategory(category: {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}) {
  return category;
}

function toProduct(product: {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  imagePath: string | null;
  imageThumbnailPath: string | null;
  isActive: boolean;
  category?: { id: string; name: string; isActive: boolean };
}) {
  return {
    id: product.id,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? "",
    categoryActive: product.category?.isActive ?? true,
    name: product.name,
    description: product.description,
    priceCents: product.priceCents,
    imagePath: product.imagePath,
    imageThumbnailPath: product.imageThumbnailPath,
    isActive: product.isActive,
  };
}

export async function getPosCatalog(db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  const [categories, products] = await Promise.all([
    db.category.findMany({
      where: { businessId: tenant.business.id, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.product.findMany({
      where: {
        businessId: tenant.business.id,
        isActive: true,
        category: { isActive: true },
      },
      include: { category: true, modifierGroups: { orderBy: { sortOrder: "asc" }, include: { group: { include: { options: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } } } } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    categories: categories.map(toCategory),
    products: products.map((product) => ({ ...toProduct(product), modifierGroups: product.modifierGroups.filter((link) => link.group.isActive).map(({ group }) => ({ id: group.id, name: group.name, minSelect: group.minSelect, maxSelect: group.maxSelect, options: group.options.map(({ id, name, priceDeltaCents }) => ({ id, name, priceDeltaCents })) })) })),
  };
}

export async function getMenu(db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  const [categories, products] = await Promise.all([
    db.category.findMany({
      where: { businessId: tenant.business.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.product.findMany({
      where: { businessId: tenant.business.id },
      include: { category: true, modifierGroups: { include: { group: { include: { options: true } } } } },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    categories: categories.map(toCategory),
    products: products.map((product) => ({ ...toProduct(product), modifierGroups: product.modifierGroups.map(({ group }) => ({ id: group.id, name: group.name, minSelect: group.minSelect, maxSelect: group.maxSelect, options: group.options.map(({ id, name, priceDeltaCents }) => ({ id, name, priceDeltaCents })) })) })),
  };
}

export async function createCategory(
  input: { name: string; sortOrder: number; isActive: boolean },
  db: PrismaClient = prisma,
) {
  const tenant = await getTenant(db);
  try {
    const category = await db.category.create({
      data: {
        id: randomUUID(),
        businessId: tenant.business.id,
        name: input.name,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
    });
    return toCategory(category);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      throw new AppError("A category with that name already exists.", 409, "DUPLICATE_CATEGORY");
    }
    throw error;
  }
}

export async function updateCategory(
  id: string,
  input: { name: string; sortOrder: number; isActive: boolean },
  db: PrismaClient = prisma,
) {
  const tenant = await getTenant(db);
  const existing = await db.category.findFirst({ where: { id, businessId: tenant.business.id } });
  if (!existing) throw new AppError("Category not found.", 404, "CATEGORY_NOT_FOUND");
  try {
    const category = await db.category.update({
      where: { id },
      data: { name: input.name, sortOrder: input.sortOrder, isActive: input.isActive },
    });
    return toCategory(category);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      throw new AppError("A category with that name already exists.", 409, "DUPLICATE_CATEGORY");
    }
    throw error;
  }
}

async function assertCategory(db: PrismaClient, businessId: string, categoryId: string) {
  const category = await db.category.findFirst({ where: { id: categoryId, businessId } });
  if (!category) throw new AppError("Choose a valid category.", 400, "CATEGORY_NOT_FOUND");
  return category;
}

export async function createProduct(
  input: {
    name: string;
    description: string;
    categoryId: string;
    priceCents: number;
    isActive: boolean;
    image?: ProductImageChange;
  },
  db: PrismaClient = prisma,
) {
  const tenant = await getTenant(db);
  await assertCategory(db, tenant.business.id, input.categoryId);
  const uploaded = input.image && "bytes" in input.image ? await storeProductImage(input.image.bytes) : undefined;
  try {
  const product = await db.product.create({
    data: {
      id: randomUUID(),
      businessId: tenant.business.id,
      categoryId: input.categoryId,
      name: input.name,
      description: input.description,
      priceCents: input.priceCents,
      isActive: input.isActive,
      ...uploaded,
    },
    include: { category: true },
  });
  return toProduct(product);
  } catch (error) { if (uploaded) await removeStoredImages(Object.values(uploaded)); throw error; }
}

export async function updateProduct(
  id: string,
  input: {
    name: string;
    description: string;
    categoryId: string;
    priceCents: number;
    isActive: boolean;
    image?: ProductImageChange;
  },
  db: PrismaClient = prisma,
) {
  const tenant = await getTenant(db);
  const existing = await db.product.findFirst({ where: { id, businessId: tenant.business.id } });
  if (!existing) throw new AppError("Product not found.", 404, "PRODUCT_NOT_FOUND");
  await assertCategory(db, tenant.business.id, input.categoryId);
  const uploaded = input.image && "bytes" in input.image ? await storeProductImage(input.image.bytes) : undefined;
  let previousImages: Array<string | null> = [];
  let product;
  try {
  product = await db.$transaction(async (tx) => {
    const current = await tx.product.findUniqueOrThrow({ where: { id } });
    previousImages = [current.imagePath, current.imageThumbnailPath];
    const imageData: Partial<StoredProductImage> | { imagePath: null; imageThumbnailPath: null } = uploaded ?? (input.image && "remove" in input.image ? { imagePath: null, imageThumbnailPath: null } : {});
    const updated = await tx.product.update({
      where: { id },
      data: { name: input.name, description: input.description, categoryId: input.categoryId, priceCents: input.priceCents, isActive: input.isActive, ...imageData },
      include: { category: true },
    });
    await assertModifierPrices(tx, [id]);
    return updated;
  });
  } catch (error) { if (uploaded) await removeStoredImages(Object.values(uploaded)); throw error; }
  if (input.image) await cleanUnusedImages(previousImages, db);
  return toProduct(product);
}
