import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Separate build output lets UI verification run without touching desktop data or its dev cache.
  distDir: process.env.ENGLISH_NEXT_DIST_DIR || ".next",
  // Required for Electron packaging: produces .next/standalone/server.js
  output: "standalone",
  outputFileTracingExcludes: {
    "/*": [".venv/**/*", "desktop/**/*", ".git/**/*", "src/backend/**/*", ".env*", ".next-*-qa/**/*"],
  },
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.brandfetch.io",
      },
    ],
  },
};

export default nextConfig;
