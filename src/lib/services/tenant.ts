import { prisma, type PrismaClient } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";

export async function getTenant(db: PrismaClient = prisma) {
  const business = await db.business.findFirst({
    orderBy: { createdAt: "asc" },
    include: {
      settings: true,
      locations: { orderBy: { createdAt: "asc" }, take: 1 },
    },
  });

  const location = business?.locations[0];
  if (!business || !location || !business.settings) {
    throw new AppError(
      "Salud Bistro demo data is not set up yet. Run npm run seed, then refresh.",
      500,
      "NOT_SEEDED",
    );
  }

  return { business, location, settings: business.settings };
}
