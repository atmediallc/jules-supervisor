import { chromium } from "@playwright/test";
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ storageState: "tests/e2e/.auth/user.json" });
  const page = await ctx.newPage();
  console.log("storageState loaded, cookies:", (await ctx.cookies()).length);
  try {
    await page.goto("http://localhost:3000/", { waitUntil: "load", timeout: 15000 });
    console.log("url:", page.url());
  } catch (e) {
    console.log("goto failed:", e.message.split("\n")[0]);
  }
} finally {
  await browser.close();
}
