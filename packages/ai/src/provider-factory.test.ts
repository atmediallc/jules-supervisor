import { describe, expect, it } from "vitest";
import { createAiProvider } from "./provider-factory.js";
import { DefaultProviderRouter } from "./provider-router.js";

/**
 * Factory contract tests: build a router from an AppConfig-shaped object and
 * assert multi-provider wiring (primary + ordered fallbacks) and that the mock
 * key always short-circuits to the mock provider (single provider).
 */

function config(overrides: Record<string, unknown> = {}) {
  return {
    AI_PROVIDER_TYPE: "openai" as const,
    AI_BASE_URL: "https://api.openai.com/v1",
    AI_API_KEY: "sk-test",
    AI_MODEL: "gpt-4o",
    AI_TIMEOUT_MS: 30000,
    AI_MAX_TOKENS: 2048,
    ALLOW_INSECURE_LOCAL_ENDPOINTS: false,
    TRUSTED_INTERNAL_AI_HOSTS: ["localhost", "127.0.0.1", "omniroute"],
    AI_FALLBACK_PROVIDERS: [] as Array<{
      name: string;
      baseUrl: string;
      apiKey: string;
      model: string;
    }>,
    MAX_AI_RETRIES: 3,
    ...overrides,
  };
}

describe("createAiProvider factory", () => {
  it("builds a default (no-fallback) router with a single provider", () => {
    const router = createAiProvider(config() as never) as unknown as {
      healthSnapshot(): Array<{ name: string }>;
    };
    expect(router.healthSnapshot()).toHaveLength(1);
    expect(router.healthSnapshot()[0]!.name).toBe("openai");
  });

  it("wires ordered fallback providers as secondary entries", () => {
    const router = createAiProvider(
      config({
        AI_FALLBACK_PROVIDERS: [
          {
            name: "omniroute",
            baseUrl: "https://omniroute.example/v1",
            apiKey: "sk-omniroute",
            model: "gpt-4o-mini",
          },
          {
            name: "openai-backup",
            baseUrl: "https://api.openai.com/v1",
            apiKey: "sk-backup",
            model: "gpt-4o",
          },
        ],
      }) as never,
    ) as unknown as { healthSnapshot(): Array<{ name: string }> };

    const snapshot = router.healthSnapshot();
    expect(snapshot).toHaveLength(3);
    expect(snapshot[0]!.name).toBe("openai");
    expect(snapshot[1]!.name).toBe("omniroute");
    expect(snapshot[2]!.name).toBe("openai-backup");
    expect(router).toBeInstanceOf(DefaultProviderRouter);
  });

  it("mock api key short-circuits to a single mock provider", () => {
    const router = createAiProvider(
      config({ AI_API_KEY: "mock-ai-key-placeholder", AI_PROVIDER_TYPE: "openai" }) as never,
    ) as unknown as { healthSnapshot(): Array<{ name: string }> };
    const snapshot = router.healthSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]!.name).toBe("mock");
  });
});