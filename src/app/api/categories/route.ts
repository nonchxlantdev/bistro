import { handle, readJson } from "@/lib/http";
import { createCategory, getMenu } from "@/lib/services/catalog";
import { categorySchema, parseSchema } from "@/lib/validations/schemas";

export const GET = () => handle(() => getMenu());

export const POST = (request: Request) =>
  handle(async () => {
    const input = parseSchema(categorySchema, await readJson(request));
    return createCategory(input);
  });
