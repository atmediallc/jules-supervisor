/**
 * Qdrant adapter tests (Phase D).
 *
 * Verifies the SSRF guard, collection bootstrap, query()-based search with
 * metadata filters, retry/backoff on transient errors, and health reporting —
 * all against a mocked Qdrant client so no network is required.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryConfigurationError, MemoryIndexError } from "@jules/core";
import { QdrantSemanticStore } from "./qdrant-adapter.js";

const mocks = vi.hoisted(() => ({
  getCollections: vi.fn(),
  createCollection: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  query: vi.fn(),
  retrieve: vi.fn(),
}));

vi.mock("@qdrant/js-client-rest", () => {
  class QdrantClient {
    constructor(opts: unknown) {
      (this as unknown as { _opts: unknown })._opts = opts;
    }
    getCollections = mocks.getCollections;
    createCollection = mocks.createCollection;
    upsert = mocks.upsert;
    delete = mocks.delete;
    query = mocks.query;
    retrieve = mocks.retrieve;
  }
  return { QdrantClient };
});

const BASE = {
  url: "https://qdrant.example.com",
  apiKey: "secret",
  collection: "jules_memories",
  vectorSize: 1536,
  timeoutMs: 500,
  maxRetries: 2,
  embeddingModel: "test-model",
};

function makeStore(overrides: Partial<typeof BASE> = {}) {
  return new QdrantSemanticStore({ ...BASE, ...overrides });
}

describe("QdrantSemanticStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects URLs blocked by the SSRF guard", () => {
    // 169.254.169.254 = cloud metadata service; must never be reachable.
    expect(
      () =>
        new QdrantSemanticStore({
          ...BASE,
          url: "http://169.254.169.254:6333",
        }),
    ).toThrow(MemoryConfigurationError);
  });

  it("creates the collection when it does not exist", async () => {
    mocks.getCollections.mockResolvedValue({ collections: [{ name: "other" }] });
    mocks.createCollection.mockResolvedValue({ result: true });
    const store = makeStore();
    await store.ensureCollection();
    expect(mocks.getCollections).toHaveBeenCalledTimes(1);
    expect(mocks.createCollection).toHaveBeenCalledWith("jules_memories", {
      vectors: { size: BASE.vectorSize, distance: expect.any(String) },
    });
  });

  it("skips creation when the collection already exists", async () => {
    mocks.getCollections.mockResolvedValue({
      collections: [{ name: "jules_memories" }],
    });
    const store = makeStore();
    await store.ensureCollection();
    expect(mocks.createCollection).not.toHaveBeenCalled();
  });

  it("searches via query() with tenant/project/repo metadata filters", async () => {
    mocks.query.mockResolvedValue({
      points: [{ id: "mem_1", score: 0.92, payload: { title: "t" } }],
    });
    const store = makeStore();
    const hits = await store.search(
      [0.1, 0.2, 0.3],
      { tenantId: "t1", projectId: "p1", repositoryId: "r1", memoryType: "failure" },
      5,
    );
    expect(mocks.query).toHaveBeenCalledTimes(1);
    const [collection, arg] = mocks.query.mock.calls[0]! as [string, Record<string, unknown>];
    expect(collection).toBe("jules_memories");
    expect(arg).toHaveProperty("query", [0.1, 0.2, 0.3]);
    expect(arg).toHaveProperty("limit", 5);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: "mem_1", score: 0.92, payload: { title: "t" } });
  });

  it("returns empty result when query returns no points", async () => {
    mocks.query.mockResolvedValue({ points: [] });
    const store = makeStore();
    const hits = await store.search([0.1], {}, 5);
    expect(hits).toEqual([]);
  });

  it("retries transient errors and fails with MemoryIndexError at limit", async () => {
    mocks.query
      .mockRejectedValueOnce({ status: 503, name: "ServiceUnavailable" })
      .mockRejectedValueOnce({ status: 503, name: "ServiceUnavailable" })
      .mockRejectedValueOnce({ status: 503, name: "ServiceUnavailable" });
    const store = makeStore({ maxRetries: 2 });
    await expect(store.search([0.1], {}, 5)).rejects.toThrow(MemoryIndexError);
    expect(mocks.query).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("health reports healthy when getCollections succeeds", async () => {
    mocks.getCollections.mockResolvedValue({ collections: [] });
    const store = makeStore();
    const h = await store.health();
    expect(h.healthy).toBe(true);
    expect(h.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("health reports unhealthy when getCollections fails", async () => {
    mocks.getCollections.mockRejectedValue(new Error("down"));
    const store = makeStore();
    const h = await store.health();
    expect(h.healthy).toBe(false);
  });

  it("deleteByIds passes ids to the client delete", async () => {
    mocks.delete.mockResolvedValue({ status: "ok" });
    const store = makeStore();
    await store.deleteByIds(["a", "b"]);
    expect(mocks.delete).toHaveBeenCalledWith("jules_memories", {
      points: ["a", "b"],
      wait: true,
    });
  });
});
