import { sanitizeForLogs } from "@jules/shared";

/**
 * Sanitized error logger for Next.js API routes. Prevents stack traces,
 * database driver internals, and request data from leaking into structured
 * logs — only a truncated, sanitized string representation is emitted.
 *
 * Usage:
 *   } catch (err) {
 *     logRouteError("GET /api/knowledge", err);
 *     return Response.json({ error: "Internal server error" }, { status: 500 });
 *   }
 */
export function logRouteError(route: string, err: unknown): void {
  console.error(`[${route}]`, sanitizeForLogs(String(err)).slice(0, 500));
}
