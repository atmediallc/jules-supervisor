import { test as setup, expect } from "@playwright/test";

// Dev-cert credentials — must match the running stack's AUTH_USERNAME/AUTH_PASSWORD.
const AUTH_USER = "admin";
const AUTH_PASS = "dev_only_password_123";
const BASE_URL = "http://localhost:3000";

setup("authenticate as supervisor", async ({ context }) => {
  // HTTP-level login: obtain CSRF token then POST credentials.
  // This reliably sets the session cookie via Set-Cookie headers,
  // unlike client-side signIn() which has SameSite/redirect issues.
  const api = context.request;

  // 1. Get CSRF token
  const csrfResp = await api.get(`${BASE_URL}/api/auth/csrf`);
  const { csrfToken } = await csrfResp.json();

  // 2. POST credentials
  const callbackResp = await api.post(`${BASE_URL}/api/auth/callback/credentials`, {
    form: {
      csrfToken,
      username: AUTH_USER,
      password: AUTH_PASS,
      json: "true",
    },
  });
  expect(callbackResp.status()).toBe(200);

  // 3. Verify session cookie was set by hitting /api/auth/session
  const sessionResp = await api.get(`${BASE_URL}/api/auth/session`);
  const session = await sessionResp.json();
  expect(session.user).toBeDefined();

  // 4. Persist the full cookie state (including httpOnly session cookie)
  //    for the chromium project to reuse.
  await context.storageState({ path: "tests/e2e/.auth/user.json" });
});
