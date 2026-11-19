import { handle, readJson } from "@/lib/http";
import { getTable, setTableReserved } from "@/lib/services/tables";
import { parseSchema, reservationSchema } from "@/lib/validations/schemas";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  return handle(() => getTable(id));
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  return handle(async () => {
    const input = parseSchema(reservationSchema, await readJson(request));
    return setTableReserved(id, input.isReserved);
  });
}
