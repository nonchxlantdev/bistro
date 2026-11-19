import { z } from "zod";
import { AppError } from "@/lib/errors";

export const orderTypeSchema = z.enum(["DINE_IN", "TAKEAWAY"]);
export const orderStatusSchema = z.enum(["OPEN", "COMPLETED", "CANCELLED"]);

export const saveOrderSchema = z.object({
  orderId: z.string().min(1).optional(),
  version: z.number().int().nonnegative().optional(),
  orderType: orderTypeSchema,
  tableId: z.string().min(1).nullable().optional(),
  discountCents: z.number().int().nonnegative().default(0),
  supportsCustomizations: z.boolean().optional(),
  additionsOnly: z.boolean().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive().max(999),
        itemId: z.string().min(1).optional(),
        modifierOptionIds: z.array(z.string().min(1)).max(50).optional(),
        instructions: z.string().trim().max(300).optional(),
      }),
    )
    .min(1, "Add at least one product before saving.")
    .max(200),
});

export const checkoutSchema = z.object({
  tenderedCents: z.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(8).max(120),
  version: z.number().int().nonnegative().optional(),
});

export const cancelOrderSchema = z.object({
  version: z.number().int().nonnegative(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Enter a category name.").max(40),
  sortOrder: z.number().int().min(0).max(9999),
  isActive: z.boolean(),
});

export const productSchema = z.object({
  name: z.string().trim().min(1, "Enter a product name.").max(80),
  description: z.string().trim().max(300).default(""),
  categoryId: z.string().min(1, "Choose a category."),
  priceCents: z.number().int().nonnegative().max(1_000_000),
  isActive: z.boolean(),
});

export const settingsSchema = z.object({
  businessName: z.string().trim().min(1, "Enter a business name.").max(80),
  locationName: z.string().trim().min(1, "Enter a location name.").max(80),
  currency: z
    .string()
    .trim()
    .min(3)
    .max(8)
    .regex(/^[A-Za-z]+$/, "Use a currency code such as BZD."),
  receiptFooter: z.string().trim().max(240),
});

export const reservationSchema = z.object({
  isReserved: z.boolean(),
});

export const modifierSchema = z.object({
  revision: z.string().length(64).optional(),
  name: z.string().trim().min(1, "Enter a group name.").max(80),
  minSelect: z.number().int().min(0).max(50),
  maxSelect: z.number().int().min(1).max(50),
  isActive: z.boolean(),
  productIds: z.array(z.string().min(1)).max(500),
  options: z.array(z.object({ id: z.string().min(1).optional(), name: z.string().trim().min(1, "Enter an option name.").max(80), priceDeltaCents: z.number().int().min(-1_000_000).max(1_000_000), isActive: z.boolean() })).max(50),
});

export function parseSchema<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Check the form and try again.";
    throw new AppError(message, 400, "VALIDATION");
  }
  return result.data;
}
