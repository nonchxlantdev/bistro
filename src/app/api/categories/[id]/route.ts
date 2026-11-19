import { handle, readJson } from "@/lib/http";
import { updateCategory } from "@/lib/services/catalog";
import { categorySchema, parseSchema } from "@/lib/validations/schemas";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  return handle(async () => {
    const input = parseSchema(categorySchema, await readJson(request));
    return updateCategory(id, input);
  });
}
