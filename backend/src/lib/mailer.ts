import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { wrapExternalError } from "./externalError.js";

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail(opts: SendMailOptions): Promise<void> {
  try {
    await transport.sendMail({ from: env.MAIL_FROM, to: opts.to, subject: opts.subject, html: opts.html });
  } catch (err) {
    // nodemailer/SMTP errors carry the provider's raw text verbatim (e.g.
    // Gmail's "535-5.7.8 Username and Password not accepted") — never let
    // that reach a client response. Every OTP/verification/reset email goes
    // through this one function, so this is the single choke point where
    // sanitizing it covers all of them at once.
    throw wrapExternalError(err, {
      category: "smtp",
      status: 503,
      code: "EMAIL_DELIVERY_FAILED",
      message: "We couldn't send that email right now. Please try again shortly.",
    });
  }
}
