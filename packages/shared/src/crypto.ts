import { createHash, randomBytes } from "node:crypto";

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function generateId(prefix = "id"): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export function deterministicHash(obj: unknown): string {
  const jsonStr = JSON.stringify(
    obj,
    Object.keys(
      typeof obj === "object" && obj !== null ? (obj as Record<string, unknown>) : {},
    ).sort(),
  );
  return sha256(jsonStr ?? "");
}
