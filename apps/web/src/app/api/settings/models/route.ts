import { NextResponse } from "next/server";
import { getConfig } from "@jules/config";
import { validateProviderUrl } from "@jules/ai";

/**
 * GET /api/settings/models — List available models from the configured AI provider.
 *
 * Reads the effective AI config (DB override → env → default), validates the
 * base URL against the SSRF guard, then calls {baseUrl}/models (OpenAI-compatible
 * GET /models) with the configured API key. Returns the model ids.
 *
 * Responses:
 *   200 { models: string[] } on success (may be empty)
 *   200 { models: [] } when the provider cannot list models (mock, no key, error)
 *   400 when the base URL fails SSRF validation
 */
export const dynamic = "force-dynamic";

const timeoutMs = 8000;

export async function GET() {
  try {
    const config = getConfig();
    const providerType = config.AI_PROVIDER_TYPE;

    // Mock provider — return its fixed synthetic model.
    if (providerType === "mock" || config.AI_API_KEY === "mock-ai-key-placeholder") {
      return NextResponse.json({ models: ["mock-model-v1"] });
    }

    const baseUrl = config.AI_BASE_URL.replace(/\/+$/, "");
    const apiKey = config.AI_API_KEY;

    // Guard against SSRF to internal/private endpoints the operator didn't trust.
    const guard = validateProviderUrl(baseUrl, {
      allowInsecureLocal: config.ALLOW_INSECURE_LOCAL_ENDPOINTS,
      trustedInternalHosts: config.TRUSTED_INTERNAL_AI_HOSTS,
    });
    if (!guard.isValid) {
      return NextResponse.json({ error: guard.reason }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ error: "AI_API_KEY is not configured" }, { status: 400 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      });

      if (!res.ok) {
        return NextResponse.json({ models: [] });
      }

      const data = (await res.json()) as { data?: { id: string }[] };
      const models = (data.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => Boolean(id));
      return NextResponse.json({ models });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Network/timeout/abort — fall back to empty list so the UI uses free text.
    return NextResponse.json({ models: [] });
  }
}
