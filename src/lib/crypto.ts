import crypto from "crypto";

// Symmetric encryption for secrets stored at rest (e.g. api_modules.key_encrypted).
// Requires a 32-byte key in API_ENCRYPTION_KEY (e.g. `openssl rand -hex 32`).
function getKey(): Buffer {
  const raw = process.env.API_ENCRYPTION_KEY;
  if (!raw) throw new Error("API_ENCRYPTION_KEY is not set — required to store/read API module keys.");
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) throw new Error("API_ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars).");
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}
