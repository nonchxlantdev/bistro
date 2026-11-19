import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEMO_PREFIX, populateDemoService } from "./demo-service";

async function main() {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  if (!url.startsWith("file:")) throw new Error("Demo population expects a local SQLite database.");
  const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
  try {
    if (!await db.order.count({ where: { id: { startsWith: DEMO_PREFIX + "_order_" } } })) {
      await mkdir("backups", { recursive: true });
      const target = path.resolve("backups", `pre-demo-service-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
      const source = new Database(path.resolve(url.slice(5)), { readonly: true, fileMustExist: true });
      try { await source.backup(target); } finally { source.close(); }
      console.log(`Backup: ${target}`);
    }
    const result = await populateDemoService(db);
    const root = path.resolve(process.env.SORA_DATA_DIR ?? "data");
    await mkdir(root, { recursive: true });
    const guide = path.join(root, "demo-service-v1.json");
    await writeFile(guide, JSON.stringify(result, null, 2));
    console.log(result.alreadyPresent ? "Demo service already exists; no checks were reset or duplicated." : "Salud Bistro demo service added. Existing records retained.");
    console.table(result.orders.map(({ orderNumber, table, scenario, status, kitchen }) => ({ orderNumber, table, scenario, status, kitchen })));
    console.log(`Scenario guide: ${guide}`);
  } finally { await db.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
