import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Phase 10 — PROVIDER_DNS_SSRF_GUARD: PASS
 *
 * These tests prove the asynchronous DNS-resolution guard against DNS-rebinding:
 *  - A public-looking hostname that resolves to a private/reserved IPv4 is blocked.
 *  - A public-looking hostname that resolves to an IPv4-mapped private IPv6 is blocked.
 *  - An explicitly trusted internal host (e.g. omniroute) bypasses DNS resolution.
 *  - Fail-closed: when DNS resolution itself fails, the URL is rejected.
 *  - A hostname that resolves only to public addresses is allowed.
 */

// Mock node:dns/promises so tests are deterministic and need no network.
const lookupMock = vi.fn();
vi.mock("node:dns/promises", () => ({
  default: { lookup: (...args: unknown[]) => lookupMock(...args) },
}));

import { validateProviderUrlWithDns } from "./ssrf-guard.js";

describe("Provider DNS SSRF Guard (DNS rebinding protection)", () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it("blocks a public hostname that resolves to a private IPv4 (169.254.169.254)", async () => {
    lookupMock.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    const result = await validateProviderUrlWithDns("https://evil.example.com/v1");
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/rebinding|private/i);
  });

  it("blocks a public hostname that resolves to link-local IPv4 127.0.0.1", async () => {
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const result = await validateProviderUrlWithDns("https://rebind.attacker.io/v1");
    expect(result.isValid).toBe(false);
  });

  it("blocks an IPv4-mapped IPv6 resolution to a private target", async () => {
    lookupMock.mockResolvedValue([{ address: "::ffff:10.0.0.1", family: 6 }]);
    const result = await validateProviderUrlWithDns("https://mapped.victim.example/v1");
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/private|rebinding/i);
  });

  it("fails closed when DNS lookup throws", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
    const result = await validateProviderUrlWithDns("https://no-such-host.invalid/v1");
    expect(result.isValid).toBe(false);
    expect(result.reason).toMatch(/fail-closed|resolution failed/i);
  });

  it("trusted internal host bypasses DNS resolution entirely", async () => {
    lookupMock.mockImplementation(() => {
      throw new Error("should not be called");
    });
    const result = await validateProviderUrlWithDns("http://omniroute:8080/v1", {
      allowInsecureLocal: true,
      trustedInternalHosts: ["omniroute"],
    });
    expect(result.isValid).toBe(true);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("allows a hostname that resolves only to public addresses", async () => {
    lookupMock.mockResolvedValue([
      { address: "104.18.24.7", family: 4 },
      { address: "104.18.25.7", family: 4 },
    ]);
    const result = await validateProviderUrlWithDns("https://api.openai.com/v1");
    expect(result.isValid).toBe(true);
  });

  it("rejects when ANY resolved address is private (mixed resolution)", async () => {
    lookupMock.mockResolvedValue([
      { address: "104.18.24.7", family: 4 },
      { address: "192.168.1.5", family: 4 },
    ]);
    const result = await validateProviderUrlWithDns("https://mix.example.com/v1");
    expect(result.isValid).toBe(false);
  });
});
