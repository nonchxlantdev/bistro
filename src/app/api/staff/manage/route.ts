import { requireStaff } from "@/lib/auth/current-staff";
import { handle, readJson } from "@/lib/http";
import { createStaff, listStaff } from "@/lib/services/staff";

export const GET = () => handle(async () => { await requireStaff(); return listStaff({ includeInactive: true }); });
export const POST = (request: Request) => handle(async () => { await requireStaff({ manager: true }); return createStaff(await readJson(request)); });
