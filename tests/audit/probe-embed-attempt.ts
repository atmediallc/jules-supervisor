/**
 * CERTIFICATION PROBE (Phase 4/7/8 evidence) — definitive attempt at a REAL
 * embedding through the application's own OpenAIEmbeddingProvider, against the
 * configured real endpoint. Captures the exact provider error to document
 * whether the REAL_SEMANTIC_ROUND_TRIP leg is executable.
 *
 * No mocks. Uses the same createEmbeddingProvider() the production worker uses.
 */
import { createEmbeddingProvider } from "../../packages/ai/src/embedding-provider.js";
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";

function loadEnv(): void {
  let p = resolve(process.cwd());
  for (;;) {
    const full = join(p, ".env");
    try {
      const txt = readFileSync(full, "utf8");
      for (const line of txt.split("\n")) {
        if (!line || line.startsWith("#")) continue;
        const i = line.indexOf("=");
        if (i < 0) continue;
        const k = line.slice(0, i).trim();
        const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
        if (process.env[k] === undefined) process.env[k] = v;
      }
      return;
    } catch {
      const parent = dirname(p);
      if (parent === p) return;
      p = parent;
    }
  }
}

async function main(): Promise<void> {
  loadEnv();
  const baseUrl = process.env["EMBEDDING_BASE_URL"] ?? process.env["AI_BASE_URL"] ?? "http://homenas:20128/v1";
  const apiKey = process.env["EMBEDDING_API_KEY"] ?? process.env["AI_API_KEY"] ?? "";
  const model = process.env["EMBEDDING_MODEL"] ?? "text-embedding-3-small";

  console.log("=".repeat(64));
  console.log("REAL EMBEDDING ATTEMPT");
  console.log(`baseUrl=${baseUrl}`);
  console.log(`model=${model}`);
  console.log(`apiKey=${apiKey ? "SET (len=" + apiKey.length + ")" : "EMPTY"}`);
  console.log("=".repeat(64));

  const provider = createEmbeddingProvider({
    baseUrl,
    apiKey,
    model,
    dimensions: 1536,
    batchSize: 8,
    timeoutMs: 10000,
  });
  console.log(`provider=${provider.constructor?.name}`);

  try {
    const res = await provider.embed("certification probe embedding for semantic recall");
    console.log("EMBED SUCCESS:", JSON.stringify({ dims: res.vector.length, count: res.count }));
    process.exit(0);
  } catch (e) {
    const err = e as { status?: number; message?: string; code?: string };
    console.log("EMBED RESULT: BLOCKED");
    console.log(`status=${err.status ?? "n/a"} code=${err.code ?? "n/a"} message=${(err.message ?? "").split("\n")[0]}`);
  }
}

main();