import { AppConfig } from "@jules/config";
import { MockAiDecisionProvider } from "./mock-provider.js";
import { OpenAiDecisionProvider } from "./openai-provider.js";
import { IAiDecisionProvider } from "./types.js";

export function createAiProvider(config: AppConfig): IAiDecisionProvider {
  if (config.AI_PROVIDER_TYPE === "mock" || config.AI_API_KEY === "mock-ai-key-placeholder") {
    return new MockAiDecisionProvider();
  }

  return new OpenAiDecisionProvider(
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
  );
}
