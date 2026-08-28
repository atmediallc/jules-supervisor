import { describe, expect, it } from "vitest";
import { validateProviderUrl, validateProviderUrlWithDns } from "./ssrf-guard.js";

describe("Comprehensive SSRF Guard & Security Verification", () => {
  describe("Cloud Metadata and Internal Endpoints", () => {
    it("blocks cloud metadata IP 169.254.169.254", () => {
      const result = validateProviderUrl("http://169.254.169.254/latest/meta-data/");
      expect(result.isValid).toBe(false);
      expect(result.reason).toMatch(/metadata|blocked/i);
    });

    it("blocks metadata.google.internal hostname", () => {
      const result = validateProviderUrl("http://metadata.google.internal/computeMetadata/v1/");
      expect(result.isValid).toBe(false);
      expect(result.reason).toMatch(/metadata/i);
    });

    it("blocks instance-data hostname", () => {
      const result = validateProviderUrl("http://instance-data/latest/meta-data/");
      expect(result.isValid).toBe(false);
    });

    it("blocks Alibaba metadata IP 100.100.100.200", () => {
      const result = validateProviderUrl("http://100.100.100.200/latest/meta-data/");
      expect(result.isValid).toBe(false);
    });
  });

  describe("URL Credentials & Scheme Validation", () => {
    it("rejects URLs with embedded credentials", () => {
      const result = validateProviderUrl("https://admin:secret@api.openai.com/v1");
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("forbidden");
    });

    it("rejects unsupported protocols (ftp, file, gopher)", () => {
      expect(validateProviderUrl("ftp://api.openai.com/v1").isValid).toBe(false);
      expect(validateProviderUrl("file:///etc/passwd").isValid).toBe(false);
      expect(validateProviderUrl("gopher://127.0.0.1:70/").isValid).toBe(false);
    });
  });

  describe("IPv4 Ranges & Alternate Representations", () => {
    it("blocks private IPv4 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)", () => {
      expect(validateProviderUrl("http://10.0.0.1/v1").isValid).toBe(false);
      expect(validateProviderUrl("http://172.16.0.1/v1").isValid).toBe(false);
      expect(validateProviderUrl("http://172.31.255.254/v1").isValid).toBe(false);
      expect(validateProviderUrl("http://192.168.1.1/v1").isValid).toBe(false);
    });

    it("blocks loopback 127.0.0.0/8 by default without allowInsecureLocal", () => {
      expect(validateProviderUrl("http://127.0.0.1/v1").isValid).toBe(false);
      expect(validateProviderUrl("http://127.1.2.3/v1").isValid).toBe(false);
    });

    it("blocks 0.0.0.0/8 and broadcast", () => {
      expect(validateProviderUrl("http://0.0.0.0/v1").isValid).toBe(false);
      expect(validateProviderUrl("http://255.255.255.255/v1").isValid).toBe(false);
    });

    it("blocks hex and octal IP representations for loopback/private", () => {
      // 0x7f000001 = 127.0.0.1
      expect(validateProviderUrl("http://0x7f000001/v1").isValid).toBe(false);
      // 0177.0.0.1 = 127.0.0.1 in octal
      expect(validateProviderUrl("http://0177.0.0.1/v1").isValid).toBe(false);
      // 2130706433 = 127.0.0.1 in decimal integer
      expect(validateProviderUrl("http://2130706433/v1").isValid).toBe(false);
      // 0xa000001 = 10.0.0.1
      expect(validateProviderUrl("http://0xa000001/v1").isValid).toBe(false);
    });
  });

  describe("IPv6 Ranges & Mapped IPv4", () => {
    it("blocks IPv6 loopback [::1]", () => {
      expect(validateProviderUrl("http://[::1]/v1").isValid).toBe(false);
    });

    it("blocks IPv6 unique-local (fc00::/7) and link-local (fe80::/10)", () => {
      expect(validateProviderUrl("http://[fe80::1]/v1").isValid).toBe(false);
      expect(validateProviderUrl("http://[fc00::1]/v1").isValid).toBe(false);
      expect(validateProviderUrl("http://[fd12:3456:789a::1]/v1").isValid).toBe(false);
    });

    it("blocks IPv4-mapped IPv6 addresses for private targets", () => {
      expect(validateProviderUrl("http://[::ffff:127.0.0.1]/v1").isValid).toBe(false);
      expect(validateProviderUrl("http://[::ffff:169.254.169.254]/v1").isValid).toBe(false);
      expect(validateProviderUrl("http://[::ffff:10.0.0.1]/v1").isValid).toBe(false);
    });
  });

  describe("Allowlisting & Insecure Local Mode", () => {
    it("allows standard public HTTPS endpoints", () => {
      const result = validateProviderUrl("https://api.openai.com/v1");
      expect(result.isValid).toBe(true);
    });

    it("allows localhost when allowInsecureLocal is explicitly true", () => {
      const result = validateProviderUrl("http://localhost:11434/v1", {
        allowInsecureLocal: true,
        trustedInternalHosts: ["localhost"],
      });
      expect(result.isValid).toBe(true);
    });

    it("allows explicitly configured trusted local hosts (e.g. omniroute)", () => {
      const result = validateProviderUrl("http://omniroute:8080/v1", {
        allowInsecureLocal: true,
        trustedInternalHosts: ["omniroute"],
      });
      expect(result.isValid).toBe(true);
    });

    it("fails closed on malformed URLs", () => {
      expect(validateProviderUrl("not-a-url").isValid).toBe(false);
      expect(validateProviderUrl("").isValid).toBe(false);
    });
  });

  describe("validateProviderUrlWithDns", () => {
    it("passes for trusted localhost without requiring external DNS", async () => {
      const result = await validateProviderUrlWithDns("http://localhost:3000/v1", {
        allowInsecureLocal: true,
        trustedInternalHosts: ["localhost"],
      });
      expect(result.isValid).toBe(true);
    });
  });
});
