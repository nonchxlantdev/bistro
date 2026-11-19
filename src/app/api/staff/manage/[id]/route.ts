import { requireStaff } from "@/lib/auth/current-staff";
import { handle, readJson } from "@/lib/http";
import { updateStaff } from "@/lib/services/staff";

type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  return handle(async () => { await requireStaff({ manager: true }); return updateStaff(id, await readJson(request)); });
}
