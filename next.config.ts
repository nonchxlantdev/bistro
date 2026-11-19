import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local builds use .next-build; Vercel expects the standard .next output folder.
  distDir: process.env.VERCEL ? ".next" : ".next-build",
  serverExternalPackages: ["@libsql/client", "libsql", "@prisma/adapter-libsql", "@prisma/client", "sharp"],
};

export default nextConfig;
