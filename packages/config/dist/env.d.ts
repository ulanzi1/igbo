import { z } from "zod/v4";

declare const serverEnvSchema: z.ZodObject<
  {
    DATABASE_URL: z.ZodURL;
    DATABASE_POOL_SIZE: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    REDIS_URL: z.ZodString;
    ADMIN_EMAIL: z.ZodEmail;
    ADMIN_PASSWORD: z.ZodString;
    AUTH_SECRET: z.ZodString;
    AUTH_URL: z.ZodOptional<z.ZodURL>;
    NODE_ENV: z.ZodDefault<
      z.ZodEnum<{
        development: "development";
        test: "test";
        production: "production";
      }>
    >;
    MAX_SESSIONS_PER_USER: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    SESSION_TTL_SECONDS: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    ACCOUNT_LOCKOUT_SECONDS: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    ACCOUNT_LOCKOUT_ATTEMPTS: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    FACEBOOK_APP_ID: z.ZodOptional<z.ZodString>;
    FACEBOOK_APP_SECRET: z.ZodOptional<z.ZodString>;
    LINKEDIN_CLIENT_ID: z.ZodOptional<z.ZodString>;
    LINKEDIN_CLIENT_SECRET: z.ZodOptional<z.ZodString>;
    X_CLIENT_ID: z.ZodOptional<z.ZodString>;
    X_CLIENT_SECRET: z.ZodOptional<z.ZodString>;
    INSTAGRAM_APP_ID: z.ZodOptional<z.ZodString>;
    INSTAGRAM_APP_SECRET: z.ZodOptional<z.ZodString>;
    HETZNER_S3_ENDPOINT: z.ZodString;
    HETZNER_S3_REGION: z.ZodString;
    HETZNER_S3_BUCKET: z.ZodString;
    HETZNER_S3_ACCESS_KEY_ID: z.ZodString;
    HETZNER_S3_SECRET_ACCESS_KEY: z.ZodString;
    HETZNER_S3_PUBLIC_URL: z.ZodString;
    ENABLE_CLAMAV: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    CLAMAV_HOST: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    CLAMAV_PORT: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    REALTIME_INTERNAL_URL: z.ZodDefault<z.ZodOptional<z.ZodURL>>;
    EMAIL_PROVIDER: z.ZodDefault<
      z.ZodEnum<{
        resend: "resend";
      }>
    >;
    RESEND_API_KEY: z.ZodOptional<z.ZodString>;
    EMAIL_FROM_ADDRESS: z.ZodDefault<z.ZodString>;
    EMAIL_FROM_NAME: z.ZodDefault<z.ZodString>;
    EMAIL_SUPPORT_ADDRESS: z.ZodDefault<z.ZodString>;
    ENABLE_EMAIL_SENDING: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    ENABLE_GEOCODING: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    NOMINATIM_URL: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    DAILY_API_KEY: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    DAILY_API_URL: z.ZodDefault<z.ZodString>;
    DAILY_WEBHOOK_SECRET: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    VAPID_PRIVATE_KEY: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    VAPID_CONTACT_EMAIL: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    SENTRY_DSN: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    SENTRY_RELEASE: z.ZodOptional<z.ZodString>;
    METRICS_SECRET: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    LOG_LEVEL: z.ZodOptional<
      z.ZodEnum<{
        error: "error";
        debug: "debug";
        info: "info";
        warn: "warn";
      }>
    >;
  },
  z.core.$strip
>;
declare const clientEnvSchema: z.ZodObject<
  {
    NEXT_PUBLIC_APP_URL: z.ZodURL;
    NEXT_PUBLIC_REALTIME_URL: z.ZodURL;
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    NEXT_PUBLIC_SENTRY_DSN: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
type ServerEnv = z.infer<typeof serverEnvSchema>;
type ClientEnv = z.infer<typeof clientEnvSchema>;

export { type ClientEnv, type ServerEnv, clientEnvSchema, serverEnvSchema };
