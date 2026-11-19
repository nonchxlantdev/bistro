import { randomUUID } from "node:crypto";
import { mkdir, open, unlink, readFile, lstat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { BlobNotFoundError, del, get, put } from "@vercel/blob";
import { AppError } from "@/lib/errors";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export type ProductImageChange = { bytes: Buffer } | { remove: true };
export type StoredProductImage = { imagePath: string; imageThumbnailPath: string };
const filenamePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:-thumb)?\.webp$/;
const routePrefix = "/api/product-images/";

export function productImageDirectory() {
  return path.resolve(process.env.SORA_DATA_DIR ?? path.join(process.cwd(), "data"), "product-images");
}

/**
 * Storage backend: Vercel Blob (private store) when BLOB_READ_WRITE_TOKEN is set — required on Vercel,
 * whose file system is read-only — otherwise the local data/product-images folder.
 * Either way images are only ever served through the authenticated /api/product-images route.
 */
// A connected store provides either a read-write token or, on newer Vercel projects, BLOB_STORE_ID
// with Vercel's built-in OIDC sign-in (picked up automatically by @vercel/blob).
const blobStorageEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const blobPath = (filename: string) => `product-images/${filename}`;
const blobAccess = () => (process.env.SORA_BLOB_ACCESS === "public" ? "public" : "private") as "public" | "private";

async function writeImageFile(filename: string, data: Buffer) {
  if (blobStorageEnabled()) {
    await put(blobPath(filename), data, { access: blobAccess(), contentType: "image/webp", addRandomSuffix: false, allowOverwrite: false });
    return;
  }
  const handle = await open(path.join(productImageDirectory(), filename), "wx");
  try { await handle.writeFile(data); } finally { await handle.close(); }
}

async function deleteImageFile(filename: string) {
  if (blobStorageEnabled()) { await del(blobPath(filename)).catch((error: unknown) => { if (!(error instanceof BlobNotFoundError)) throw error; }); return; }
  await unlink(path.join(productImageDirectory(), filename)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
}

async function readImageFile(filename: string) {
  if (blobStorageEnabled()) {
    const result = await get(blobPath(filename), { access: blobAccess() });
    if (!result || !result.stream) throw new Error("Missing blob");
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
  const target = path.join(productImageDirectory(), filename);
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Invalid file");
  return await readFile(target);
}

export function managedImageFilename(url: string | null | undefined) {
  if (!url?.startsWith(routePrefix)) return null;
  const name = url.slice(routePrefix.length);
  return filenamePattern.test(name) ? name : null;
}

export async function removeStoredImages(paths: Array<string | null | undefined>) {
  for (const url of paths) {
    const filename = managedImageFilename(url);
    if (filename) await deleteImageFile(filename);
  }
}

/** True when the stored file behind a managed /api/product-images URL can be read. */
export async function productImageExists(url: string | null | undefined) {
  const filename = managedImageFilename(url);
  if (!filename) return false;
  try { await readImageFile(filename); return true; } catch { return false; }
}

/** Validates, re-encodes (stripping metadata) and sizes an uploaded image into full + thumbnail WebP. */
async function renderProductImage(bytes: Buffer) {
  let image: Buffer, thumbnail: Buffer;
  try {
    const source = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" });
    const meta = await source.metadata();
    if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format) || (meta.pages ?? 1) !== 1) throw new Error("Unsupported image");
    // Full decoding/re-encoding verifies content and strips EXIF/GPS metadata.
    image = await source.rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    thumbnail = await sharp(image).resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  } catch { throw new AppError("Choose a valid, non-animated JPEG, PNG or WebP image (up to 40 megapixels).", 400, "INVALID_IMAGE"); }
  return { image, thumbnail };
}

/**
 * Re-creates a missing stored image under its existing URLs, so database references stay valid.
 * Used to recover demo illustrations (for example, ones saved before the Blob store was connected).
 */
export async function restoreProductImage(paths: { imagePath: string | null; imageThumbnailPath: string | null }, bytes: Buffer) {
  const { image, thumbnail } = await renderProductImage(bytes);
  if (!blobStorageEnabled()) await mkdir(productImageDirectory(), { recursive: true });
  for (const [url, data] of [[paths.imagePath, image], [paths.imageThumbnailPath, thumbnail]] as const) {
    const filename = managedImageFilename(url);
    if (filename && !await productImageExists(url)) await writeImageFile(filename, data);
  }
  return { image, thumbnail };
}

export async function storeProductImage(bytes: Buffer): Promise<StoredProductImage> {
  // On Vercel the local disk is temporary: saving there would produce images that vanish.
  if (process.env.VERCEL && !blobStorageEnabled()) throw new AppError("Photo storage is not connected. Connect a private Vercel Blob store to this project, then redeploy.", 503, "IMAGE_STORAGE_MISSING");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new AppError("Choose an image up to 5 MB.", 413, "IMAGE_SIZE");
  const supportedHeader = (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    || bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");
  if (!supportedHeader) throw new AppError("Choose a valid JPEG, PNG or WebP image.", 400, "INVALID_IMAGE");
  const { image, thumbnail } = await renderProductImage(bytes);
  const key = randomUUID();
  const stored = { imagePath: `${routePrefix}${key}.webp`, imageThumbnailPath: `${routePrefix}${key}-thumb.webp` };
  if (!blobStorageEnabled()) await mkdir(productImageDirectory(), { recursive: true });
  const written: string[] = [];
  try {
    for (const [url, data] of [[stored.imagePath, image], [stored.imageThumbnailPath, thumbnail]] as const) {
      written.push(url);
      await writeImageFile(managedImageFilename(url)!, data);
    }
  } catch (error) { await removeStoredImages(written).catch(() => {}); throw error; }
  return stored;
}

export async function readStoredProductImage(filename: string) {
  if (!filenamePattern.test(filename)) throw new AppError("Image not found.", 404, "IMAGE_NOT_FOUND");
  try {
    return await readImageFile(filename);
  } catch { throw new AppError("Image not found.", 404, "IMAGE_NOT_FOUND"); }
}
