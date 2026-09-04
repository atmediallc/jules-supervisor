import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

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

export default withNextIntl(nextConfig);
