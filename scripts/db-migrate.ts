import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { databaseConfig } from "../src/lib/db/connection";

/**
 * Applies prisma/migrations/*\/migration.sql in order, recording each one in Prisma's own
 * `_prisma_migrations` table (same checksum format), so it works on local SQLite files and on
 * Turso alike and stays compatible with `prisma migrate deploy`. Already-applied migrations are
 * skipped, so it is safe to run on every deploy.
 */
export async function applyMigrations(client: Client, directory = path.resolve("prisma/migrations")) {
  await client.execute(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "checksum" TEXT NOT NULL,
    "finished_at" DATETIME,
    "migration_name" TEXT NOT NULL,
    "logs" TEXT,
    "rolled_back_at" DATETIME,
    "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
  )`);
  const done = await client.execute(`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`);
  const applied = new Set(done.rows.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => String(row.migration_name)));
  const failed = done.rows.find((row) => !row.finished_at && !row.rolled_back_at);
  if (failed) throw new Error(`Migration ${failed.migration_name} previously failed. Fix the database, then remove its row from _prisma_migrations.`);
  const names = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^\d/.test(entry.name)).map((entry) => entry.name).sort();
  const ran: string[] = [];
  for (const name of names) {
    if (applied.has(name)) continue;
    const sql = await readFile(path.join(directory, name, "migration.sql"), "utf8");
    const id = randomUUID();
    await client.execute({ sql: `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, applied_steps_count) VALUES (?, ?, ?, ?, 0)`, args: [id, createHash("sha256").update(sql).digest("hex"), name, new Date().toISOString()] });
    try {
      await client.executeMultiple(sql);
    } catch (error) {
      await client.execute({ sql: `UPDATE "_prisma_migrations" SET logs = ? WHERE id = ?`, args: [error instanceof Error ? error.message : String(error), id] });
      throw new Error(`Migration ${name} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await client.execute({ sql: `UPDATE "_prisma_migrations" SET finished_at = ?, applied_steps_count = 1 WHERE id = ?`, args: [new Date().toISOString(), id] });
    ran.push(name);
  }
  return ran;
}

export function createMigrationClient() {
  const { url, authToken } = databaseConfig();
  return createClient({ url, authToken });
}

async function main() {
  const client = createMigrationClient();
  try {
    const ran = await applyMigrations(client);
    console.log(ran.length ? `Applied ${ran.length} migration(s): ${ran.join(", ")}` : "Database schema is up to date.");
  } finally { client.close(); }
}

if (/scripts[\\/]db-migrate\.ts$/.test(process.argv[1] ?? "")) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
