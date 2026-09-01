import { chromium } from "@playwright/test";
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/login");
  await page.locator('input[type="text"]').fill("admin");
  await page.locator('input[type="password"]').fill("dev_only_password_123");
  await page.getByRole("button", { name: /Sign In/i }).click();
  // poll cookies for 10s
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);
    const cookies = await ctx.cookies();
    const names = cookies.map(c => c.name).join(",");
    console.log(`t+${i+1}s cookies: [${names}]`);
    if (names.includes("next-auth.session-token")) break;
  }
} finally {
  await browser.close();
}
