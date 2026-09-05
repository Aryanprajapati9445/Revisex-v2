import { createHash, randomBytes, randomInt } from "node:crypto";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Zero-padded 6-digit code, e.g. "004821". */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** 32 random bytes as hex — used as the raw (pre-hash) password-reset token. */
export function generateResetToken(): string {
  return randomBytes(32).toString("hex");
}
