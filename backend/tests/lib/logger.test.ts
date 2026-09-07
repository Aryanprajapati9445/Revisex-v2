import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../src/lib/logger.js";

describe("logger redaction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts fields whose key looks sensitive", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logger.error("test_event", { password: "hunter2", token: "abc.def.ghi", nested: { authorization: "Bearer xyz" } });

    const logged = spy.mock.calls[0]![0] as string;
    expect(logged).not.toContain("hunter2");
    expect(logged).not.toContain("abc.def.ghi");
    expect(logged).not.toContain("Bearer xyz");
    expect(logged).toContain("[redacted]");
  });

  it("redacts the credentials embedded in a connection-string-shaped value", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logger.error("db_event", { url: "postgresql://neondb_owner:s3cr3t@example.com/db" });

    const logged = spy.mock.calls[0]![0] as string;
    expect(logged).not.toContain("s3cr3t");
    expect(logged).toContain("postgresql://neondb_owner:***@example.com");
  });

  it("redacts an Error object's message and stack, not just its own top-level fields", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logger.error("caught", { cause: new Error("failed with password=hunter2 in the message") });

    const logged = spy.mock.calls[0]![0] as string;
    expect(logged).not.toContain("hunter2");
  });
});
