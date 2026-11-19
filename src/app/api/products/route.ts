import { handle } from "@/lib/http";
import { createProduct } from "@/lib/services/catalog";
import { readProductRequest } from "@/lib/product-request";

export const runtime = "nodejs";

export const POST = (request: Request) =>
  handle(async () => {
    const input = await readProductRequest(request);
    return createProduct(input);
  });
