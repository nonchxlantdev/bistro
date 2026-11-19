import { handle } from "@/lib/http";
import { getOrder } from "@/lib/services/orders";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  return handle(() => getOrder(id));
}
