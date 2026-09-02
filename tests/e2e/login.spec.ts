import { test, expect } from "@playwright/test";

// Focused login-page spec. Runs unauthenticated (no storageState) so the
// auth experience is exercised, not the authenticated shell. The dashboard
// redirect target requires a live Postgres, so this suite deliberately stops
// at the redirect boundary — the success path is covered by auth.setup.ts.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Jules Supervisor Login", () => {
  test("1. Login page renders brand experience without authenticated shell nav", async ({
    page,
  }) => {
    await page.goto("/login");

    // Brand panel present on large viewports
    await expect(page.getByText("JULES SUPERVISOR", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Autonomous oversight",
    );
    // Supervision pipeline capability nodes
    await expect(page.getByText("Supervision pipeline")).toBeVisible();

    // Authenticated shell navigation MUST NOT leak into the unauthenticated login
    await expect(page.getByRole("link", { name: "Overview" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Approval Queue" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Audit Trail" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Settings & Providers" })).toHaveCount(0);

    // Login card content
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(
      page.getByText("Sign in to continue to the supervisor control plane."),
    ).toBeVisible();
  });

  test("2. Username and password fields exist with correct autocomplete semantics", async ({
    page,
  }) => {
    await page.goto("/login");
    const username = page.getByRole("textbox", { name: "Username" });
    const password = page.getByRole("textbox", { name: "Password" });
    await expect(username).toBeVisible();
    await expect(password).toBeVisible();
    await expect(username).toHaveAttribute("autocomplete", "username");
    await expect(password).toHaveAttribute("autocomplete", "current-password");
  });

  test("3. Password visibility toggle switches input type and announces state", async ({
    page,
  }) => {
    await page.goto("/login");
    const password = page.getByRole("textbox", { name: "Password" });
    const toggle = page.getByRole("button", { name: "Show password" });

    await expect(password).toHaveAttribute("type", "password");
    await toggle.click();
    // After toggle the input is still the same control (type text) and the
    // button state flips to "Hide password" with aria-pressed=true.
    await expect(password).toHaveAttribute("type", "text");
    await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Toggle back
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(password).toHaveAttribute("type", "password");
  });

  test("4. Invalid credentials show an accessible error and recover", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: "Username" }).fill("admin");
    await page.getByRole("textbox", { name: "Password" }).fill("definitely_wrong_password");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Loading state appears while the credentials callback runs
    await expect(page.getByRole("button", { name: /Signing in/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Signing in/ })).toBeDisabled();

    // Accessible error surfaces, then form recovers to idle state. Note:
    // Next.js injects its own alert-role route announcer, so scope the
    // locator to the visible error alert by its text.
    const error = page.getByRole("alert").filter({
      hasText: "Unable to sign in with those credentials",
    });
    await expect(error).toBeVisible();
    await page.getByRole("button", { name: "Sign in" }).waitFor({ state: "visible" });
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  test("5. Enter key submits the form (keyboard workflow)", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: "Username" }).fill("admin");
    const password = page.getByRole("textbox", { name: "Password" });
    await password.fill("nope");
    await password.press("Enter");

    // Same accessible error path proves the submit fired via keyboard
    await expect(
      page.getByRole("alert").filter({ hasText: "Unable to sign in" }),
    ).toBeVisible();
  });

  test("6. No horizontal overflow on mobile and desktop", async ({ page }) => {
    for (const viewport of [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/login");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    }
  });
});