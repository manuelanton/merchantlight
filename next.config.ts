import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite loads its wasm/data files via URL, which breaks when bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
