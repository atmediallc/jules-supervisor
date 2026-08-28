import path from "node:path";

/**
 * Normalizes any OS path or relative path to a canonical POSIX-style relative path.
 * Strips Windows drive letters (e.g. C:, G:) and leading slashes.
 */
export function normalizeRelativePath(inputPath: string): string {
  if (!inputPath || typeof inputPath !== "string") return "";

  let cleaned = inputPath.trim();

  // Strip file:// prefix if present
  if (cleaned.startsWith("file://")) {
    cleaned = cleaned.slice(7);
  }

  // Strip Windows drive letters like C: or G:
  cleaned = cleaned.replace(/^[a-zA-Z]:[/\\]?/, "");

  // Replace all backslashes with forward slashes
  cleaned = cleaned.replace(/\\/g, "/");

  // Normalize duplicate slashes
  cleaned = cleaned.replace(/\/+/g, "/");

  // Strip leading and trailing slashes
  cleaned = cleaned.replace(/^\/+|\/+$/g, "");

  // Prevent path traversal escapes
  const parts: string[] = [];
  for (const part of cleaned.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      if (parts.length > 0) {
        parts.pop();
      }
    } else {
      parts.push(part);
    }
  }

  return parts.join("/");
}

/**
 * Validates whether a target path resolves strictly inside a given root directory.
 * Defends against path traversal attacks (../../etc/passwd, null bytes, absolute escapes).
 */
export function isPathContained(targetPath: string, rootDir: string): boolean {
  if (!targetPath || !rootDir) return false;
  if (typeof targetPath !== "string" || typeof rootDir !== "string") return false;
  if (targetPath.includes("\0")) return false; // Null byte injection defense

  // Disallow URL schemes (file://, http://, etc.)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(targetPath) && !/^[a-zA-Z]:[/\\]/.test(targetPath)) {
    return false;
  }

  // Canonicalize separators to /
  const posixRoot = rootDir.replace(/\\/g, "/").replace(/\/+$/, "");

  // If target is an absolute path or drive path
  const isTargetAbsolute =
    targetPath.startsWith("/") || targetPath.startsWith("\\") || /^[a-zA-Z]:/.test(targetPath);

  if (isTargetAbsolute) {
    const posixTarget = targetPath.replace(/\\/g, "/").replace(/\/+$/, "");
    return posixTarget === posixRoot || posixTarget.startsWith(`${posixRoot}/`);
  }

  // If relative, check path traversal resolution
  const normalizedRoot = path.resolve(rootDir);
  const normalizedTarget = path.resolve(rootDir, targetPath);

  const rootWithSep = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : `${normalizedRoot}${path.sep}`;
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(rootWithSep);
}

/**
 * Sanitizes stack traces, log messages, and error strings to redact machine-local Windows paths
 * and developer home directory paths into portable identifiers.
 */
export function sanitizeHostPaths(input: string): string {
  if (!input || typeof input !== "string") return "";

  return (
    input
      // Redact Windows absolute drive paths (e.g. G:\proyectos\... or C:\Users\...)
      .replace(/[a-zA-Z]:\\[^ \n\r\t,"'`)\\]+/g, "[HOST_PATH]")
      .replace(/[a-zA-Z]:\/[^ \n\r\t,"'`)/]+/g, "[HOST_PATH]")
      // Redact POSIX home paths like /home/username/
      .replace(/\/home\/[a-zA-Z0-9_-]+\/[^ \n\r\t,"'`)]+/g, "[HOST_PATH]")
  );
}
