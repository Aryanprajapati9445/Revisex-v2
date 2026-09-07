import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { __resetRateLimitsForTests, ipRateLimit } from "../../src/middleware/rateLimit.js";

function buildTestApp() {
  const app = express();
  app.use(ipRateLimit({ windowMs: 60_000, max: 3, prefix: "test" }));
  app.get("/ping", (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe("ipRateLimit", () => {
  beforeEach(() => {
    __resetRateLimitsForTests();
  });

  it("allows requests under the limit", async () => {
    const app = buildTestApp();
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get("/ping");
      expect(res.status).toBe(200);
    }
  });

  it("rejects with 429 once the limit is exceeded, without leaking internals", async () => {
    const app = buildTestApp();
    for (let i = 0; i < 3; i++) {
      await request(app).get("/ping");
    }

    const res = await request(app).get("/ping");

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(JSON.stringify(res.body)).not.toMatch(/stack|node_modules|at Object/);
  });
});
