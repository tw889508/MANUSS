import crypto from "crypto";
import { ENV } from "./_core/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Derive a 32-byte key from JWT_SECRET using SHA-256.
 */
function getKey(): Buffer {
  const secret = ENV.cookieSecret || "fallback-secret-key-for-dev";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a plaintext string. Returns a hex-encoded string containing IV + tag + ciphertext.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  // Format: iv (hex) + tag (hex) + ciphertext (hex)
  return iv.toString("hex") + tag.toString("hex") + encrypted;
}

/**
 * Decrypt a hex-encoded string produced by encrypt().
 */
export function decrypt(encryptedHex: string): string {
  const key = getKey();

  const ivHex = encryptedHex.slice(0, IV_LENGTH * 2);
  const tagHex = encryptedHex.slice(IV_LENGTH * 2, IV_LENGTH * 2 + TAG_LENGTH * 2);
  const ciphertextHex = encryptedHex.slice(IV_LENGTH * 2 + TAG_LENGTH * 2);

  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
