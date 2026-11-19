import { execSync } from "node:child_process";
import fs from "node:fs";

const files = ["prisma/test.db", "prisma/test.db-journal", "prisma/test.db-wal", "prisma/test.db-shm"];

export default function setup() {
  for (const file of files) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  // Prisma's SQLite migration engine expects the database file to exist on Windows.
  fs.closeSync(fs.openSync(files[0], "w"));
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: "file:./prisma/test.db" },
  });
}
