import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";

const app = createApp();

describe("stub routers use the standard error envelope", () => {
  it("GET /api/tags returns a 501 NOT_IMPLEMENTED envelope", async () => {
    const res = await request(app).get("/api/tags");

    expect(res.status).toBe(501);
    expect(res.body).toEqual({
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: expect.any(String) },
    });
  });
});
