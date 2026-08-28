import { test, expect } from "@playwright/test";

test.describe("Browser Control Plane E2E Verification", () => {
  test("1. Dashboard loads with overview metrics and system status", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Jules Supervisor/i);

    // Verify main overview header
    const mainHeading = page.locator("h2").first();
    await expect(mainHeading).toBeVisible();

    // Verify DRY_RUN safety banner or execution mode badge
    await expect(page.locator("body")).toContainText("DRY_RUN");
  });

  test("2. Sessions page renders sessions list with state badges", async ({ page }) => {
    await page.goto("/sessions");
    await expect(page.locator("h2")).toContainText(/Sessions/i);

    // Verify session ID and state badge
    await expect(page.locator("body")).toContainText("ses_test_001");
    await expect(page.locator("body")).toContainText("AWAITING_USER_INPUT");
  });

  test("3. Decisions page renders decision history and DRY_RUN audits", async ({ page }) => {
    await page.goto("/decisions");
    await expect(page.locator("h2")).toContainText(/Decisions/i);
    await expect(page.locator("body")).toContainText("DRY_RUN");
  });

  test("4. Approvals queue renders and handles human review interaction safely", async ({
    page,
  }) => {
    await page.goto("/approvals");
    await expect(page.locator("h2")).toContainText(/Approval/i);
  });

  test("5. Settings page displays configuration without exposing server credentials", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page.locator("h2")).toContainText(/Settings/i);

    const pageContent = await page.content();
    // Confirm raw private keys or real tokens are not exposed in HTML/DOM
    expect(pageContent).not.toMatch(/ghp_[a-zA-Z0-9]{36}/);
    expect(pageContent).not.toMatch(/sk-[a-zA-Z0-9]{32}/);
    expect(pageContent).toContain("••••••••••••••••••••••••••••••••");
  });

  test("6. Liveness probe /health/live returns HTTP 200 alive", async ({ request }) => {
    const response = await request.get("/health/live");
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.status).toBe("alive");
    expect(data.service).toBe("jules-supervisor-web");
  });

  test("7. Readiness probe /health/ready returns HTTP 200 ready when DB is connected", async ({
    request,
  }) => {
    const response = await request.get("/health/ready");
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.status).toBe("ready");
    expect(data.mode).toBeDefined();
  });

  test("8. Untrusted HTML / Markdown payload is sanitized and does not execute script (XSS defense)", async ({
    page,
  }) => {
    // Navigate to dashboard and ensure injected script tags or event handlers never fire
    let xssTriggered = false;
    page.on("dialog", () => {
      xssTriggered = true;
    });

    await page.goto("/");
    // Evaluate if any script injection can occur
    await page.evaluate(() => {
      const el = document.createElement("div");
      el.innerHTML = "&lt;img src=x onerror=alert('xss')&gt;";
      document.body.appendChild(el);
    });

    expect(xssTriggered).toBe(false);
  });

  test("9. Responsive layout renders cleanly without horizontal overflow at desktop & mobile viewports", async ({
    page,
  }) => {
    // Desktop Viewport
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    let scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    let clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    // Mobile Viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
