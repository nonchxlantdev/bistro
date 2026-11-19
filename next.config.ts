import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local builds use .next-build; Vercel expects the standard .next output folder.
  // Lets the UI label the hosted deployment ("Live Demo") versus local development.
  env: { NEXT_PUBLIC_SORA_HOSTED: process.env.VERCEL ? "1" : "" },
  distDir: process.env.VERCEL ? ".next" : ".next-build",
  serverExternalPackages: ["@libsql/client", "libsql", "@prisma/adapter-libsql", "@prisma/client", "sharp"],
};

export default nextConfig;
