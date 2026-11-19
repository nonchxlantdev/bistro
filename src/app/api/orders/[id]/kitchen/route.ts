import { z } from "zod";
import { handle, readJson } from "@/lib/http";
import { sendKitchenTicket } from "@/lib/services/kitchen";
import { parseSchema } from "@/lib/validations/schemas";
const schema = z.object({ version: z.number().int().nonnegative(), idempotencyKey: z.string().min(8).max(120) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handle(async () => { const input = parseSchema(schema, await readJson(request)); return sendKitchenTicket(id, input.version, input.idempotencyKey); });
}
