import { prisma } from "@/lib/db/prisma";
import { getTenant } from "@/lib/services/tenant";
import { readStoredProductImage, managedImageFilename, restoreProductImage } from "@/lib/services/product-images";
import { DEMO_ARTWORK_PRODUCTS, demoArtwork } from "../../../../../prisma/demo-artwork";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  try {
    const { filename } = await context.params;
    const imagePath = `/api/product-images/${filename}`;
    if (!managedImageFilename(imagePath)) throw new AppError("Image not found.", 404, "IMAGE_NOT_FOUND");
    const tenant = await getTenant();
    const product = await prisma.product.findFirst({ where: { businessId: tenant.business.id, OR: [{ imagePath }, { imageThumbnailPath: imagePath }] }, select: { id: true, imagePath: true, imageThumbnailPath: true } });
    if (!product) throw new AppError("Image not found.", 404, "IMAGE_NOT_FOUND");
    let bytes: Buffer;
    try { bytes = await readStoredProductImage(filename); }
    catch (error) {
      // Demo illustrations are generated, so a missing file can be recreated in place.
      const kind = DEMO_ARTWORK_PRODUCTS[product.id];
      if (!kind || !(error instanceof AppError) || error.status !== 404) throw error;
      const restored = await restoreProductImage(product, await demoArtwork(kind));
      bytes = imagePath === product.imageThumbnailPath ? restored.thumbnail : restored.image;
    }
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: "Could not load the image." }, { status: 500 });
  }
}
