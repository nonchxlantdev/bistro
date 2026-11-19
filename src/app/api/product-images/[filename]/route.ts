import { prisma } from "@/lib/db/prisma";
import { getTenant } from "@/lib/services/tenant";
import { readStoredProductImage, managedImageFilename } from "@/lib/services/product-images";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  try {
    const { filename } = await context.params;
    const imagePath = `/api/product-images/${filename}`;
    if (!managedImageFilename(imagePath)) throw new AppError("Image not found.", 404, "IMAGE_NOT_FOUND");
    const tenant = await getTenant();
    const referenced = await prisma.product.count({ where: { businessId: tenant.business.id, OR: [{ imagePath }, { imageThumbnailPath: imagePath }] } });
    if (!referenced) throw new AppError("Image not found.", 404, "IMAGE_NOT_FOUND");
    const bytes = await readStoredProductImage(filename);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status });
    console.error(error);
    return Response.json({ error: "Could not load the image." }, { status: 500 });
  }
}
