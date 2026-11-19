import { createHmac, randomBytes, scrypt as deriveKey, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { DEMO_POLICY_VERSION } from "@/lib/demo-policy";

const scrypt = promisify(deriveKey);
export const SESSION_SECONDS = 12 * 60 * 60;
export type DemoStage = "disclaimer" | "accepted";
export type DemoAccessConfig = { version: 1; salt: string; passwordHash: string; signingSecret: string };
type Session = { stage: DemoStage; expires: number; policy: string; nonce: string };

export function demoConfigPath() {
  return path.resolve(process.env.SORA_DATA_DIR || "./data", "demo-access.json");
}

export async function loadDemoConfig(): Promise<DemoAccessConfig> {
  const config: DemoAccessConfig = JSON.parse(await readFile(demoConfigPath(), "utf8"));
  if (config.version !== 1 || !/^[a-f0-9]{32}$/.test(config.salt) || !/^[a-f0-9]{128}$/.test(config.passwordHash) || !/^[a-f0-9]{64}$/.test(config.signingSecret)) throw new Error("Invalid demo access configuration.");
  return config;
}

export async function createDemoConfig(password: string): Promise<DemoAccessConfig> {
  if (password.length < 8 || password.length > 256) throw new Error("Use a demo password between 8 and 256 characters.");
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64) as Buffer;
  return { version: 1, salt, passwordHash: hash.toString("hex"), signingSecret: randomBytes(32).toString("hex") };
}

export async function verifyDemoPassword(password: unknown, config: DemoAccessConfig) {
  if (typeof password !== "string" || password.length > 256 || !password.length) return false;
  const actual = await scrypt(password, config.salt, 64) as Buffer;
  return timingSafeEqual(actual, Buffer.from(config.passwordHash, "hex"));
}

export function issueDemoSession(stage: DemoStage, config: DemoAccessConfig, now = Date.now()) {
  const session: Session = { stage, expires: now + SESSION_SECONDS * 1000, policy: DEMO_POLICY_VERSION, nonce: randomBytes(16).toString("hex") };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${createHmac("sha256", config.signingSecret).update(payload).digest("base64url")}`;
}

export function verifyDemoSession(token: string | undefined, config: DemoAccessConfig, now = Date.now()): Session | null {
  if (!token || token.length > 1024) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = createHmac("sha256", config.signingSecret).update(parts[0]).digest("base64url");
  if (parts[1].length !== expected.length || !timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Session;
    if (!["disclaimer", "accepted"].includes(session.stage) || session.policy !== DEMO_POLICY_VERSION || !Number.isSafeInteger(session.expires) || session.expires <= now || session.expires > now + SESSION_SECONDS * 1000 || typeof session.nonce !== "string") return null;
    return session;
  } catch { return null; }
}
