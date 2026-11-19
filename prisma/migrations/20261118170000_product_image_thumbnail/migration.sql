-- Additive only: existing products and their current image paths are retained.
ALTER TABLE "Product" ADD COLUMN "imageThumbnailPath" TEXT;
