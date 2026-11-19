import { randomBytes, scrypt as deriveKey, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { prisma, type PrismaClient } from "@/lib/db/prisma";
import { AppError, isUniqueConstraint } from "@/lib/errors";
import { getTenant } from "@/lib/services/tenant";

const scrypt = promisify(deriveKey);
export const STAFF_ROLES = ["SERVER", "MANAGER"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export function validPin(pin: unknown): pin is string { return typeof pin === "string" && /^\d{4}$/.test(pin); }
export async function hashPin(pin: string, salt = randomBytes(16).toString("hex")) {
  return { pinSalt: salt, pinHash: (await scrypt(pin, salt, 32) as Buffer).toString("hex") };
}
function cleanName(name: unknown) {
  const value = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (!value || value.length > 40) throw new AppError("Enter a name up to 40 characters.", 400, "INVALID_NAME");
  return value;
}
function cleanRole(role: unknown): StaffRole { return role === "MANAGER" ? "MANAGER" : "SERVER"; }

/** Names for the sign-in screen; no PIN data ever leaves the server. */
export async function listStaff(options: { includeInactive?: boolean } = {}, db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  const staff = await db.staff.findMany({ where: { businessId: tenant.business.id, ...(options.includeInactive ? {} : { active: true }) }, orderBy: [{ active: "desc" }, { name: "asc" }], select: { id: true, name: true, role: true, active: true } });
  return staff;
}

export async function createStaff(input: { name: unknown; role?: unknown; pin: unknown }, db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  if (!validPin(input.pin)) throw new AppError("PIN must be exactly 4 digits.", 400, "INVALID_PIN");
  try {
    return await db.staff.create({ data: { businessId: tenant.business.id, name: cleanName(input.name), role: cleanRole(input.role), ...await hashPin(input.pin) }, select: { id: true, name: true, role: true, active: true } });
  } catch (error) { if (isUniqueConstraint(error)) throw new AppError("Someone already has that name.", 409, "DUPLICATE_STAFF"); throw error; }
}

export async function updateStaff(id: string, input: { name?: unknown; role?: unknown; pin?: unknown; active?: unknown }, db: PrismaClient = prisma) {
  const tenant = await getTenant(db);
  const existing = await db.staff.findFirst({ where: { id, businessId: tenant.business.id } });
  if (!existing) throw new AppError("Staff member not found.", 404, "STAFF_NOT_FOUND");
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = cleanName(input.name);
  if (input.role !== undefined) data.role = cleanRole(input.role);
  if (input.active !== undefined) data.active = Boolean(input.active);
  if (input.pin !== undefined && input.pin !== "") { if (!validPin(input.pin)) throw new AppError("PIN must be exactly 4 digits.", 400, "INVALID_PIN"); Object.assign(data, await hashPin(input.pin)); }
  if (data.active === false && existing.role === "MANAGER" && (await db.staff.count({ where: { businessId: tenant.business.id, role: "MANAGER", active: true } })) <= 1) throw new AppError("Keep at least one active manager.", 409, "LAST_MANAGER");
  try { return await db.staff.update({ where: { id }, data, select: { id: true, name: true, role: true, active: true } }); }
  catch (error) { if (isUniqueConstraint(error)) throw new AppError("Someone already has that name.", 409, "DUPLICATE_STAFF"); throw error; }
}

// Per-person PIN throttle (in-process, like the demo password throttle).
const failures = new Map<string, { count: number; since: number }>();
export async function verifyStaffPin(id: unknown, pin: unknown, db: PrismaClient = prisma) {
  if (typeof id !== "string" || !validPin(pin)) throw new AppError("Enter your 4-digit PIN.", 400, "INVALID_PIN");
  const entry = failures.get(id);
  if (entry && Date.now() - entry.since < 5 * 60 * 1000 && entry.count >= 5) throw new AppError("Too many tries. Wait a few minutes or ask a manager.", 429, "PIN_LOCKED");
  const tenant = await getTenant(db);
  const staff = await db.staff.findFirst({ where: { id, businessId: tenant.business.id, active: true } });
  const actual = staff ? Buffer.from((await hashPin(pin, staff.pinSalt)).pinHash, "hex") : Buffer.alloc(32);
  const ok = Boolean(staff) && timingSafeEqual(actual, Buffer.from(staff!.pinHash, "hex"));
  if (!ok || !staff) {
    const next = !entry || Date.now() - entry.since >= 5 * 60 * 1000 ? { count: 1, since: Date.now() } : { count: entry.count + 1, since: entry.since };
    failures.set(id, next);
    throw new AppError("That PIN didn't match. Try again.", 401, "WRONG_PIN");
  }
  failures.delete(id);
  return { id: staff.id, name: staff.name, role: staff.role };
}

/** id → name for reports and receipts (includes deactivated staff). */
export async function staffNames(ids: Array<string | null | undefined>, db: PrismaClient = prisma) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map<string, string>();
  const rows = await db.staff.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(rows.map((row) => [row.id, row.name]));
}
