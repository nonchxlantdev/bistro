# Deploying the Salud Bistro demo to Vercel

The app runs on Vercel with three hosted services instead of local files:

| Local (your PC)                      | Vercel                                         |
| ------------------------------------ | ---------------------------------------------- |
| `prisma/dev.db` (SQLite file)        | **Turso** database (hosted SQLite)             |
| `data/demo-access.json`              | `SORA_DEMO_*` environment variables            |
| `data/product-images/`               | **Vercel Blob** store (private)                |

Local development is unchanged: with the Turso/Blob/`SORA_DEMO_*` variables empty, the app uses the local files exactly as before.

## One-time setup

1. **Import the repo** — vercel.com → Add New → Project → import `nonchxlantdev/bistro`. Framework and build command come from `vercel.json`. Don't deploy yet (or let the first deploy fail; it will tell you the database is missing).
2. **Database** — Project → Storage → Create Database → **Turso** → connect it to the project for all environments. This adds `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. If the variable names Vercel adds are different, rename them to these two.
3. **Product photos** — Project → Storage → Create → **Blob** → choose **Private** access → connect to the project. This adds `BLOB_READ_WRITE_TOKEN`.
4. **Demo password** — Project → Settings → Environment Variables → paste the three lines from `data/vercel-env.txt` (kept on your PC only, never committed):
   `SORA_DEMO_PASSWORD_SALT`, `SORA_DEMO_PASSWORD_HASH`, `SORA_DEMO_SESSION_SECRET`.
   To change the password later: `SORA_DEMO_PASSWORD=... npx tsx scripts/configure-demo-access.ts --env`, paste the new values, redeploy.
5. **Deploy** (Deployments → Redeploy). The build runs `scripts/db-setup.ts` first, which:
   - applies any new migrations from `prisma/migrations` (tracked in `_prisma_migrations`),
   - seeds the Salud Bistro menu, tables and settings **only if the database is empty**,
   - adds the demo service checks once.
   Re-deploying never resets orders or menu changes made in the demo.

## Notes

- Every visitor shares the same Turso database, so changes made by one demo user are visible to the next.
- To skip the demo service checks, set `SORA_SKIP_DEMO_SERVICE=1`.
- If a store was created as **Public** instead of Private, set `SORA_BLOB_ACCESS=public`. Photos are still only served through the logged-in `/api/product-images` route.
- Schema changes: create migrations locally as before (`npm run db:migrate`), commit the new `prisma/migrations/*` folder; the next deploy applies it.
