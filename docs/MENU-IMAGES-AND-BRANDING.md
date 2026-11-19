# Menu management and espresso branding refinement

## Workspace

Menu is now a sticky-tab workspace with Products, Modifiers and Categories. The active section is reflected in `/menu?tab=products`, `?tab=modifiers` or `?tab=categories`, including direct navigation and browser back/forward. Arrow keys, Home and End navigate the tab bar. Existing search/filter values remain in the mounted workspace while switching sections.

Products use compact rows with thumbnails, names, categories, price, availability and editing. Modifiers no longer require scrolling through products. Categories retain their records and expose counts, active status and sort order. Existing creation, editing, availability and assignment logic remains in use.

## Persistent product images

- The nullable `Product.imageThumbnailPath` field is added by `20261118170000_product_image_thumbnail`. Existing `imagePath` values and other data are retained.
- Default storage: `data/product-images/` under the project directory. Set `SORA_DATA_DIR` to a persistent application-data root to move it; images live in its `product-images` child. This is outside `public`, temporary uploads and `.next-build`.
- `/api/product-images/[filename]` serves only validated UUID-named WebP files referenced by a product in the current business. Invalid paths, symlinks, arbitrary filenames and unreferenced images are rejected. Responses include the image content type, `nosniff` and private immutable caching.
- Uploads are part of the product Save request. Before saving, selected files exist only as a browser preview; canceling a form does not leave staged server uploads.
- JPEG, PNG and WebP signatures and fully decoded content are checked. File extension/MIME alone is never trusted. Upload limit is 5 MB, decoded-image limit is 40 megapixels, animated images are rejected, and the full multipart body is bounded.
- Sharp re-encodes uploads as metadata-free WebP, with a maximum 1200px side and 320px thumbnails, preserving aspect ratio and avoiding enlargement. EXIF/GPS data is not retained.
- Files are fully written before database references are changed. Database failures remove newly written files. Old files are removed only after the database commits, and only when no product references them. A failed old-file cleanup is logged without undoing a successful product save.
- Replacement generates new collision-resistant filenames. Removing an image clears both database paths. Existing availability requests that contain no image change retain the current image.
- Menu and register use lazy-loaded thumbnails. Products remain usable without images; no online product photography was added.

## Backup and restore

A consistent SQLite backup was created in `backups/pre-product-images-2026-11-18T22-35-29-014Z.db` before the additive migration. No database reset or reseed was performed on the live database.

For future full backups, stop the local server and back up the configured SQLite database plus the entire configured `SORA_DATA_DIR` together. Retain `.env` privately so the restored app points at the matching database and data directory. A database-only backup will not include uploaded image bytes. Restore database and image data together before restarting. Do not put database/media backups in public web assets.

Normal save failures are cleaned up. An abrupt OS/process crash between file creation and database commit may leave an unreferenced file, which the public image route will not serve. No automatic destructive orphan sweep is performed. Preserve the media directory when updating/rebuilding the app.

## Branding and theme

The official original PNG is unchanged. A 599×332 derivative crops only the surrounding black margins, with 16px padding, and is stored as `public/branding/salud-bistro-wordmark.png`. It is rendered with its true aspect ratio and `object-fit: contain`, using 94% of the sidebar branding area's width. Redundant large restaurant text was removed. Restaurant & Café and DEMO remain below the wordmark; compact rails use a compact presentation.

Shared tokens now use an espresso `#241B17` sidebar, walnut `#49362B` navigation states, cream text, brass `#C5A477`, olive `#777D5B`, and a light warm workspace. Primary buttons stay dark brown. Existing Fraunces/DM Sans typography and tabular figures remain. No third font or cloud storage was introduced.

The shared logo renderer now uses the official image as a CSS luminance mask, so its black background is transparent in the interface without modifying or regenerating the artwork. Lettering inherits the surrounding text color: light in the espresso sidebar and dark in the light Settings preview. The previous black wrapper panels have been removed.

## Main implementation files

- `src/components/menu/menu-screen.tsx`: tab navigation, product actions and multipart Save.
- `src/components/menu/product-image-field.tsx`: local preview, choose/replace/remove/undo controls.
- `src/components/menu/menu-product-form.tsx`: image field integrated with the existing product form.
- `src/lib/product-request.ts`: bounded JSON/multipart request parsing.
- `src/lib/services/product-images.ts`: image validation, processing, persistent file storage and guarded reads/cleanup.
- `src/lib/services/catalog.ts`: database/file lifecycle and thumbnail DTO fields.
- `src/app/api/products/route.ts`, `[id]/route.ts`: existing JSON compatibility plus multipart product writes.
- `src/app/api/product-images/[filename]/route.ts`: guarded local serving.
- `src/components/pos/product-card.tsx`: lazy thumbnail rendering.
- `src/components/layout/app-sidebar.tsx`, `brand-logo.tsx`, `src/lib/brand.ts`, `src/app/globals.css`: logo and espresso theme.

Browser and desktop/tablet visual inspection remain with the user in Cursor. No browser was opened for this refinement. Restart the local development server once after the Prisma migration/client generation before inspecting the changes.

## Validation

- 40 tests passed across five test files. New route/service integration tests exercise actual JPEG, PNG and WebP uploads, resized output and thumbnails, serving headers, fresh-database-connection persistence, replacement, removal, availability/assignment preservation, invalid/corrupt/disguised files, oversize bodies, traversal attempts and database-write rollback cleanup.
- All original columns/records in 19 live application tables were compared with the pre-migration SQLite backup and were unchanged. Only the new nullable thumbnail column and migration record were added.
- Browser refresh, a running Next.js server restart, and desktop/tablet visual acceptance were not interactively tested; the automated persistence check uses a new Prisma connection and durable files. Manual inspection remains with the user.
- The new wordmark derivative was inspected as a local image. No logo design was regenerated.
- Full lint, TypeScript and production build passed. The build includes the new persistent image-serving route and the URL-backed Menu workspace.
