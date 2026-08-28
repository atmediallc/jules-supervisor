import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@jules/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
      "@jules/config": path.resolve(__dirname, "packages/config/src/index.ts"),
      "@jules/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "@jules/observability": path.resolve(__dirname, "packages/observability/src/index.ts"),
      "@jules/db": path.resolve(__dirname, "packages/db/src/index.ts"),
      "@jules/jules-client": path.resolve(__dirname, "packages/jules-client/src/index.ts"),
      "@jules/ai": path.resolve(__dirname, "packages/ai/src/index.ts"),
      "@jules/policy": path.resolve(__dirname, "packages/policy/src/index.ts"),
      "@jules/test-utils": path.resolve(__dirname, "packages/test-utils/src/index.ts"),
      ioredis: path.resolve(__dirname, "apps/worker/node_modules/ioredis"),
      bullmq: path.resolve(__dirname, "apps/worker/node_modules/bullmq"),
      pg: path.resolve(__dirname, "packages/db/node_modules/pg"),
      "drizzle-orm": path.resolve(__dirname, "packages/db/node_modules/drizzle-orm"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/*.spec.ts"],
  },
});
