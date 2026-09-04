import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/**
 * AES-256-GCM secret encryption for the system_settings table.
 *
 * Secrets (isSecret=true rows) are encrypted at rest using AES-256-GCM with a
 * random 96-bit IV per ciphertext. The encryption key is derived (SHA-256) from
 * the SETTINGS_ENCRYPTION_KEY environment variable.
 *
 * Wire format:   enc:v1:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>
 *
 * Backward compatibility:
 *   - Values without the "enc:v1:" prefix are treated as already-plaintext
 *     (legacy rows written before encryption, or non-secret values) and pass
 *     through decrypt() unchanged.
 *   - If SETTINGS_ENCRYPTION_KEY is not configured, encrypt() stores the value
 *     in plaintext (so a deployment without the key does not corrupt existing
 *     data) — but a warning is surfaced so operators know encryption is off.
 */

const PREFIX = "enc:v1:";

function deriveKey(secret: string): Buffer {
  // 32 bytes for AES-256.
  return createHash("sha256").update(secret, "utf8").digest();
}

function getEncryptionKey(): string | null {
  const key = process.env.SETTINGS_ENCRYPTION_KEY;
  return key && key.length > 0 ? key : null;
}

/** Returns true when a configured encryption key exists (encryption is active). */
export function isSecretEncryptionEnabled(): boolean {
  return getEncryptionKey() !== null;
}

/**
 * Encrypts a secret value for storage. When encryption is not configured, the
 * value is returned unchanged (plaintext) for backward compatibility.
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) {
    return plaintext;
  }
  const derived = deriveKey(key);
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv("aes-256-gcm", derived, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // PREFIX already ends with ":" — join only the three payload segments so the
  // result is "enc:v1:<iv>:<tag>:<data>" (exactly 3 payload parts on decrypt).
  return PREFIX + [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

/**
 * Decrypts a stored secret value. Values that are not in the encrypted wire
 * format (legacy plaintext / non-secret) are returned unchanged.
 */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) {
    return stored;
  }
  const key = getEncryptionKey();
  if (!key) {
    // Cannot decrypt without a key — surface the marker so callers can tell
    // this is an undecryptable value rather than silently returning garbage.
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY is not configured; cannot decrypt stored secret",
    );
  }
  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted secret value");
  }
  const [ivB64, tagB64, dataB64] = parts;
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted secret value");
  }
  const derived = deriveKey(key);
  const decipher = createDecipheriv("aes-256-gcm", derived, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
