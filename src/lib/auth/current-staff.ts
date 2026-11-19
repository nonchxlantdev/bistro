import { cookies } from "next/headers";
import { loadDemoConfig } from "@/lib/auth/demo-access";
import { STAFF_COOKIE, verifyStaffSession, type StaffIdentity } from "@/lib/auth/staff-session";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/lib/services/guest-checks";

/** Signed-in staff member for this request (route handlers only). */
export async function currentStaff(): Promise<StaffIdentity | null> {
  try { return verifyStaffSession((await cookies()).get(STAFF_COOKIE)?.value, await loadDemoConfig()); }
  catch { return null; }
}
export async function currentActor(): Promise<Actor> {
  return { staffId: (await currentStaff())?.id ?? null };
}
export async function requireStaff(options: { manager?: boolean } = {}) {
  const staff = await currentStaff();
  if (!staff) throw new AppError("Sign in with your name and PIN to continue.", 401, "STAFF_REQUIRED");
  if (options.manager && staff.role !== "MANAGER") throw new AppError("Only a manager can do that.", 403, "MANAGER_REQUIRED");
  return staff;
}
