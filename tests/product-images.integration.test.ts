import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import sharp from "sharp";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/db/prisma";
import { seed } from "../prisma/seed";
import { getMenu, getPosCatalog, updateProduct } from "../src/lib/services/catalog";
import { saveModifierGroup } from "../src/lib/services/modifiers";
import { MAX_IMAGE_BYTES, productImageDirectory, readStoredProductImage, removeStoredImages } from "../src/lib/services/product-images";
import { POST } from "../src/app/api/products/route";
import { PATCH } from "../src/app/api/products/[id]/route";
import { GET } from "../src/app/api/product-images/[filename]/route";

const payload = { name: "Local photo test", description: "Image persistence test", categoryId: "cat_coffee", priceCents: 500, isActive: true };
const createdImages: string[] = [];
function request(image?: Buffer, remove = false, data = payload) {
  const form = new FormData();
  form.set("product", JSON.stringify(data));
  if (image) form.set("image", new File([new Uint8Array(image)], "photo.jpg", { type: "image/jpeg" }));
  if (remove) form.set("removeImage", "true");
  return new Request("http://localhost/api/products", { method: "POST", body: form });
}
async function readRoute(url: string) { return GET(new Request("http://localhost" + url), { params: Promise.resolve({ filename: url.split("/").at(-1)! }) }); }
async function photo(width = 1600, height = 800) { return sharp({ create: { width, height, channels: 3, background: "#B76D50" } }).png().toBuffer(); }

describe("local product image lifecycle", () => {
  beforeAll(async () => { await seed(prisma); });
  afterAll(async () => { await removeStoredImages(createdImages); await prisma.$disconnect(); });

  it("saves real images, retains them across fresh DB connections, and preserves assignments when toggled", async () => {
    // The file claims JPEG but contains PNG. Actual decoded content determines acceptance.
    const response = await POST(request(await photo()));
    expect(response.status).toBe(200);
    const product = await response.json();
    createdImages.push(product.imagePath, product.imageThumbnailPath);
    expect(product.imagePath).toMatch(/^\/api\/product-images\/[0-9a-f-]+\.webp$/);
    const full = await readStoredProductImage(product.imagePath.split("/").at(-1)!);
    const thumb = await readStoredProductImage(product.imageThumbnailPath.split("/").at(-1)!);
    expect(await sharp(full).metadata()).toMatchObject({ format: "webp", width: 1200, height: 600 });
    expect(await sharp(thumb).metadata()).toMatchObject({ format: "webp", width: 320, height: 160 });
    expect((await readRoute(product.imageThumbnailPath)).headers.get("content-type")).toBe("image/webp");
    expect((await getMenu()).products.find((entry) => entry.id === product.id)?.imageThumbnailPath).toBe(product.imageThumbnailPath);
    expect((await getPosCatalog()).products.find((entry) => entry.id === product.id)?.imagePath).toBe(product.imagePath);
    const fresh = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }) });
    try { expect((await fresh.product.findUniqueOrThrow({ where: { id: product.id } })).imagePath).toBe(product.imagePath); }
    finally { await fresh.$disconnect(); }

    await saveModifierGroup(null, { name: "Photo test discount " + randomUUID(), minSelect: 0, maxSelect: 1, isActive: true, productIds: [product.id], options: [{ name: "Small", priceDeltaCents: -400, isActive: true }] });
    await updateProduct(product.id, { ...payload, isActive: false });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).imagePath).toBe(product.imagePath);
    expect(await prisma.productModifierGroup.count({ where: { productId: product.id } })).toBe(1);
    await updateProduct(product.id, payload);

    const before = (await readdir(productImageDirectory())).sort();
    const failed = await PATCH(request(await photo(600, 900), false, { ...payload, priceCents: 100 }), { params: Promise.resolve({ id: product.id }) });
    expect(failed.status).toBe(400);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).imagePath).toBe(product.imagePath);
    expect((await readdir(productImageDirectory())).sort()).toEqual(before);
    expect((await readRoute(product.imagePath)).status).toBe(200);

    const replaced = await PATCH(request(await photo(600, 900)), { params: Promise.resolve({ id: product.id }) });
    expect(replaced.status).toBe(200);
    const replacement = await replaced.json();
    createdImages.push(replacement.imagePath, replacement.imageThumbnailPath);
    expect(replacement.imagePath).not.toBe(product.imagePath);
    expect((await readRoute(product.imagePath)).status).toBe(404);
    await expect(readStoredProductImage(product.imagePath.split("/").at(-1)!)).rejects.toMatchObject({ code: "IMAGE_NOT_FOUND" });
    expect(await sharp(await readStoredProductImage(replacement.imagePath.split("/").at(-1)!)).metadata()).toMatchObject({ width: 600, height: 900 });
    const removed = await PATCH(request(undefined, true), { params: Promise.resolve({ id: product.id }) });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toMatchObject({ imagePath: null, imageThumbnailPath: null });
    expect((await readRoute(replacement.imagePath)).status).toBe(404);
    expect(await prisma.productModifierGroup.count({ where: { productId: product.id } })).toBe(1);
  });

  it("accepts actual JPEG and WebP files in addition to PNG", async () => {
    const png = await photo(400, 200);
    for (const bytes of [await sharp(png).jpeg().toBuffer(), await sharp(png).webp().toBuffer()]) {
      const saved = await POST(request(bytes));
      expect(saved.status).toBe(200);
      const product = await saved.json();
      createdImages.push(product.imagePath, product.imageThumbnailPath);
      expect((await readRoute(product.imagePath)).status).toBe(200);
      expect(await sharp(await readStoredProductImage(product.imagePath.split("/").at(-1)!)).metadata()).toMatchObject({ format: "webp", width: 400, height: 200 });
      expect((await PATCH(request(undefined, true), { params: Promise.resolve({ id: product.id }) })).status).toBe(200);
    }
  });

  it("rejects disguised content, corrupt files, oversized uploads and conflicting actions", async () => {
    for (const bytes of [Buffer.from("not an image"), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" /></svg>'), (await photo()).subarray(0, 80)]) {
      expect((await POST(request(bytes))).status).toBe(400);
    }
    expect((await POST(request(Buffer.alloc(MAX_IMAGE_BYTES + 1)))).status).toBe(413);
    expect((await POST(request(await photo(), true))).status).toBe(400);
    const large = new FormData(); large.set("product", JSON.stringify(payload)); large.set("extra", "x".repeat(MAX_IMAGE_BYTES + 128 * 1024));
    // Serialize like an incoming HTTP body. This avoids Node's in-memory FormData
    // producer racing cancellation when the bounded reader rejects the body.
    const encoded = new Response(large);
    const largeRequest = new Request("http://localhost/api/products", { method: "POST", headers: { "content-type": encoded.headers.get("content-type")! }, body: await encoded.arrayBuffer() });
    expect((await POST(largeRequest)).status).toBe(413);
  });

  it("does not serve traversal paths, arbitrary filenames or unreferenced files", async () => {
    for (const filename of ["../../prisma/dev.db", "%2e%2e%2fdev.db", "photo.png", "dev.db", randomUUID() + ".webp"]) {
      const response = await GET(new Request("http://localhost/api/product-images/x"), { params: Promise.resolve({ filename }) });
      expect(response.status).toBe(404);
    }
  });
});
