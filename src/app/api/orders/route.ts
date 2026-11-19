import { handle, readJson } from "@/lib/http";
import { listOrders, saveOrder } from "@/lib/services/orders";
import { parseSchema, saveOrderSchema } from "@/lib/validations/schemas";

export const GET = (request: Request) =>
  handle(() => {
    const url = new URL(request.url);
    return listOrders({
      status: url.searchParams.get("status") ?? undefined,
      query: url.searchParams.get("q") ?? undefined,
    });
  });

export const POST = (request: Request) =>
  handle(async () => {
    const input = parseSchema(saveOrderSchema, await readJson(request));
    return saveOrder(input);
  });
