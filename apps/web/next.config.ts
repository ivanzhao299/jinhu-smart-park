import type { NextConfig } from "next";
import path from "node:path";

const apiTarget = process.env.NEXT_PUBLIC_API_TARGET ?? "http://127.0.0.1:3101";
const deploymentFlag = (value: string | undefined): "true" | "false" =>
  value?.trim().toLowerCase() === "true" ? "true" : "false";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  compress: true,
  // Only normalized booleans are embedded in the client bundle. The private
  // deployment variable names remain the operator-facing rollback contract.
  env: {
    NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1: deploymentFlag(process.env.PROPERTY_OFFLINE_DRAFTS_V1),
    NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1: deploymentFlag(process.env.PROPERTY_UPLOAD_QUEUE_V1)
  },
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    optimizePackageImports: ["lucide-react"]
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiTarget}/api/:path*`
      }
    ];
  },
  transpilePackages: ["@jinhu/shared", "@jinhu/ui"],
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@jinhu/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts")
    };
    return config;
  }
};

export default nextConfig;
