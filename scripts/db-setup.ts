import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { createDatabaseAdapter, databaseConfig } from "../src/lib/db/connection";
import { applyMigrations, createMigrationClient } from "./db-migrate";
import { seed, seedStaff } from "../prisma/seed";
import { populateDemoService } from "../prisma/demo-service";
import { DEMO_ARTWORK_PRODUCTS, demoArtwork } from "../prisma/demo-artwork";
import { productImageExists, restoreProductImage } from "../src/lib/services/product-images";

/**
 * Deploy-time database setup (runs before `next build` on Vercel):
 * 1. apply any new migrations, 2. seed Salud Bistro only if the database is empty,
 * 3. add the demo service checks once. Re-running never resets data people have entered.
 */
async function main() {
  const { remote } = databaseConfig();
  if (process.env.VERCEL && !remote) throw new Error("TURSO_DATABASE_URL is not set. Add the Turso integration (or the variable) to this Vercel project, then redeploy.");
  if (process.env.VERCEL && !process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) throw new Error("No Vercel Blob store is connected. Connect a PRIVATE Blob store to this project (Storage → Blob), then redeploy.");
  const client = createMigrationClient();
  try {
    const ran = await applyMigrations(client);
    console.log(ran.length ? `Applied ${ran.length} migration(s).` : "Schema up to date.");
  } finally { client.close(); }

  const db = new PrismaClient({ adapter: createDatabaseAdapter() });
  try {
    if (!await db.business.count()) { await seed(db); console.log("Seeded Salud Bistro menu, tables and settings."); }
    else console.log("Existing restaurant data found; seed skipped.");
    const business = await db.business.findFirst({ select: { id: true } });
    if (business && await seedStaff(db, business.id)) console.log("Added the demo team (Maria, Daniel, Ana, Luis).");
    if (process.env.SORA_SKIP_DEMO_SERVICE !== "1") {
      const result = await populateDemoService(db);
      console.log(result.alreadyPresent ? "Demo service checks already present." : `Added ${result.orders.length} demo service checks.`);
    }
    // Non-fatal: the image route also restores demo illustrations on first view.
    await repairProductImages(db).catch((error) => console.warn(`Photo check skipped: ${error instanceof Error ? error.message : error}`));
  } finally { await db.$disconnect(); }
}

/**
 * Fixes products whose stored photo no longer exists (for example, photos saved before the Blob
 * store was connected): demo illustrations are regenerated; other missing photos are cleared so
 * the menu shows a clean card instead of a broken image.
 */
async function repairProductImages(db: PrismaClient) {
  const products = await db.product.findMany({ where: { imagePath: { not: null } }, select: { id: true, name: true, imagePath: true, imageThumbnailPath: true } });
  let restored = 0, cleared = 0;
  for (const product of products) {
    if (await productImageExists(product.imagePath) && (!product.imageThumbnailPath || await productImageExists(product.imageThumbnailPath))) continue;
    const kind = DEMO_ARTWORK_PRODUCTS[product.id];
    if (kind) { await restoreProductImage(product, await demoArtwork(kind)); restored++; }
    else { await db.product.update({ where: { id: product.id }, data: { imagePath: null, imageThumbnailPath: null } }); cleared++; console.warn(`Photo missing for "${product.name}"; cleared it. Re-upload it in Menu.`); }
  }
  console.log(restored || cleared ? `Product photos: ${restored} demo illustration(s) restored, ${cleared} missing photo(s) cleared.` : "Product photos OK.");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
