import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";
import {
  clientIpFromHeaders,
  isRateLimited,
  rateLimitKey,
} from "./lib/rate-limit";

const authMiddleware = withAuth({
  callbacks: {
    authorized: ({ token }) => !!token,
  },
  pages: {
    signIn: "/login",
  },
});

export default function middleware(
  req: NextRequest,
  event: Parameters<typeof authMiddleware>[1],
) {
  const path = req.nextUrl.pathname;
  const ip = clientIpFromHeaders(req.headers);

  // Brute-force protection: throttle the credentials callback (10 attempts/min
  // per IP). Rate limiting is applied BEFORE the NextAuth flow, so repeated
  // failed logins cannot hammer the callback. The /login page itself is NOT
  // rate-limited: redirecting it to /login?error=... would re-enter middleware
  // and loop forever on a rate-limited IP.
  if (path === "/api/auth/callback/credentials") {
    if (isRateLimited(rateLimitKey("auth", ip), "auth")) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait before trying again." },
        { status: 429 },
      );
    }
  }

  // General API rate limit (everything except NextAuth internals).
  if (path.startsWith("/api/") && !path.startsWith("/api/auth")) {
    if (isRateLimited(rateLimitKey("api", ip), "api")) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429 },
      );
    }

    // Liveness/readiness/metrics endpoints stay PUBLIC (unauthenticated) so
    // orchestrators and container healthchecks can reach them without a token.
    if (
      path === "/api/health" ||
      path === "/api/ready" ||
      path === "/api/metrics" ||
      path === "/api/events"
    ) {
      return NextResponse.next();
    }
  }

  // Delegate everything else (including /api/auth/* passthrough) to NextAuth.
  return authMiddleware(req as Parameters<typeof authMiddleware>[0], event);
}

export const config = {
  // Protect everything except static assets. Note: unlike the previous
  // matcher, /api/auth is INCLUDED so the credentials callback can be rate
  // limited; withAuth passes NextAuth's own endpoints through untouched.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};