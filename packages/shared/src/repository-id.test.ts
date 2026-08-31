import { describe, expect, it } from "vitest";
import { isSameRepository, normalizeRepositoryId, REPOSITORY_ID_PATTERN } from "./repository-id.js";

describe("normalizeRepositoryId", () => {
  it("canonicalizes plain owner/repo to lowercase", () => {
    expect(normalizeRepositoryId("Owner/Repo").repositoryId).toBe("owner/repo");
  });

  it("is deterministic and idempotent", () => {
    const first = normalizeRepositoryId("GitHub.com/Org/Project.git").repositoryId;
    const second = normalizeRepositoryId("github.com/org/project").repositoryId;
    expect(first).toBe("org/project");
    expect(first).toBe(second);
  });

  it("parses SSH remote format", () => {
    expect(normalizeRepositoryId("git@github.com:acme/widgets.git").repositoryId).toBe(
      "acme/widgets",
    );
  });

  it("parses https remote with .git suffix", () => {
    expect(normalizeRepositoryId("https://github.com/acme/widgets.git").repositoryId).toBe(
      "acme/widgets",
    );
  });

  it("accepts single leading slash form", () => {
    expect(normalizeRepositoryId("/acme/widgets").repositoryId).toBe("acme/widgets");
  });

  it("strips trailing slash and .git from plain form", () => {
    expect(normalizeRepositoryId("acme/widgets.git/").repositoryId).toBe("acme/widgets");
  });

  it("rejects local Windows paths (isolation guarantee)", () => {
    const result = normalizeRepositoryId("G:\\proyectos\\Jules-Supervisor");
    expect(result.repositoryId).toBeNull();
    expect(result.rejectionReason).toBe("LOCAL_PATH");
  });

  it("rejects UNC paths", () => {
    expect(normalizeRepositoryId("\\\\server\\share\\repo").repositoryId).toBeNull();
  });

  it("rejects file:// URIs", () => {
    expect(normalizeRepositoryId("file:///home/user/repo").repositoryId).toBeNull();
  });

  it("rejects POSIX absolute multi-slash paths", () => {
    expect(normalizeRepositoryId("//home/user/repo").repositoryId).toBeNull();
  });

  it("rejects relative dot paths", () => {
    expect(normalizeRepositoryId("./repo").repositoryId).toBeNull();
    expect(normalizeRepositoryId("~/projects/repo").repositoryId).toBeNull();
  });

  it("rejects unknown placeholder", () => {
    const result = normalizeRepositoryId("unknown/repo");
    expect(result.repositoryId).toBeNull();
    expect(result.rejectionReason).toBe("UNKNOWN_PLACEHOLDER");
  });

  it("rejects missing and empty values", () => {
    expect(normalizeRepositoryId(null).repositoryId).toBeNull();
    expect(normalizeRepositoryId(undefined).repositoryId).toBeNull();
    expect(normalizeRepositoryId("").repositoryId).toBeNull();
    expect(normalizeRepositoryId("   ").repositoryId).toBeNull();
  });

  it("rejects oversized identifiers", () => {
    expect(normalizeRepositoryId("a".repeat(513) + "/repo").repositoryId).toBeNull();
  });

  it("rejects single-segment identifiers", () => {
    expect(normalizeRepositoryId("justaname").repositoryId).toBeNull();
  });

  it("never emits an id that fails the canonical pattern", () => {
    const samples = ["Owner/Repo", "git@github.com:A.B-c/x_y.git", "https://gitlab.com/o/r"];
    for (const s of samples) {
      const id = normalizeRepositoryId(s).repositoryId;
      expect(id).not.toBeNull();
      expect(REPOSITORY_ID_PATTERN.test(id!)).toBe(true);
    }
  });
});

describe("isSameRepository", () => {
  it("matches variants of the same repository", () => {
    expect(isSameRepository("Acme/Widgets", "acme/widgets")).toBe(true);
    expect(isSameRepository("git@github.com:acme/widgets.git", "acme/widgets")).toBe(true);
  });

  it("never matches different repositories", () => {
    expect(isSameRepository("acme/widgets", "acme/gadgets")).toBe(false);
  });

  it("never matches unidentifiable values", () => {
    expect(isSameRepository("unknown/repo", "unknown/repo")).toBe(false);
    expect(isSameRepository("G:\\local\\path", "G:\\local\\path")).toBe(false);
    expect(isSameRepository(null, "acme/widgets")).toBe(false);
  });
});
