import { z } from "zod";
import { handle, readJson } from "@/lib/http";
import { getGuestChecks, updateGuestChecks } from "@/lib/services/guest-checks";
import { parseSchema } from "@/lib/validations/schemas";
import { currentActor } from "@/lib/auth/current-staff";

const version = z.number().int().nonnegative();
const id = z.string().min(1).max(100);
const cents = z.number().int().nonnegative().max(100_000_000);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("addGuest"), version, name: z.string().trim().max(80).optional() }),
  z.object({ action: z.literal("renameGuest"), version, guestId: id, name: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal("allocate"), version, itemId: id, allocations: z.array(z.object({ guestId: id, amountCents: cents.positive(), quantityUnits: z.number().int().positive().max(999).nullable() })).max(100) }),
  z.object({ action: z.literal("splitAll"), version }),
  z.object({ action: z.literal("configureSplit"), version, mode: z.enum(["equal", "custom"]), count: z.number().int().min(1).max(100), amounts: z.array(cents).max(100).optional() }),
  z.object({ action: z.literal("payRemaining"), version, amountCents: cents.positive(), tenderedCents: cents, tipCents: cents.optional(), method: z.enum(["CASH", "CARD"]).optional(), idempotencyKey: z.string().min(8).max(100) }),
  z.object({ action: z.literal("pay"), version, guestId: id, amountCents: cents.positive(), tenderedCents: cents, tipCents: cents.optional(), method: z.enum(["CASH", "CARD"]).optional(), idempotencyKey: z.string().min(8).max(120) }),
  z.object({ action: z.literal("close"), version }),
]);
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  return handle(() => getGuestChecks(id));
}
export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return handle(async () => updateGuestChecks(id, parseSchema(schema, await readJson(request)), undefined, await currentActor()));
}
