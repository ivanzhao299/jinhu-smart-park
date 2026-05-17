import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
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
