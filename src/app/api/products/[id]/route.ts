import { handle } from "@/lib/http";
import { updateProduct } from "@/lib/services/catalog";
import { readProductRequest } from "@/lib/product-request";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  return handle(async () => {
    const input = await readProductRequest(request);
    return updateProduct(id, input);
  });
}
