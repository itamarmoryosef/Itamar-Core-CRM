import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./lib/securityHttpHeaders";

const nextConfig: NextConfig = {
  transpilePackages: ["@react-pdf/renderer"],
  /** Smaller client bundles: tree-shake icon/chart imports. */
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
