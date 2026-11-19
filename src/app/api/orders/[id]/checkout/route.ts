import { handle, readJson } from "@/lib/http";
import { checkoutOrder } from "@/lib/services/orders";
import { checkoutSchema, parseSchema } from "@/lib/validations/schemas";
import { currentActor } from "@/lib/auth/current-staff";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return handle(async () => {
    const input = parseSchema(checkoutSchema, await readJson(request));
    return checkoutOrder(id, input, undefined, await currentActor());
  });
}
