import { handle, readJson } from "@/lib/http";
import { saveModifierGroup } from "@/lib/services/modifiers";
import { modifierSchema, parseSchema } from "@/lib/validations/schemas";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handle(async () => saveModifierGroup(id, parseSchema(modifierSchema, await readJson(request))));
}
