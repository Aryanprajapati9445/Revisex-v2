import nodemailer from "nodemailer";
import { env } from "../config/env.js";

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
  await transport.sendMail({ from: env.MAIL_FROM, to: opts.to, subject: opts.subject, html: opts.html });
}
