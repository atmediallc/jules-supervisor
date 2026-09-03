/**
 * CERTIFICATION PROBE (Phase 4) — real embedding provider capability probe.
 *
 * Resolves the embedding provider through the APPLICATION's own abstraction
 * path only if a real credential is configured. Reports capability without
 * exposing the credential.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createEmbeddingProvider } from "../../packages/ai/src/embedding-provider.js";

// Parse repo .env manually (avoid hoisting quirks). May hold a real AI key
// usable for embeddings on the same OpenAI-compatible proxy.
function loadEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const txt = readFileSync(path, "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]!] = m[2] ?? "";
    }
  } catch {}
  return out;
}

const ROOT = process.cwd().endsWith("packages\\ai") || process.cwd().endsWith("packages/ai")
  ? resolve(process.cwd(), "..", "..")
  : process.cwd();
const env = { ...process.env, ...loadEnvFile(resolve(ROOT, ".env")) };
const baseUrl = env["EMBEDDING_BASE_URL"] || env["AI_BASE_URL"];
const apiKey = env["EMBEDDING_API_KEY"] || env["AI_API_KEY"];
const model = env["EMBEDDING_MODEL"] || "text-embedding-3-small";
const dims = Number(env["EMBEDDING_DIMENSIONS"] || "1536");

console.log("EMBEDDING_BASE_URL:", baseUrl);
console.log("API KEY present:", apiKey ? `yes (len=${apiKey.length})` : "no");
console.log("MODEL:", model, "DIMS:", dims);

if (!apiKey || !baseUrl) {
  console.log("RESULT: BLOCKED_EXTERNAL_CREDENTIAL — no embedding key/baseURL configured");
  process.exit(0);
}

async function main() {
  // Route through the APPLICATION's own embedding abstraction. If the key is a
  // real one, createEmbeddingProvider returns a working OpenAIEmbeddingProvider.
  const provider = createEmbeddingProvider({
    baseUrl,
    apiKey,
    model,
    dimensions: dims,
    batchSize: 8,
    timeoutMs: 15000,
  });
  console.log("provider name:", provider.name);
  try {
    const res = await provider.embed("JULES_MEMORY_CERT_PROBE harmless connectivity check");
    console.log("RESULT: SUCCESS");
    console.log("vector dims:", res.dimensions, "model:", res.model);
    console.log("nonEmpty:", res.vector.some((v) => v !== 0));
  } catch (e) {
    const msg = (e as Error).message;
    console.log("RESULT: FAILED —", msg.split('\n')[0].slice(0, 300));
  }
}

main();