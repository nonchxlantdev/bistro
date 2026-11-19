import { handle, readJson } from "@/lib/http";
import { cancelOrder } from "@/lib/services/orders";
import { cancelOrderSchema, parseSchema } from "@/lib/validations/schemas";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return handle(async () => {
    const input = parseSchema(cancelOrderSchema, await readJson(request));
    return cancelOrder(id, input.version);
  });
}
