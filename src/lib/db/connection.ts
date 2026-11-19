import { PrismaLibSql } from "@prisma/adapter-libsql";

/**
 * One database setting for every entry point (app, seed, scripts, tests).
 * - Vercel / Turso: TURSO_DATABASE_URL (libsql://…) + TURSO_AUTH_TOKEN.
 * - Local: DATABASE_URL, defaulting to the SQLite file prisma/dev.db.
 * Empty values are ignored so a blank TURSO_DATABASE_URL never shadows the local file.
 */
export function databaseConfig() {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || "file:./prisma/dev.db";
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
  return { url, authToken, remote: !url.startsWith("file:") };
}

export function createDatabaseAdapter() {
  const { url, authToken } = databaseConfig();
  return new PrismaLibSql({ url, authToken });
}
