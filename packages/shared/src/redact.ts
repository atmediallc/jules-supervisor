const SENSITIVE_PATTERNS: RegExp[] = [
  // Multiline PEM private keys
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi,
  // Key-value pairs with sensitive keys
  /(?:api[_-]?key|secret|token|password|auth|authorization|private[_-]?key)\s*[:=]\s*["']?([a-zA-Z0-9_\-.~+/=]{8,})["']?/gi,
  // Bearer tokens
  /bearer\s+([a-zA-Z0-9_\-\.]+)/gi,
  // GitHub tokens (ghp, gho, ghu, ghs, ghr, github_pat)
  /(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9_]{36,255}/g,
  /github_pat_[a-zA-Z0-9_]{82}/g,
  // OpenAI API keys
  /sk-[a-zA-Z0-9]{32,}/g,
  // Slack tokens
  /xox[baprs]-[0-9a-zA-Z-]{10,}/g,
  // Google API keys
  /AIza[0-9A-Za-z\-_]{35}/g,
  // Generic Database & URL credentials (postgres://user:pass@host, http://user:pass@host)
  /[a-zA-Z0-9+.-]+:\/\/[^:]+:([^@\s/]+)@/g,
];

export function redactSensitiveData(input: string): string {
  if (!input || typeof input !== "string") return input;
  let result = input;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, (match, captured) => {
      if (captured && typeof captured === "string") {
        return match.replace(captured, "[REDACTED]");
      }
      return "[REDACTED]";
    });
  }
  return result;
}

export function sanitizeForLogs<T>(obj: T, seen = new WeakSet<object>()): T {
  if (!obj || typeof obj !== "object") {
    if (typeof obj === "string") return redactSensitiveData(obj) as unknown as T;
    return obj;
  }

  // Handle Error instances specifically
  if (obj instanceof Error) {
    const sanitizedError: Record<string, unknown> = {
      name: obj.name,
      message: redactSensitiveData(obj.message),
      stack: obj.stack ? redactSensitiveData(obj.stack) : undefined,
    };
    for (const [key, value] of Object.entries(obj)) {
      sanitizedError[key] = sanitizeForLogs(value, seen);
    }
    return sanitizedError as unknown as T;
  }

  // Prevent circular references
  if (seen.has(obj)) {
    return "[CIRCULAR]" as unknown as T;
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForLogs(item, seen)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    const isSensitiveKey =
      lowerKey.includes("key") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("token") ||
      lowerKey.includes("password") ||
      lowerKey.includes("credential") ||
      lowerKey === "auth" ||
      lowerKey === "authorization";

    if (typeof value === "object" && value !== null) {
      result[key] = sanitizeForLogs(value, seen);
    } else if (isSensitiveKey) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "string") {
      result[key] = redactSensitiveData(value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}
