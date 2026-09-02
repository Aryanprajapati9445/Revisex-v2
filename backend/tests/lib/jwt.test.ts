import { describe, expect, it } from "vitest";
import {
  signAccessToken,
  signRefreshToken,
  signTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
} from "../../src/lib/jwt.js";

const payload = { sub: "11111111-1111-1111-1111-111111111111", role: "student" as const, program_id: null, branch_id: "22222222-2222-2222-2222-222222222222" };

describe("jwt", () => {
  it("round-trips an access token", () => {
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.role).toBe(payload.role);
    expect(decoded.branch_id).toBe(payload.branch_id);
  });

  it("round-trips a refresh token", () => {
    const token = signRefreshToken(payload);
    const decoded = verifyRefreshToken(token);
    expect(decoded.sub).toBe(payload.sub);
  });

  it("rejects an access token verified as a refresh token (different secrets)", () => {
    const token = signAccessToken(payload);
    expect(() => verifyRefreshToken(token)).toThrow();
  });

  it("signTokenPair returns both tokens", () => {
    const pair = signTokenPair(payload);
    expect(typeof pair.accessToken).toBe("string");
    expect(typeof pair.refreshToken).toBe("string");
    expect(pair.accessToken).not.toBe(pair.refreshToken);
  });
});
