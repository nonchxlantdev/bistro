import { handle, readJson } from "@/lib/http";
import { getSettings, updateSettings } from "@/lib/services/settings";
import { parseSchema, settingsSchema } from "@/lib/validations/schemas";

export const GET = () => handle(() => getSettings());

export const PUT = (request: Request) =>
  handle(async () => {
    const input = parseSchema(settingsSchema, await readJson(request));
    return updateSettings(input);
  });
