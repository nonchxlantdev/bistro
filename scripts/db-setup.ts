import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { createDatabaseAdapter, databaseConfig } from "../src/lib/db/connection";
import { applyMigrations, createMigrationClient } from "./db-migrate";
import { seed } from "../prisma/seed";
import { populateDemoService } from "../prisma/demo-service";

/**
 * Deploy-time database setup (runs before `next build` on Vercel):
 * 1. apply any new migrations, 2. seed Salud Bistro only if the database is empty,
 * 3. add the demo service checks once. Re-running never resets data people have entered.
 */
async function main() {
  const { remote } = databaseConfig();
  if (process.env.VERCEL && !remote) throw new Error("TURSO_DATABASE_URL is not set. Add the Turso integration (or the variable) to this Vercel project, then redeploy.");
  const client = createMigrationClient();
  try {
    const ran = await applyMigrations(client);
    console.log(ran.length ? `Applied ${ran.length} migration(s).` : "Schema up to date.");
  } finally { client.close(); }

  const db = new PrismaClient({ adapter: createDatabaseAdapter() });
  try {
    if (!await db.business.count()) { await seed(db); console.log("Seeded Salud Bistro menu, tables and settings."); }
    else console.log("Existing restaurant data found; seed skipped.");
    if (process.env.SORA_SKIP_DEMO_SERVICE === "1") return;
    const result = await populateDemoService(db);
    console.log(result.alreadyPresent ? "Demo service checks already present." : `Added ${result.orders.length} demo service checks.`);
  } finally { await db.$disconnect(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
