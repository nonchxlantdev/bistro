import { AppError } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { parseSchema, productSchema } from "@/lib/validations/schemas";
import { MAX_IMAGE_BYTES, type ProductImageChange } from "@/lib/services/product-images";

/** JSON remains compatible with availability toggles and older clients. */
export async function readProductRequest(request: Request) {
  let data: unknown;
  let image: ProductImageChange | undefined;
  if (request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    const maxRequestBytes = MAX_IMAGE_BYTES + 64 * 1024;
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (Number(request.headers.get("content-length")) > maxRequestBytes) throw new AppError("The upload exceeds 5 MB.", 413, "IMAGE_SIZE");
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("The upload is empty.", 400, "INVALID_UPLOAD");
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > maxRequestBytes) { await reader.cancel(); throw new AppError("The upload exceeds 5 MB.", 413, "IMAGE_SIZE"); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    let form: FormData;
    try {
      form = await new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type")! } }).formData();
      const payload = form.get("product");
      if (typeof payload !== "string") throw new Error("Missing product");
      data = JSON.parse(payload);
    } catch { throw new AppError("The product upload could not be read.", 400, "INVALID_UPLOAD"); }
    const file = form.get("image");
    const remove = form.get("removeImage") === "true";
    if (file instanceof File) {
      if (!file.size) throw new AppError("The selected image is empty.", 400, "INVALID_IMAGE");
      if (remove) throw new AppError("Choose a replacement or remove the image, not both.", 400, "INVALID_UPLOAD");
      if (file.size > MAX_IMAGE_BYTES) throw new AppError("Choose an image up to 5 MB.", 413, "IMAGE_SIZE");
      image = { bytes: Buffer.from(await file.arrayBuffer()) };
    } else if (remove) image = { remove: true };
  } else data = await readJson(request);
  return { ...parseSchema(productSchema, data), image };
}
