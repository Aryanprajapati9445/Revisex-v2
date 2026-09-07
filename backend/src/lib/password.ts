import bcrypt from "bcrypt";
import { env } from "../config/env.js";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// A fixed, unreachable bcrypt hash (cost 10, same as the default salt
// rounds) — used only to burn the same amount of CPU time as a real
// bcrypt.compare when no account/password hash exists. Without this,
// "unknown email" returns near-instantly while "known email, wrong
// password" takes the ~50-100ms bcrypt costs, letting an attacker
// enumerate valid accounts purely from response latency even though the
// response body and status code are already identical.
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8i6JeIcM/vAy1wCd6XWfFxvY1FzwLK";

export async function verifyPasswordTimingSafe(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(plain, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(plain, hash);
}
