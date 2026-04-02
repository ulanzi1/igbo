import { z } from "zod/v4";

// NOTE: This package exports Zod schemas and types only.
// Each app imports these schemas and calls createEnv() locally with @t3-oss/env-nextjs.
// Do NOT import @t3-oss/env-nextjs here — that is an app-level concern.

export const serverEnvSchema = z.object({
  DATABASE_URL: z.url(),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(20),
  REDIS_URL: z.string().min(1),
  ADMIN_EMAIL: z.email(),
  ADMIN_PASSWORD: z.string().min(8),
  AUTH_SECRET: z.string().min(1),
  AUTH_URL: z.url().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MAX_SESSIONS_PER_USER: z.coerce.number().int().positive().default(5),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  ACCOUNT_LOCKOUT_SECONDS: z.coerce.number().int().positive().default(900),
  ACCOUNT_LOCKOUT_ATTEMPTS: z.coerce.number().int().positive().default(5),
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  X_CLIENT_ID: z.string().optional(),
  X_CLIENT_SECRET: z.string().optional(),
  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  // Hetzner Object Storage (S3-compatible)
  HETZNER_S3_ENDPOINT: z.string().min(1),
  HETZNER_S3_REGION: z.string().min(1),
  HETZNER_S3_BUCKET: z.string().min(1),
  HETZNER_S3_ACCESS_KEY_ID: z.string().min(1),
  HETZNER_S3_SECRET_ACCESS_KEY: z.string().min(1),
  HETZNER_S3_PUBLIC_URL: z.string().min(1),
  // ClamAV (optional)
  ENABLE_CLAMAV: z.string().optional().default("false"),
  CLAMAV_HOST: z.string().optional().default("clamav"),
  CLAMAV_PORT: z.coerce.number().int().positive().optional().default(3310),
  // Realtime server (internal URL for health checks, service-name in Docker)
  REALTIME_INTERNAL_URL: z.url().optional().default("http://localhost:3001"),
  // Email Service
  EMAIL_PROVIDER: z.enum(["resend"]).default("resend"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().email().default("noreply@igbo.global"),
  EMAIL_FROM_NAME: z.string().default("OBIGBO"),
  EMAIL_SUPPORT_ADDRESS: z.string().email().default("support@igbo.global"),
  ENABLE_EMAIL_SENDING: z.string().optional().default("true"),
  // Geocoding (disabled by default, self-host Nominatim for production)
  ENABLE_GEOCODING: z.string().optional().default("false"),
  NOMINATIM_URL: z.string().url().optional().default("https://nominatim.openstreetmap.org"),
  // Daily.co video meeting integration
  DAILY_API_KEY: z.string().optional().default(""),
  DAILY_API_URL: z.string().url().default("https://api.daily.co/v1"),
  DAILY_WEBHOOK_SECRET: z.string().optional().default(""),
  // Web Push / VAPID — optional so dev envs without VAPID keys start normally
  VAPID_PRIVATE_KEY: z.string().optional().default(""),
  VAPID_CONTACT_EMAIL: z.string().optional().default(""),
  // Sentry — optional so dev envs work without Sentry configured
  SENTRY_DSN: z.string().optional().default(""),
  SENTRY_RELEASE: z.string().optional(),
  // Prometheus metrics bearer token
  METRICS_SECRET: z.string().optional().default(""),
  // Logging level
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
});

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_REALTIME_URL: z.url(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional().default(""),
  // Sentry
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional().default(""),
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;
