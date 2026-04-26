// Server-only AES-256-GCM helpers for storing third-party API tokens.
// Format: base64(iv) + "." + base64(ciphertext+authTag)
import crypto from "node:crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not configured");
  // Accept either a hex (64 chars), base64 (44 chars) or arbitrary string — derive a 32-byte key with sha256.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${Buffer.concat([enc, tag]).toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const [ivB64, dataB64] = payload.split(".");
  if (!ivB64 || !dataB64) throw new Error("Malformed encrypted payload");
  const iv = Buffer.from(ivB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const tag = data.subarray(data.length - 16);
  const enc = data.subarray(0, data.length - 16);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}
