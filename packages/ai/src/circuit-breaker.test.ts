import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "./circuit-breaker.js";

describe("CircuitBreaker", () => {
  it("starts CLOSED and allows requests", () => {
    const cb = new CircuitBreaker();
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.isAllowed()).toBe(true);
  });

  it("opens after the failure threshold within the window", () => {
    const clock = 0;
    const cb = new CircuitBreaker({ failureThreshold: 3, windowMs: 60_000, now: () => clock });
    expect(cb.onFailure()).toBe(false);
    expect(cb.onFailure()).toBe(false);
    expect(cb.onFailure()).toBe(true); // third failure trips OPEN
    expect(cb.getState()).toBe("OPEN");
    expect(cb.isAllowed()).toBe(false);
  });

  it("success resets the failure window", () => {
    const clock = 0;
    const cb = new CircuitBreaker({ failureThreshold: 3, windowMs: 60_000, now: () => clock });
    cb.onFailure();
    cb.onFailure();
    cb.onSuccess();
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.onFailure()).toBe(false);
    expect(cb.onFailure()).toBe(false);
    expect(cb.onFailure()).toBe(true); // still needs 3 in window
  });

  it("transitions OPEN -> HALF_OPEN after cooldown, and success closes it", () => {
    let clock = 0;
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      windowMs: 60_000,
      cooldownMs: 30_000,
      now: () => clock,
    });
    cb.onFailure();
    cb.onFailure();
    expect(cb.getState()).toBe("OPEN");
    clock = 31_000;
    expect(cb.getState()).toBe("HALF_OPEN");
    expect(cb.isAllowed()).toBe(true); // probe allowed
    cb.onSuccess();
    expect(cb.getState()).toBe("CLOSED");
  });

  it("re-opens when a HALF_OPEN probe fails", () => {
    let clock = 0;
    const cb = new CircuitBreaker({
      failureThreshold: 2,
      windowMs: 60_000,
      cooldownMs: 30_000,
      now: () => clock,
    });
    cb.onFailure();
    cb.onFailure();
    clock = 31_000;
    // probe fails -> re-open
    expect(cb.onFailure()).toBe(true);
    expect(cb.getState()).toBe("OPEN");
    // still cooldown -> not allowed
    clock = 32_000;
    expect(cb.isAllowed()).toBe(false);
  });

  it("reset returns to CLOSED", () => {
    const clock = 0;
    const cb = new CircuitBreaker({ failureThreshold: 2, now: () => clock });
    cb.onFailure();
    cb.onFailure();
    expect(cb.getState()).toBe("OPEN");
    cb.reset();
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.isAllowed()).toBe(true);
  });
});
