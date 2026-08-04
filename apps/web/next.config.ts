import type { NextConfig } from "next";
import path from "node:path";
import { propertyReliabilityPublicEnv } from "./features/property-shared/offline/property-reliability-flags";

const apiTarget = process.env.NEXT_PUBLIC_API_TARGET ?? "http://127.0.0.1:3101";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  compress: true,
  // Only normalized booleans are embedded in the client bundle. The private
  // deployment variable names remain the operator-facing rollback contract.
  env: propertyReliabilityPublicEnv(process.env),
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
      "@jinhu/shared": path.resolve(process.cwd(), "../../packages/shared/src/index.ts")
    };
    return config;
  }
};

export default nextConfig;
