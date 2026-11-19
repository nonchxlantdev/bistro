import { z } from "zod";
import { handle, readJson } from "@/lib/http";
import { setKitchenStatus } from "@/lib/services/kitchen";
import { parseSchema } from "@/lib/validations/schemas";
const status = z.enum(["NEW", "PREPARING", "READY", "SERVED"]);
const schema = z.object({ from: status, to: status });
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handle(async () => { const input = parseSchema(schema, await readJson(request)); await setKitchenStatus(id, input.from, input.to); return { ok: true }; });
}
