import { describe, expect, it, vi } from "vitest";
import { AiMemoryRepository } from "@jules/db";
import {
  markStaleMemories,
  expireMemories,
  ConsolidationConfig,
} from "./memory-consolidation.js";

const config: ConsolidationConfig = {
  staleDays: 90,
  batchSize: 100,
  promoteRepeatThreshold: 3,
  archiveLowValueAfterDays: 30,
  embeddingModel: "test-model",
};

function makeRepoMock() {
  return {
    expireOverdue: vi.fn().mockResolvedValue(3),
    findPotentiallyStale: vi.fn().mockResolvedValue([
      { id: "mem_1", status: "active" },
      { id: "mem_2", status: "active" },
    ]),
    update: vi.fn().mockResolvedValue({}),
    listPendingEmbeddings: vi.fn().mockResolvedValue([]),
    listActiveForRepository: vi.fn().mockResolvedValue([]),
    list: vi.fn().mockResolvedValue([]),
    archive: vi.fn().mockResolvedValue({}),
    findById: vi.fn(),
    markEmbeddingIndexed: vi.fn().mockResolvedValue(undefined),
  } as unknown as AiMemoryRepository;
}

describe("expireMemories", () => {
  it("expires overdue memories and returns the count", async () => {
    const repo = makeRepoMock();
    const count = await expireMemories(repo, config);
    expect(repo.expireOverdue).toHaveBeenCalled();
    expect(count).toBe(3);
  });
});

describe("markStaleMemories", () => {
  it("marks only active memories as stale", async () => {
    const repo = makeRepoMock();
    const count = await markStaleMemories(repo, config);
    expect(repo.findPotentiallyStale).toHaveBeenCalledWith("*", 90, 100);
    expect(repo.update).toHaveBeenCalledTimes(2);
    expect(repo.update).toHaveBeenCalledWith("mem_1", expect.objectContaining({ status: "stale" }));
    expect(count).toBe(2);
  });

  it("skips non-active memories", async () => {
    const repo = makeRepoMock();
    repo.findPotentiallyStale = vi.fn().mockResolvedValue([
      { id: "mem_1", status: "archived" },
      { id: "mem_2", status: "active" },
    ]) as unknown as typeof repo.findPotentiallyStale;
    const count = await markStaleMemories(repo, config);
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(count).toBe(1);
  });
});
