import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMailSpy = vi.fn();
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail: sendMailSpy }) },
}));

describe("sendMail", () => {
  beforeEach(() => {
    sendMailSpy.mockReset();
  });

  it("delivers successfully when the provider accepts it", async () => {
    sendMailSpy.mockResolvedValueOnce({ messageId: "abc" });
    const { sendMail } = await import("../../src/lib/mailer.js");

    await expect(sendMail({ to: "a@test.edu", subject: "hi", html: "<p>hi</p>" })).resolves.toBeUndefined();
  });

  it("never lets a raw SMTP/provider error reach the caller", async () => {
    sendMailSpy.mockRejectedValueOnce(
      Object.assign(new Error("535-5.7.8 Username and Password not accepted"), { responseCode: 535 })
    );
    const { sendMail } = await import("../../src/lib/mailer.js");
    const { ApiError } = await import("../../src/lib/apiError.js");

    const err = await sendMail({ to: "a@test.edu", subject: "hi", html: "<p>hi</p>" }).catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("EMAIL_DELIVERY_FAILED");
    expect(err.message).not.toMatch(/535|Username and Password|gmail|smtp/i);
  });

  it("logs the sanitized failure server-side but never a credential value embedded in the error", async () => {
    // A distinctive fake secret (not the trivial "test" from .env.test,
    // which would false-positive-match stack trace/path noise) standing in
    // for a value nodemailer could plausibly echo back in an auth error.
    sendMailSpy.mockRejectedValueOnce(new Error("535 authentication failed for password=zQ9xw7Kv2sPlaintext"));
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { sendMail } = await import("../../src/lib/mailer.js");

    await sendMail({ to: "a@test.edu", subject: "hi", html: "<p>hi</p>" }).catch(() => undefined);

    expect(logSpy).toHaveBeenCalled();
    const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).not.toContain("zQ9xw7Kv2sPlaintext");
    logSpy.mockRestore();
  });
});
