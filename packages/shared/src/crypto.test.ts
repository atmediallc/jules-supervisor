import { describe, expect, it } from "vitest";
import { deterministicHash, generateId, sha256 } from "./crypto.js";

describe("crypto helpers", () => {
  it("produces deterministic sha256 hashes", () => {
    const hash1 = sha256("test-payload");
    const hash2 = sha256("test-payload");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it("generates unique IDs with requested prefix", () => {
    const id1 = generateId("dec");
    const id2 = generateId("dec");
    expect(id1.startsWith("dec_")).toBe(true);
    expect(id2.startsWith("dec_")).toBe(true);
    expect(id1).not.toBe(id2);
  });

  it("produces deterministic object hashes regardless of key order", () => {
    const objA = { b: 2, a: 1 };
    const objB = { a: 1, b: 2 };
    expect(deterministicHash(objA)).toBe(deterministicHash(objB));
  });
});
