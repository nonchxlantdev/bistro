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
      SORA_DATA_DIR: "./data/test",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
