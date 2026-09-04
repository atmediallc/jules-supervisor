import { describe, expect, it } from "vitest";
import { defaultLocale, isValidLocale, locales, timeZone } from "../i18n/config";
import { getMessages } from "../i18n/messages";
import { formatDateTime, formatNumber, formatPercent } from "../lib/intl";

describe("i18n config", () => {
  it("declares en and es as the supported locales", () => {
    expect(locales).toEqual(["en", "es"]);
    expect(defaultLocale).toBe("en");
  });

  it("uses a fixed UTC time zone to keep SSR and client markup identical", () => {
    expect(timeZone).toBe("UTC");
  });

  it("recognizes supported locales", () => {
    expect(isValidLocale("en")).toBe(true);
    expect(isValidLocale("es")).toBe(true);
  });

  it("rejects unsupported or malformed locales", () => {
    expect(isValidLocale("fr")).toBe(false);
    expect(isValidLocale("en-US")).toBe(false);
    expect(isValidLocale("")).toBe(false);
    expect(isValidLocale("EN")).toBe(false);
  });
});

describe("getMessages", () => {
  it("returns the requested catalog", () => {
    const es = getMessages("es");
    expect(es["common"]).toBeDefined();
    expect(es["metadata"]).toBeDefined();
  });

  it("falls back to en for an unknown locale", () => {
    expect(getMessages("fr")).toEqual(getMessages("en"));
  });

  it("exposes every namespace on both locales", () => {
    const namespaces = ["common", "login", "overview", "settings", "formatting"];
    for (const ns of namespaces) {
      expect(getMessages("en")[ns]).toBeDefined();
      expect(getMessages("es")[ns]).toBeDefined();
    }
  });
});

describe("locale-aware formatters", () => {
  const d = new Date("2024-03-05T12:34:00Z");

  it("formatDateTime produces the same value for a fixed instant across renderers", () => {
    expect(formatDateTime("en", d.getTime())).toBe(formatDateTime("en", d.toISOString()));
  });

  it("formatNumber groups per locale", () => {
    expect(formatNumber("en", 1234567)).toContain(",");
    expect(formatNumber("es", 1234567)).toContain(".");
  });

  it("formatPercent renders a 0..1 ratio as a percentage", () => {
    expect(formatPercent("en", 0.825)).toBe("83%");
  });
});