import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { DemoAccessConfig } from "@/lib/auth/demo-access";

/** Staff sign-in (tap name + PIN) sits on top of the demo gate and records who does what. */
export const STAFF_COOKIE = "salud_staff_session";
export const STAFF_SESSION_SECONDS = 12 * 60 * 60;
export type StaffIdentity = { id: string; name: string; role: string };
type Payload = StaffIdentity & { expires: number; nonce: string };

// Separate key from the demo-session signature, derived from the same secret.
const key = (config: DemoAccessConfig) => createHmac("sha256", config.signingSecret).update("staff-session-v1").digest();

export function issueStaffSession(staff: StaffIdentity, config: DemoAccessConfig, now = Date.now()) {
  const payload: Payload = { id: staff.id, name: staff.name, role: staff.role, expires: now + STAFF_SESSION_SECONDS * 1000, nonce: randomBytes(12).toString("hex") };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", key(config)).update(body).digest("base64url")}`;
}

export function verifyStaffSession(token: string | undefined, config: DemoAccessConfig, now = Date.now()): StaffIdentity | null {
  if (!token || token.length > 2048) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = createHmac("sha256", key(config)).update(body).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const value = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
    if (typeof value.id !== "string" || typeof value.name !== "string" || typeof value.role !== "string" || !Number.isSafeInteger(value.expires) || value.expires <= now || value.expires > now + STAFF_SESSION_SECONDS * 1000) return null;
    return { id: value.id, name: value.name, role: value.role };
  } catch { return null; }
}
