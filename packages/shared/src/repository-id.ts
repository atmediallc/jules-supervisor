/**
 * Repository identity normalization (P1 Fases 2-4).
 *
 * Deterministic, monotonic mapping from any repository identifier string
 * (Jules session.repository free text) to a canonical repositoryId used as
 * the isolation boundary for cross-session memory.
 *
 * Guarantees:
 * - Same logical repository always maps to the same repositoryId.
 * - Local filesystem paths are NEVER valid repository ids (rejected).
 * - Output is safe for SQL (parameterized anyway) and for log redaction.
 */

/** Max accepted length for a raw repository identifier. */
export const MAX_REPOSITORY_ID_RAW_LENGTH = 512;

/** Canonical form: lowercase "owner/name" with limited charset. */
export const REPOSITORY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;

export interface NormalizedRepositoryId {
  /** Canonical lowercase "owner/name" or null when unidentifiable. */
  repositoryId: string | null;
  /** Original raw value (for diagnostics only; never used as memory key). */
  raw: string;
  /** Reason when repositoryId is null. */
  rejectionReason?: string;
}

/**
 * Heuristics that indicate a local filesystem path rather than a hosted
 * repository identity. Applied BEFORE normalization so a local path can
 * never masquerade as a repository id.
 */
function looksLikeLocalPath(value: string): boolean {
  // Windows drive (C:\..., G:/...)
  if (/^[a-zA-Z]:/.test(value)) return true;
  // UNC paths
  if (/^\\\\/.test(value)) return true;
  // POSIX absolute paths (but allow a single leading "/" for "owner/name" written as "/owner/name")
  if (/^\/{2,}/.test(value)) return true;
  // file:// URI
  if (/^file:/i.test(value)) return true;
  // Common local dev roots that should never be treated as repository identity
  if (/^(\.|~)/.test(value)) return true;
  return false;
}

/**
 * Strips common URL/SSH prefixes used by Git remotes.
 * Returns null when nothing resembling owner/repo can be extracted.
 */
function extractOwnerRepo(value: string): string | null {
  let candidate: string | null = null;

  // git@github.com:owner/repo.git
  const sshMatch = /^[\w.-]+@[\w.-]+:(.+?)\/?$/i.exec(value);
  if (sshMatch) candidate = sshMatch[1] ?? null;

  // https://host/path — take the path part
  if (!candidate) {
    const httpsMatch = /^https?:\/\/[^/]+\/(.+)$/i.exec(value);
    if (httpsMatch) candidate = httpsMatch[1] ?? null;
  }

  // Bare form (possibly "host/owner/repo" or "owner/repo"), with an optional
  // single leading slash (a lone "/" is not treated as a local path).
  if (!candidate) {
    candidate = value.replace(/^\/(?!\/)/, "");
  }

  if (!candidate) return null;

  // Split into segments, strip .git suffix, drop empties.
  const segments = candidate
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (segments.length === 2) return `${segments[0]}/${segments[1]}`;
  // Host-qualified form (github.com/owner/repo, gitlab.com/group/repo, ...):
  // take the final two segments as owner/name.
  if (segments.length >= 3) {
    const last = segments[segments.length - 1]!;
    const secondToLast = segments[segments.length - 2]!;
    // Guard against treating a bare domain as an owner (e.g. "github.com/repo")
    return `${secondToLast}/${last}`;
  }

  return null;
}

/**
 * Normalizes any repository identifier to canonical "owner/name" form.
 * Returns repositoryId = null when the value cannot be safely identified.
 */
export function normalizeRepositoryId(raw: string | null | undefined): NormalizedRepositoryId {
  if (raw === null || raw === undefined) {
    return { repositoryId: null, raw: String(raw), rejectionReason: "MISSING" };
  }
  if (typeof raw !== "string") {
    return { repositoryId: null, raw: String(raw), rejectionReason: "NOT_A_STRING" };
  }
  if (raw.length > MAX_REPOSITORY_ID_RAW_LENGTH) {
    return { repositoryId: null, raw: "oversized", rejectionReason: "TOO_LONG" };
  }

  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "unknown/repo") {
    return { repositoryId: null, raw: trimmed, rejectionReason: "UNKNOWN_PLACEHOLDER" };
  }
  if (looksLikeLocalPath(trimmed)) {
    return { repositoryId: null, raw: trimmed, rejectionReason: "LOCAL_PATH" };
  }

  const ownerRepo = extractOwnerRepo(trimmed);
  if (!ownerRepo) {
    return { repositoryId: null, raw: trimmed, rejectionReason: "UNPARSEABLE" };
  }

  const canonical = ownerRepo.toLowerCase();
  if (!REPOSITORY_ID_PATTERN.test(canonical)) {
    return { repositoryId: null, raw: trimmed, rejectionReason: "INVALID_CHARSET" };
  }

  return { repositoryId: canonical, raw: trimmed };
}

/**
 * Convenience predicate: true when two raw repository identifiers map to the
 * SAME canonical repositoryId (or both are unidentifiable).
 */
export function isSameRepository(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeRepositoryId(a);
  const nb = normalizeRepositoryId(b);
  if (!na.repositoryId || !nb.repositoryId) return false;
  return na.repositoryId === nb.repositoryId;
}
