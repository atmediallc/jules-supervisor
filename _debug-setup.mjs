import { chromium } from "@playwright/test";
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // Reproduce auth.setup flow exactly
  await page.goto("http://localhost:3000/sessions");
  console.log("1. /sessions url:", page.url());
  await page.goto("http://localhost:3000/login");
  await page.locator('input[type="text"]').fill("admin");
  await page.locator('input[type="password"]').fill("dev_only_password_123");
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForTimeout(4000);
  console.log("2. after signin url:", page.url());
  console.log("3. sidebar visible:", await page.getByRole("link", { name: "Jules Sessions" }).isVisible().catch(() => false));
  await ctx.storageState({ path: "tests/e2e/.auth/user.json" });
  const saved = JSON.parse(await (await import("node:fs/promises")).readFile("tests/e2e/.auth/user.json", "utf8"));
  console.log("4. saved cookies:", saved.cookies.length, saved.cookies.map(c => c.name));
} finally {
  await browser.close();
}
