import { RiskLevel } from "./types.js";

export interface RiskEvaluationContext {
  filesChanged?: string[];
  diff?: string;
  proposedMessage?: string;
  action?: string;
}

const CRITICAL_FILE_PATTERNS = [
  /\.env(\..+)?$/i,
  /migrations\//i,
  /\.github\/workflows\//i,
  /secrets?\//i,
  /auth\//i,
  /billing\//i,
  /crypto\//i,
  /keys?\//i,
];

const DESTRUCTIVE_CODE_PATTERNS = [
  /drop\s+table/i,
  /delete\s+from\s+users/i,
  /truncate\s+table/i,
  /rm\s+-rf\s+[\/~]/i,
  /git\s+push\s+.*--force/i,
  /--no-verify/i,
  /bypass_security/i,
  /chmod\s+777/i,
];

const MEDIUM_RISK_FILE_PATTERNS = [
  /package\.json$/i,
  /pnpm-lock\.yaml$/i,
  /docker-compose/i,
  /Dockerfile/i,
  /infra\//i,
  /api\//i,
];

export function calculateDeterministicRisk(context: RiskEvaluationContext): {
  level: RiskLevel;
  reasons: string[];
} {
  const reasons: string[] = [];
  const files = context.filesChanged ?? [];
  const diff = context.diff ?? "";
  const message = context.proposedMessage ?? "";

  // 1. Check for destructive code or commands
  for (const pattern of DESTRUCTIVE_CODE_PATTERNS) {
    if (pattern.test(diff) || pattern.test(message)) {
      reasons.push(`Contains potentially destructive pattern matching ${pattern.source}`);
      return { level: "critical", reasons };
    }
  }

  // 2. Check for critical sensitive file paths
  for (const file of files) {
    for (const pattern of CRITICAL_FILE_PATTERNS) {
      if (pattern.test(file)) {
        reasons.push(`Touches critical security or migration path: ${file}`);
        return { level: "critical", reasons };
      }
    }
  }

  // 3. Check for medium risk files (manifests, infrastructure, APIs)
  for (const file of files) {
    for (const pattern of MEDIUM_RISK_FILE_PATTERNS) {
      if (pattern.test(file)) {
        reasons.push(`Touches infrastructure or manifest file: ${file}`);
        return { level: "medium", reasons };
      }
    }
  }

  if (files.length > 10) {
    reasons.push(`Touches large number of files (${files.length})`);
    return { level: "medium", reasons };
  }

  return { level: "low", reasons: ["No elevated risk signals detected"] };
}
