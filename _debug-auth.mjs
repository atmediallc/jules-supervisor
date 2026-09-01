import { chromium } from "@playwright/test";
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/login");
  await page.locator('input[type="text"]').fill("admin");
  await page.locator('input[type="password"]').fill("dev_only_password_123");
  await page.getByRole("button", { name: /Sign In/i }).click();
  await page.waitForTimeout(3000);
  console.log("url after signin:", page.url());
  const cookies = await ctx.cookies();
  console.log("cookies:", JSON.stringify(cookies.map(c => ({name: c.name, domain: c.domain, path: c.path, secure: c.secure, session: c.session, httpOnly: c.httpOnly}))));
  const state = await ctx.storageState();
  console.log("storageState cookies count:", state.cookies.length);
  // Now navigate to / with the same context
  await page.goto("http://localhost:3000/");
  console.log("url after goto /:", page.url());
} finally {
  await browser.close();
}
