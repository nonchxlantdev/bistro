import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { seed } from "../prisma/seed";
import { DEMO_PREFIX, populateDemoService } from "../prisma/demo-service";
import { saveOrder, getOrder } from "../src/lib/services/orders";
import { getGuestChecks, updateGuestChecks } from "../src/lib/services/guest-checks";
import { listKitchenTickets, setKitchenStatus, sendKitchenTicket } from "../src/lib/services/kitchen";
import { getPosCatalog, getMenu } from "../src/lib/services/catalog";
import { listTables } from "../src/lib/services/tables";
import { removeStoredImages, productImageDirectory } from "../src/lib/services/product-images";

describe("additive operational demo population", () => {
  let directory: string;
  let db: PrismaClient;
  const previousRoot = process.env.SORA_DATA_DIR;
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "salud-demo-"));
    process.env.SORA_DATA_DIR = path.join(directory, "media");
    const filename = path.join(directory, "demo.db");
    const sqlite = new Database(filename);
    for (const folder of (await readdir("prisma/migrations")).filter((name) => /^\d/.test(name)).sort()) sqlite.exec(await readFile(path.join("prisma/migrations", folder, "migration.sql"), "utf8"));
    sqlite.close();
    db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "file:" + filename }) });
    await seed(db);
  }, 30_000);
  afterAll(async () => {
    if (db) {
      const products = await db.product.findMany({ where: { id: { startsWith: DEMO_PREFIX } } });
      await removeStoredImages(products.flatMap((product) => [product.imagePath, product.imageThumbnailPath]));
      await db.$disconnect();
    }
    if (directory) {
      for (const suffix of ["", "-wal", "-shm", "-journal"]) await unlink(path.join(directory, "demo.db" + suffix)).catch(() => {});
      await rmdir(path.join(directory, "media", "product-images")).catch(() => {});
      await rmdir(path.join(directory, "media")).catch(() => {});
      await rmdir(directory).catch(() => {});
    }
    if (previousRoot === undefined) delete process.env.SORA_DATA_DIR; else process.env.SORA_DATA_DIR = previousRoot;
  });

  it("creates usable scenarios without overwriting old records, then keeps user progress on rerun", async () => {
    const original = await saveOrder({ orderType: "DINE_IN", tableId: "tbl_01", discountCents: 0, items: [{ productId: "prod_water", quantity: 1 }] }, db);
    const originalProduct = await db.product.findUniqueOrThrow({ where: { id: "prod_cappuccino" } });
    await db.restaurantTable.update({ where: { id: "tbl_02" }, data: { isReserved: true } });
    const reserved = await db.restaurantTable.findUniqueOrThrow({ where: { id: "tbl_02" } });
    const result = await populateDemoService(db, new Date("2026-11-18T14:00:00"));
    expect(result.alreadyPresent).toBe(false);
    expect(result.orders).toHaveLength(13);
    expect(await getOrder(original.id, db)).toEqual(original);
    expect(await db.product.findUniqueOrThrow({ where: { id: originalProduct.id } })).toEqual(originalProduct);
    expect(await db.restaurantTable.findUniqueOrThrow({ where: { id: reserved.id } })).toEqual(reserved);
    expect(result.orders.every((order) => order.table !== "Table 1" && order.table !== "Table 2")).toBe(true);
    expect((await listTables(db)).some((table) => table.status === "AVAILABLE")).toBe(true);
    expect((await listKitchenTickets(db)).map((ticket) => ticket.status)).toEqual(expect.arrayContaining(["NEW", "PREPARING", "READY", "SERVED"]));

    const partial = await getGuestChecks(`${DEMO_PREFIX}_order_partial`, db);
    expect(partial.complete).toBe(true);
    expect(partial.guests[0]).toMatchObject({ balanceCents: 0 });
    expect(partial.guests[1].paidCents).toBeGreaterThan(0);
    expect(partial.guests[1].balanceCents).toBeGreaterThan(0);
    expect(partial.guests[2].paidCents).toBe(0);
    expect(partial.guests.reduce((sum, guest) => sum + guest.totalCents, 0)).toBe(partial.totalCents);
    const custom = await getGuestChecks(`${DEMO_PREFIX}_order_custom`, db);
    expect(custom.complete).toBe(false);
    const settled = await updateGuestChecks(custom.id, { action: "payRemaining", version: custom.version, amountCents: custom.totalCents, tenderedCents: custom.totalCents, idempotencyKey: "demo-one-payer-test" }, db);
    expect(settled.guests.every((guest) => guest.balanceCents === 0)).toBe(true);
    const readyToClose = await getGuestChecks(`${DEMO_PREFIX}_order_close`, db);
    expect((await updateGuestChecks(readyToClose.id, { action: "close", version: readyToClose.version }, db)).status).toBe("COMPLETED");

    const addon = await getOrder(`${DEMO_PREFIX}_order_addons`, db);
    expect(addon.kitchenServed).toBe(true);
    const addonTicket = (await listKitchenTickets(db)).find((ticket) => ticket.id === `${addon.id}_ticket_2`)!;
    expect(addonTicket.linkedTicketId).toBe(`${addon.id}_ticket_1`);
    expect(addonTicket.changes.map((line) => line.name)).toEqual(["Brownie", "Cappuccino"]);
    const extended = await saveOrder({ orderId: addon.id, version: addon.version, orderType: "DINE_IN", tableId: addon.tableId, discountCents: 0, additionsOnly: true, supportsCustomizations: true, items: [...addon.items.map((item) => ({ itemId: item.id, productId: item.productId!, quantity: item.quantity, modifierOptionIds: item.modifiers.map((modifier) => modifier.optionId!), instructions: item.instructions })), { productId: "prod_cookie", quantity: 1 }] }, db);
    expect((await sendKitchenTicket(addon.id, extended.version, "demo-next-addon-test", db)).created).toBe(true);
    const newTicket = `${DEMO_PREFIX}_order_new_ticket_1`;
    await setKitchenStatus(newTicket, "NEW", "PREPARING", db);
    const menu = await getMenu(db);
    expect(menu.products.find((product) => product.id === `${DEMO_PREFIX}_seasonal`)?.isActive).toBe(false);
    expect((await getPosCatalog(db)).products.some((product) => product.id === `${DEMO_PREFIX}_seasonal`)).toBe(false);
    expect((await readdir(productImageDirectory())).length).toBe(6);
    const counts = { orders: await db.order.count(), products: await db.product.count(), counter: await db.orderCounter.findFirst() };
    expect((await populateDemoService(db)).alreadyPresent).toBe(true);
    expect({ orders: await db.order.count(), products: await db.product.count(), counter: await db.orderCounter.findFirst() }).toEqual(counts);
    expect((await db.kitchenTicket.findUniqueOrThrow({ where: { id: newTicket } })).status).toBe("PREPARING");
    expect((await getOrder(readyToClose.id, db)).status).toBe("COMPLETED");
  }, 30_000);
});
