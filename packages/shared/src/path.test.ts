import { describe, expect, it } from "vitest";
import { isPathContained, normalizeRelativePath, sanitizeHostPaths } from "./path.js";

describe("Cross-Platform Path Portability & Security", () => {
  describe("normalizeRelativePath", () => {
    it("converts Windows drive paths with backslashes to canonical relative POSIX paths", () => {
      expect(
        normalizeRelativePath("G:\\proyectos\\Jules-Supervisor\\packages\\core\\src\\risk.ts"),
      ).toBe("proyectos/Jules-Supervisor/packages/core/src/risk.ts");
      expect(normalizeRelativePath("C:\\Users\\developer\\project\\file.txt")).toBe(
        "Users/developer/project/file.txt",
      );
    });

    it("handles POSIX absolute and relative paths cleanly", () => {
      expect(normalizeRelativePath("/workspace/project/src/index.ts")).toBe(
        "workspace/project/src/index.ts",
      );
      expect(normalizeRelativePath("packages/shared/src/index.ts")).toBe(
        "packages/shared/src/index.ts",
      );
    });

    it("neutralizes traversal dots (.. and .) without escaping root", () => {
      expect(normalizeRelativePath("../../../etc/passwd")).toBe("etc/passwd");
      expect(normalizeRelativePath("src/../dist/./bundle.js")).toBe("dist/bundle.js");
      expect(normalizeRelativePath("..\\..\\Windows\\System32\\calc.exe")).toBe(
        "Windows/System32/calc.exe",
      );
    });
  });

  describe("isPathContained (Path Traversal Containment)", () => {
    const root = "/app/workspace";

    it("allows valid relative subpaths within root directory", () => {
      expect(isPathContained("src/index.ts", root)).toBe(true);
      expect(isPathContained("nested/subfolder/file.json", root)).toBe(true);
      expect(isPathContained(".", root)).toBe(true);
    });

    it("blocks directory traversal attempts escaping the root", () => {
      expect(isPathContained("../../../../etc/passwd", root)).toBe(false);
      expect(isPathContained("..\\..\\..\\Windows\\System32", root)).toBe(false);
      expect(isPathContained("/etc/shadow", root)).toBe(false);
      expect(isPathContained("C:\\Windows\\System32", root)).toBe(false);
      expect(isPathContained("file:///etc/passwd", root)).toBe(false);
    });

    it("rejects null byte injection payloads", () => {
      expect(isPathContained("valid_file.txt\0/../../../etc/passwd", root)).toBe(false);
    });
  });

  describe("sanitizeHostPaths", () => {
    it("redacts Windows absolute paths from stack traces and logs", () => {
      const errorLog =
        "Error at G:\\proyectos\\Jules-Supervisor\\apps\\worker\\src\\pipeline.ts:45:10 in C:\\Users\\developer\\app.js";
      const sanitized = sanitizeHostPaths(errorLog);
      expect(sanitized).not.toContain("G:\\proyectos\\Jules-Supervisor");
      expect(sanitized).not.toContain("C:\\Users\\developer");
      expect(sanitized).toContain("[HOST_PATH]");
    });

    it("redacts POSIX developer home paths", () => {
      const log = "File not found: /home/runner/work/Jules-Supervisor/dist/index.js";
      const sanitized = sanitizeHostPaths(log);
      expect(sanitized).not.toContain("/home/runner/work");
      expect(sanitized).toContain("[HOST_PATH]");
    });
  });
});
