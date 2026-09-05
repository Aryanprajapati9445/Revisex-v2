import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { pool } from "../../src/config/db.js";
import { signOAuthPending } from "../../src/lib/jwt.js";
import { truncateAll } from "../helpers/db.js";
import { createBranch, createProgram, createUserFixture } from "../helpers/fixtures.js";

const { mailerMock } = vi.hoisted(() => ({ mailerMock: vi.fn(async () => undefined) }));
vi.mock("../../src/lib/mailer.js", () => ({ sendMail: mailerMock }));

const app = createApp();

beforeEach(async () => {
  await truncateAll();
  mailerMock.mockClear();
});

afterAll(async () => {
  await pool.end();
});

describe("POST /api/auth/register", () => {
  it("creates an unverified student account and does not return tokens", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);

    const res = await request(app).post("/api/auth/register").send({
      email: "student@test.edu",
      password: "password123",
      full_name: "Test Student",
      branch_id: branch.id,
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.role).toBe("student");
    expect(res.body.data.user.email_verified).toBe(false);
    expect(res.body.data.needsVerification).toBe(true);
    expect(res.body.data).not.toHaveProperty("accessToken");
    expect(res.body.data).not.toHaveProperty("refreshToken");
  });

  it("rejects a duplicate VERIFIED email with 409", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({ role: "student", branchId: branch.id, email: "dupe@test.edu", emailVerified: true });

    const res = await request(app).post("/api/auth/register").send({
      email: "dupe@test.edu",
      password: "password123",
      full_name: "Another Student",
      branch_id: branch.id,
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("replaces an existing UNVERIFIED row instead of 409ing", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user: first } = await createUserFixture({
      role: "student",
      branchId: branch.id,
      email: "stuck@test.edu",
      emailVerified: false,
    });

    const res = await request(app).post("/api/auth/register").send({
      email: "stuck@test.edu",
      password: "newpassword123",
      full_name: "Retry Student",
      branch_id: branch.id,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.user.id).toBe(first.id);
    expect(res.body.data.user.full_name).toBe("Retry Student");
  });

  it("rejects an invalid body with 422", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "not-an-email" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/auth/verify-email", () => {
  async function registerAndGetOtp(email: string) {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await request(app)
      .post("/api/auth/register")
      .send({ email, password: "password123", full_name: "Verifier", branch_id: branch.id });
    const { rows } = await pool.query<{ code_hash: string }>(
      `SELECT eo.code_hash FROM email_otps eo JOIN users u ON u.id = eo.user_id WHERE u.email = $1`,
      [email]
    );
    return rows[0]!.code_hash;
  }

  it("verifies with the correct code and returns tokens", async () => {
    const email = "verify-ok@test.edu";
    await registerAndGetOtp(email);
    const code = mailerMock.mock.calls.at(-1)![0].html.match(/(\d{6})/)![1];

    const res = await request(app).post("/api/auth/verify-email").send({ email, code });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email_verified).toBe(true);
    expect(typeof res.body.data.accessToken).toBe("string");
  });

  it("rejects a wrong code with 401 and increments attempts", async () => {
    const email = "verify-wrong@test.edu";
    await registerAndGetOtp(email);

    const res = await request(app).post("/api/auth/verify-email").send({ email, code: "000000" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CODE");
  });

  it("locks out after 5 wrong attempts with 429", async () => {
    const email = "verify-lockout@test.edu";
    await registerAndGetOtp(email);

    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/auth/verify-email").send({ email, code: "000000" });
    }
    const res = await request(app).post("/api/auth/verify-email").send({ email, code: "000000" });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("TOO_MANY_ATTEMPTS");
  });

  it("rejects an expired code with 410", async () => {
    const email = "verify-expired@test.edu";
    await registerAndGetOtp(email);
    await pool.query(
      `UPDATE email_otps SET expires_at = now() - interval '1 minute'
       WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [email]
    );
    const code = mailerMock.mock.calls.at(-1)![0].html.match(/(\d{6})/)![1];

    const res = await request(app).post("/api/auth/verify-email").send({ email, code });

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("OTP_EXPIRED");
  });
});

describe("POST /api/auth/resend-otp", () => {
  it("issues a new code after the cooldown", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const email = "resend@test.edu";
    await request(app)
      .post("/api/auth/register")
      .send({ email, password: "password123", full_name: "Resender", branch_id: branch.id });

    await pool.query(
      `UPDATE email_otps SET created_at = now() - interval '2 minutes'
       WHERE user_id = (SELECT id FROM users WHERE email = $1)`,
      [email]
    );

    const res = await request(app).post("/api/auth/resend-otp").send({ email });
    expect(res.status).toBe(200);

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM email_otps eo JOIN users u ON u.id = eo.user_id WHERE u.email = $1`,
      [email]
    );
    expect(rows[0].n).toBe(2);
  });

  it("rate-limits a resend within 60s with 429", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const email = "resend-fast@test.edu";
    await request(app)
      .post("/api/auth/register")
      .send({ email, password: "password123", full_name: "Fast Resender", branch_id: branch.id });

    const res = await request(app).post("/api/auth/resend-otp").send({ email });

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });

  it("returns 200 for an unknown email without sending anything (no enumeration)", async () => {
    const res = await request(app).post("/api/auth/resend-otp").send({ email: "nobody@test.edu" });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/auth/login — verification gate", () => {
  it("rejects login for an unverified account with 403", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({
      role: "student",
      branchId: branch.id,
      email: "unverified@test.edu",
      password: "password123",
      emailVerified: false,
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "unverified@test.edu", password: "password123" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });
});

describe("POST /api/auth/forgot-password", () => {
  it("sends a reset email for an existing password account", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({ role: "student", branchId: branch.id, email: "forgot@test.edu", emailVerified: true });

    const res = await request(app).post("/api/auth/forgot-password").send({ email: "forgot@test.edu" });

    expect(res.status).toBe(200);
    expect(mailerMock).toHaveBeenCalledTimes(1);
    expect(mailerMock.mock.calls[0][0].to).toBe("forgot@test.edu");
  });

  it("returns 200 without sending anything for an unknown email", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({ email: "nobody@test.edu" });
    expect(res.status).toBe(200);
    expect(mailerMock).not.toHaveBeenCalled();
  });

  it("returns 200 without sending anything for a password-less (OAuth-only) account", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await pool.query(
      `INSERT INTO users (email, full_name, auth_provider, provider_user_id, role, branch_id, email_verified)
       VALUES ('oauth-only@test.edu', 'OAuth User', 'google', 'google-sub-1', 'student', $1, true)`,
      [branch.id]
    );

    const res = await request(app).post("/api/auth/forgot-password").send({ email: "oauth-only@test.edu" });
    expect(res.status).toBe(200);
    expect(mailerMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/reset-password", () => {
  async function requestResetAndGetToken(email: string) {
    await request(app).post("/api/auth/forgot-password").send({ email });
    const html = mailerMock.mock.calls.at(-1)![0].html as string;
    return html.match(/token=([a-f0-9]+)/)![1];
  }

  it("resets the password with a valid token", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({ role: "student", branchId: branch.id, email: "reset@test.edu", emailVerified: true });

    const token = await requestResetAndGetToken("reset@test.edu");
    const res = await request(app).post("/api/auth/reset-password").send({ token, password: "newpassword456" });
    expect(res.status).toBe(200);

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "reset@test.edu", password: "newpassword456" });
    expect(loginRes.status).toBe(200);
  });

  it("rejects a reused token with 410 TOKEN_USED", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({ role: "student", branchId: branch.id, email: "reuse@test.edu", emailVerified: true });
    const token = await requestResetAndGetToken("reuse@test.edu");

    await request(app).post("/api/auth/reset-password").send({ token, password: "firstchange1" });
    const res = await request(app).post("/api/auth/reset-password").send({ token, password: "secondchange1" });

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("TOKEN_USED");
  });

  it("rejects an expired token with 410 TOKEN_EXPIRED", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({ role: "student", branchId: branch.id, email: "expired@test.edu", emailVerified: true });
    const token = await requestResetAndGetToken("expired@test.edu");
    await pool.query(`UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'`);

    const res = await request(app).post("/api/auth/reset-password").send({ token, password: "wontwork123" });

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
  });

  it("rejects an unknown token with 400 INVALID_TOKEN", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "not-a-real-token", password: "wontwork123" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user } = await createUserFixture({
      role: "student",
      branchId: branch.id,
      email: "login@test.edu",
      password: "correctpassword",
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "login@test.edu",
      password: "correctpassword",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(user.id);
    expect(typeof res.body.data.accessToken).toBe("string");
  });

  it("rejects a wrong password with 401", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({ role: "student", branchId: branch.id, email: "wrong@test.edu", password: "rightpass" });

    const res = await request(app).post("/api/auth/login").send({ email: "wrong@test.edu", password: "wrongpass" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects an unknown email with 401 (not 404 — no account enumeration)", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "nobody@test.edu", password: "whatever" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/refresh and GET /api/auth/me", () => {
  it("refreshes into a new usable access token", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await createUserFixture({ role: "student", branchId: branch.id, email: "refresh@test.edu", password: "password123" });

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "refresh@test.edu", password: "password123" });

    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: loginRes.body.data.refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(typeof refreshRes.body.data.accessToken).toBe("string");

    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${refreshRes.body.data.accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe("refresh@test.edu");
  });

  it("rejects a malformed refresh token", async () => {
    const res = await request(app).post("/api/auth/refresh").send({ refreshToken: "garbage" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("returns success with null data", async () => {
    const res = await request(app).post("/api/auth/logout").send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: null });
  });
});

describe("GET /api/auth/google", () => {
  it("redirects to Google's consent screen with a state param", async () => {
    const res = await request(app).get("/api/auth/google");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("accounts.google.com");
    expect(res.headers.location).toContain("state=");
  });
});

describe("GET /api/auth/google/callback", () => {
  function mockGoogle(profile: { sub: string; email: string; email_verified: boolean; name: string }) {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "fake-google-token" }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => profile } as Response);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects to /oauth/complete for a brand-new identity", async () => {
    const stateRes = await request(app).get("/api/auth/google");
    const state = new URL(stateRes.headers.location).searchParams.get("state")!;
    mockGoogle({ sub: "google-new-1", email: "newgoogle@test.edu", email_verified: true, name: "New Googler" });

    const res = await request(app).get(`/api/auth/google/callback?code=fake-code&state=${state}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/oauth/complete#pending=");
  });

  it("redirects to /oauth/callback with a session for a known provider identity", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    await pool.query(
      `INSERT INTO users (email, full_name, auth_provider, provider_user_id, role, branch_id, email_verified)
       VALUES ('known-google@test.edu', 'Known Googler', 'google', 'google-known-1', 'student', $1, true)`,
      [branch.id]
    );
    const stateRes = await request(app).get("/api/auth/google");
    const state = new URL(stateRes.headers.location).searchParams.get("state")!;
    mockGoogle({ sub: "google-known-1", email: "known-google@test.edu", email_verified: true, name: "Known Googler" });

    const res = await request(app).get(`/api/auth/google/callback?code=fake-code&state=${state}`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/oauth/callback#accessToken=");
  });

  it("links to an existing verified-email password account instead of creating a duplicate", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user } = await createUserFixture({
      role: "student",
      branchId: branch.id,
      email: "link-me@test.edu",
      emailVerified: true,
    });
    const stateRes = await request(app).get("/api/auth/google");
    const state = new URL(stateRes.headers.location).searchParams.get("state")!;
    mockGoogle({ sub: "google-link-1", email: "link-me@test.edu", email_verified: true, name: "Link Me" });

    const res = await request(app).get(`/api/auth/google/callback?code=fake-code&state=${state}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/oauth/callback#accessToken=");

    const { rows } = await pool.query(`SELECT auth_provider, provider_user_id FROM users WHERE id = $1`, [user.id]);
    expect(rows[0].auth_provider).toBe("google");
    expect(rows[0].provider_user_id).toBe("google-link-1");
  });

  it("does NOT link when Google reports the email as unverified", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const { user } = await createUserFixture({
      role: "student",
      branchId: branch.id,
      email: "unverified-link@test.edu",
      emailVerified: true,
    });
    const stateRes = await request(app).get("/api/auth/google");
    const state = new URL(stateRes.headers.location).searchParams.get("state")!;
    mockGoogle({ sub: "google-unverified-1", email: "unverified-link@test.edu", email_verified: false, name: "Unverified" });

    const res = await request(app).get(`/api/auth/google/callback?code=fake-code&state=${state}`);
    expect(res.headers.location).toContain("/oauth/complete#pending=");

    const { rows } = await pool.query(`SELECT auth_provider FROM users WHERE id = $1`, [user.id]);
    expect(rows[0].auth_provider).toBeNull();
  });

  it("redirects to /login?error=oauth_failed on an invalid state", async () => {
    const res = await request(app).get(`/api/auth/google/callback?code=fake-code&state=garbage`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("/login?error=oauth_failed");
  });
});

describe("POST /api/auth/google/complete", () => {
  it("creates a verified, password-less account and returns tokens", async () => {
    const program = await createProgram();
    const branch = await createBranch(program.id);
    const pendingToken = signOAuthPending({
      provider: "google",
      providerUserId: "google-complete-1",
      email: "complete@test.edu",
      fullName: "Complete Me",
    });

    const res = await request(app).post("/api/auth/google/complete").send({ pendingToken, branch_id: branch.id });

    expect(res.status).toBe(201);
    expect(res.body.data.user.email_verified).toBe(true);
    expect(typeof res.body.data.accessToken).toBe("string");
  });

  it("rejects an invalid pending token with 400", async () => {
    const res = await request(app)
      .post("/api/auth/google/complete")
      .send({ pendingToken: "garbage", branch_id: "00000000-0000-0000-0000-000000000000" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });
});
