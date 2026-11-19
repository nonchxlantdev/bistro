import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDemoConfig, demoConfigPath } from "../src/lib/auth/demo-access";

async function main() {
  const password = process.env.SORA_DEMO_PASSWORD;
  if (!password) throw new Error("Set SORA_DEMO_PASSWORD for this command, then run npm run demo:access. The password is stored only as a salted hash.");
  const config = await createDemoConfig(password);
  delete process.env.SORA_DEMO_PASSWORD;
  if (process.argv.includes("--env")) {
    // For hosted deployments: paste these three lines into the host's environment variables.
    console.log(`SORA_DEMO_PASSWORD_SALT=${config.salt}\nSORA_DEMO_PASSWORD_HASH=${config.passwordHash}\nSORA_DEMO_SESSION_SECRET=${config.signingSecret}`);
    return;
  }
  const target = demoConfigPath();
  await mkdir(path.dirname(target), { recursive: true });
  // Explicit setup also rotates the session secret, invalidating existing sessions.
  await writeFile(target, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  console.log("Demo access configured. Existing sessions must sign in again.");
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Could not configure demo access."); process.exitCode = 1; });
