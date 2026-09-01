import { AppConfig } from "@jules/config";
import { MockAiDecisionProvider } from "./mock-provider.js";
import { OpenAiDecisionProvider } from "./openai-provider.js";
import { standardCapabilities } from "./provider-capabilities.js";
import { DefaultProviderRouter, ProviderEntry, ProviderRouter } from "./provider-router.js";
import { IAiDecisionProvider } from "./types.js";

export interface CreateAiProviderOptions {
  maxContextTokens?: number;
}

/**
 * Build the AI decision provider used by the pipeline. Returns a ProviderRouter
 * (which itself implements IAiDecisionProvider) so the pipeline stays agnostic
 * to failover/circuit/retry concerns.
 *
 * With a single configured provider (the current reality: `openai`/`omniroute`
 * are two base-URL variants of the same OpenAI-compatible class, and `mock` is
 * the test double) the router still delivers bounded same-provider retry
 * (wiring the previously-dead MAX_AI_RETRIES), per-attempt accounting, and a
 * circuit breaker. Additional secondary providers can be supplied via
 * `extendProviderRouter` without touching the pipeline.
 */
export function createAiProvider(
  config: AppConfig,
  opts: CreateAiProviderOptions = {},
): ProviderRouter {
  const providers: ProviderEntry[] = [];

  if (config.AI_PROVIDER_TYPE === "mock" || config.AI_API_KEY === "mock-ai-key-placeholder") {
    const mock = new MockAiDecisionProvider();
    providers.push({
      provider: mock,
      capabilities: standardCapabilities({
        model: "mock-model-v1",
        timeoutMs: config.AI_TIMEOUT_MS,
        maxContextTokens: 32_768,
      }),
      health: "HEALTHY",
    });
  } else {
    providers.push({
      provider: new OpenAiDecisionProvider(
        {
          baseUrl: config.AI_BASE_URL,
          apiKey: config.AI_API_KEY,
          model: config.AI_MODEL,
          timeoutMs: config.AI_TIMEOUT_MS,
          maxTokens: config.AI_MAX_TOKENS,
          allowInsecureLocal: config.ALLOW_INSECURE_LOCAL_ENDPOINTS,
          trustedInternalHosts: config.TRUSTED_INTERNAL_AI_HOSTS,
        },
        config.AI_PROVIDER_TYPE,
      ),
      capabilities: standardCapabilities({
        model: config.AI_MODEL,
        timeoutMs: config.AI_TIMEOUT_MS,
        maxContextTokens: opts.maxContextTokens ?? 128_000,
      }),
      health: "HEALTHY",
    });
  }

  return new DefaultProviderRouter({
    providers,
    maxRetries: config.MAX_AI_RETRIES,
  });
}

/**
 * Convenience helper for composing an extra secondary provider onto an existing
 * router (e.g. from a settings-driven list in the future). The pipeline never
 * needs to know. Returns a NEW router so config changes are explicit.
 */
export function extendProviderRouter(
  base: ProviderRouter,
  additional: ProviderEntry,
): ProviderRouter {
  const existing = base as unknown as { providers: ProviderEntry[]; maxRetries: number };
  return new DefaultProviderRouter({
    providers: [...existing.providers, additional],
    maxRetries: existing.maxRetries,
  });
}

/**
 * Alias so downstream imports (and the worker index) continue to work and
 * still receive an IAiDecisionProvider.
 */
export function createProvider(
  config: AppConfig,
  opts?: CreateAiProviderOptions,
): IAiDecisionProvider {
  return createAiProvider(config, opts);
}
