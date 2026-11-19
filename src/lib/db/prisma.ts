import { PrismaClient } from "@/generated/prisma/client";
import { createDatabaseAdapter } from "@/lib/db/connection";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  return new PrismaClient({ adapter: createDatabaseAdapter() });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export type { PrismaClient };
