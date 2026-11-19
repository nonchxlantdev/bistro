import { handle, readJson } from "@/lib/http";
import { listModifierGroups, saveModifierGroup } from "@/lib/services/modifiers";
import { modifierSchema, parseSchema } from "@/lib/validations/schemas";
export const GET = () => handle(() => listModifierGroups());
export const POST = (request: Request) => handle(async () => saveModifierGroup(null, parseSchema(modifierSchema, await readJson(request))));
