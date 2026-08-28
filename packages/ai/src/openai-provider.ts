import { DecisionSchema } from "@jules/core";
import { logger, metrics } from "@jules/observability";
import OpenAI from "openai";
import { validateProviderUrl } from "./ssrf-guard.js";
import { AiDecisionResponse, BuiltContext, IAiDecisionProvider } from "./types.js";

export interface OpenAiProviderConfig {
  baseUrl?: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  maxTokens?: number;
  allowInsecureLocal?: boolean;
  trustedInternalHosts?: string[];
}

export class OpenAiDecisionProvider implements IAiDecisionProvider {
  public readonly name: string;
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;

  constructor(config: OpenAiProviderConfig, name = "openai") {
    this.name = name;
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.maxTokens = config.maxTokens ?? 2048;

    const baseUrl = config.baseUrl || "https://api.openai.com/v1";
    const ssrfCheck = validateProviderUrl(baseUrl, {
      allowInsecureLocal: config.allowInsecureLocal,
      trustedInternalHosts: config.trustedInternalHosts,
    });

    if (!ssrfCheck.isValid) {
      throw new Error(`AI Provider URL blocked by SSRF Guard: ${ssrfCheck.reason}`);
    }

    this.client = new OpenAI({
      baseURL: baseUrl,
      apiKey: config.apiKey,
      timeout: this.timeoutMs,
    });
  }

  public async decide(context: BuiltContext, signal?: AbortSignal): Promise<AiDecisionResponse> {
    const startTime = Date.now();

    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: [
            { role: "system", content: context.systemPrompt },
            { role: "user", content: context.userPrompt },
          ],
          response_format: { type: "json_object" },
          max_tokens: this.maxTokens,
          temperature: 0.1,
        },
        { signal },
      );

      const latencyMs = Date.now() - startTime;
      metrics.recordAiLatency(latencyMs);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("AI provider returned empty response");
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(content);
      } catch (err: unknown) {
        throw new Error(`Failed to parse AI JSON output: ${(err as Error).message}`);
      }

      const decision = DecisionSchema.parse(parsedJson);

      const usage = response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined;

      return {
        decision,
        provider: this.name,
        model: response.model || this.model,
        usage,
        latencyMs,
      };
    } catch (err: unknown) {
      metrics.incrementAiError((err as Error).name || "AI_ERROR");
      logger.error("AI Decision Provider failed", err);
      throw err;
    }
  }
}
