import fs from "node:fs";
import { createClient } from "@libsql/client";
import { applyMigrations } from "../scripts/db-migrate";

const files = ["prisma/test.db", "prisma/test.db-journal", "prisma/test.db-wal", "prisma/test.db-shm"];

export default async function setup() {
  for (const file of files) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  // Same migration runner as deploys, always against the isolated local test file.
  const client = createClient({ url: "file:./prisma/test.db" });
  try { await applyMigrations(client); } finally { client.close(); }
}
