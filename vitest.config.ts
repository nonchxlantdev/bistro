import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    env: {
      DATABASE_URL: "file:./prisma/test.db",
      // Never let a hosted database or blob store leak into tests.
      TURSO_DATABASE_URL: "",
      TURSO_AUTH_TOKEN: "",
      BLOB_READ_WRITE_TOKEN: "",
      BLOB_STORE_ID: "",
      SORA_DEMO_PASSWORD_SALT: "",
      SORA_DEMO_PASSWORD_HASH: "",
      SORA_DEMO_SESSION_SECRET: "",
      SORA_DATA_DIR: "./data/test",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
