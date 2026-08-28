import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@jules/core",
    "@jules/db",
    "@jules/jules-client",
    "@jules/ai",
    "@jules/policy",
    "@jules/observability",
    "@jules/config",
    "@jules/shared",
  ],
};

export default nextConfig;
