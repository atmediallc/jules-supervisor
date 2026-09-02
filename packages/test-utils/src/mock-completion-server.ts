import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";
import { createMockDecision } from "./fixtures.js";

/**
 * OpenAI-compatible mock HTTP server for provider failover testing.
 *
 * Serves POST /chat/completions and returns an OpenAI-shaped response whose
 * `content` is a JSON Decision (parseable by @jules/core DecisionSchema).
 * Supports per-call failure modes so the ProviderRouter's real HTTP failover
 * path can be exercised against actual sockets (not fakes):
 *   - "ok"           -> 200 valid decision
 *   - "http-500"     -> 500 (retryable)
 *   - "http-429"     -> 429 (retryable)
 *   - "http-401"     -> 401 (permanent auth)
 *   - "malformed"    -> 200 with non-JSON content (DECISION_OUTPUT_FAILURE)
 *   - "invalid-json" -> 200 with JSON that fails DecisionSchema
 *   - "timeout"      -> never respond (hang until client timeout)
 */
export type MockFailureMode =
  | "ok"
  | "http-500"
  | "http-429"
  | "http-401"
  | "malformed"
  | "invalid-json"
  | "timeout";

export interface MockCompletionServer {
  server: Server;
  port: number;
  baseUrl: string;
  /** Number of /chat/completions requests received so far. */
  requestCount: number;
  /** Queue of failure modes; the last mode repeats forever. */
  setModes(modes: MockFailureMode[]): void;
  close(): Promise<void>;
}

interface ServerState {
  modes: MockFailureMode[];
  requestCount: number;
}

function modeAfter(state: ServerState, index: number): MockFailureMode {
  if (state.modes.length === 0) return "ok";
  if (index < state.modes.length) return state.modes[index]!;
  return state.modes[state.modes.length - 1]!;
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

/** Build an OpenAI chat.completions response body whose content is a Decision JSON. */
export function completionBody(
  content: string,
  model = "mock-http-model",
  promptTokens = 10,
  completionTokens = 5,
): Record<string, unknown> {
  return {
    id: "chatcmpl-mock-http",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

export async function startMockCompletionServer(
  initialModes: MockFailureMode[] = ["ok"],
  model = "mock-http-model",
): Promise<MockCompletionServer> {
  const state: ServerState = { modes: [...initialModes], requestCount: 0 };

  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || !req.url?.includes("/chat/completions")) {
      res.writeHead(404).end();
      return;
    }
    const index = state.requestCount++;
    await readBody(req);
    const mode = modeAfter(state, index);

    switch (mode) {
      case "http-500":
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "mock 500" } }));
        return;
      case "http-429":
        res.writeHead(429, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "mock 429 rate limit" } }));
        return;
      case "http-401":
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "mock 401 invalid key" } }));
        return;
      case "malformed":
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(completionBody("THIS IS NOT JSON AT ALL", model)));
        return;
      case "invalid-json":
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(completionBody(JSON.stringify({ bogus: true }), model)));
        return;
      case "timeout":
        // Hang: never write the response. Client timeout aborts the request.
        return;
      case "ok":
      default: {
        const decision = createMockDecision();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(completionBody(JSON.stringify(decision), model)));
      }
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    server,
    port,
    baseUrl: `http://127.0.0.1:${port}/v1`,
    get requestCount() {
      return state.requestCount;
    },
    setModes(modes: MockFailureMode[]) {
      state.modes = [...modes];
    },
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    },
  };
}