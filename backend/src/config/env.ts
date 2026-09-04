import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  DATABASE_URL: z.string().url().refine((url) => !url.includes("<password>"), {
    message: "DATABASE_URL still has the <user>:<password> placeholder — see .env.example",
  }),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  AWS_REGION: z.string().min(1),
  AWS_S3_BUCKET: z.string().min(1),

  // Point the S3 client somewhere other than AWS — the local MinIO sandbox
  // (db/docker-compose.yml), or any S3-compatible store. Unset means real AWS,
  // so production and staging are untouched by this existing.
  //
  // MinIO needs path-style addressing: virtual-host style would resolve
  // <bucket>.localhost, which does not exist.
  S3_ENDPOINT: z.string().url().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  // Only read when S3_ENDPOINT is set; against AWS the default provider chain
  // (instance role, profile, ambient env) stays in charge.
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
