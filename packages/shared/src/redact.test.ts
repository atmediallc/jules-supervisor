import { describe, expect, it } from "vitest";
import { redactSensitiveData, sanitizeForLogs } from "./redact.js";

describe("redactSensitiveData and sanitizeForLogs", () => {
  it("redacts GitHub tokens", () => {
    const raw = "Authorization: ghp_1234567890abcdefghijklmnopqrstuvwxyz123456";
    expect(redactSensitiveData(raw)).not.toContain("1234567890abcdef");
    expect(redactSensitiveData(raw)).toContain("[REDACTED]");
  });

  it("redacts OpenAI api keys", () => {
    const raw = "AI client initialized with key sk-abcdef1234567890abcdef12345678901234";
    expect(redactSensitiveData(raw)).toBe("AI client initialized with key [REDACTED]");
  });

  it("redacts PostgreSQL and generic URL credentials", () => {
    const raw = "DATABASE_URL=postgresql://jules_admin:SuperSecretPass123!@db.internal:5432/db";
    const redacted = redactSensitiveData(raw);
    expect(redacted).not.toContain("SuperSecretPass123!");
    expect(redacted).toContain("[REDACTED]");

    const httpUrl = "https://admin:mySecretPassword@api.example.com/data";
    expect(redactSensitiveData(httpUrl)).not.toContain("mySecretPassword");
  });

  it("redacts multiline PEM private keys", () => {
    const pem = `
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y1234567890abcdefghijklmnopqrstuvwxyz
ABCDEF1234567890abcdefghijklmnopqrstuvwxyz
-----END RSA PRIVATE KEY-----
`;
    const redacted = redactSensitiveData(pem);
    expect(redacted).not.toContain("MIIEowIBAAKCAQEA0Y");
    expect(redacted).toContain("[REDACTED]");
  });

  it("sanitizes Error objects including message and stack", () => {
    const error = new Error("Failed to connect with sk-1234567890abcdef1234567890abcdef");
    const sanitized = sanitizeForLogs(error);
    expect(sanitized.message).not.toContain("sk-1234567890abcdef");
    expect(sanitized.message).toContain("[REDACTED]");
  });

  it("sanitizes nested object keys containing secret or password", () => {
    const obj = {
      user: "alice",
      authPayload: {
        apiKey: "raw-secret-key-123",
        nested: {
          clientPassword: "password999",
          token: "jwt.token.here",
        },
      },
    };
    const sanitized = sanitizeForLogs(obj);
    expect(sanitized.authPayload.apiKey).toBe("[REDACTED]");
    expect(sanitized.authPayload.nested.clientPassword).toBe("[REDACTED]");
    expect(sanitized.authPayload.nested.token).toBe("[REDACTED]");
    expect(sanitized.user).toBe("alice");
  });

  it("handles circular references gracefully without stack overflow", () => {
    const circularObj: Record<string, unknown> = { name: "test", secretKey: "12345678" };
    circularObj["self"] = circularObj;

    const sanitized = sanitizeForLogs(circularObj) as Record<string, unknown>;
    expect(sanitized["name"]).toBe("test");
    expect(sanitized["secretKey"]).toBe("[REDACTED]");
    expect(sanitized["self"]).toBe("[CIRCULAR]");
  });
});
