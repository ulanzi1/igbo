import { describe, it, expect } from "vitest";
import { serverEnvSchema, clientEnvSchema } from "./env";

describe("@igbo/config — env schemas", () => {
  describe("serverEnvSchema", () => {
    it("validates a minimal valid server env", () => {
      const result = serverEnvSchema.safeParse({
        DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
        REDIS_URL: "redis://localhost:6379",
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_PASSWORD: "securepassword123",
        AUTH_SECRET: "some-secret",
        HETZNER_S3_ENDPOINT: "https://s3.example.com",
        HETZNER_S3_REGION: "eu-central",
        HETZNER_S3_BUCKET: "igbo-bucket",
        HETZNER_S3_ACCESS_KEY_ID: "access-key",
        HETZNER_S3_SECRET_ACCESS_KEY: "secret-key",
        HETZNER_S3_PUBLIC_URL: "https://public.s3.example.com",
      });
      expect(result.success).toBe(true);
    });

    it("fails when required DATABASE_URL is missing", () => {
      const result = serverEnvSchema.safeParse({
        REDIS_URL: "redis://localhost:6379",
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_PASSWORD: "securepassword123",
        AUTH_SECRET: "some-secret",
        HETZNER_S3_ENDPOINT: "https://s3.example.com",
        HETZNER_S3_REGION: "eu-central",
        HETZNER_S3_BUCKET: "igbo-bucket",
        HETZNER_S3_ACCESS_KEY_ID: "access-key",
        HETZNER_S3_SECRET_ACCESS_KEY: "secret-key",
        HETZNER_S3_PUBLIC_URL: "https://public.s3.example.com",
      });
      expect(result.success).toBe(false);
    });

    it("applies NODE_ENV default of 'development'", () => {
      const result = serverEnvSchema.safeParse({
        DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
        REDIS_URL: "redis://localhost:6379",
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_PASSWORD: "securepassword123",
        AUTH_SECRET: "some-secret",
        HETZNER_S3_ENDPOINT: "https://s3.example.com",
        HETZNER_S3_REGION: "eu-central",
        HETZNER_S3_BUCKET: "igbo-bucket",
        HETZNER_S3_ACCESS_KEY_ID: "access-key",
        HETZNER_S3_SECRET_ACCESS_KEY: "secret-key",
        HETZNER_S3_PUBLIC_URL: "https://public.s3.example.com",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe("development");
      }
    });
  });

  describe("clientEnvSchema", () => {
    it("validates a valid client env", () => {
      const result = clientEnvSchema.safeParse({
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
        NEXT_PUBLIC_REALTIME_URL: "http://localhost:3001",
      });
      expect(result.success).toBe(true);
    });

    it("fails when NEXT_PUBLIC_APP_URL is missing", () => {
      const result = clientEnvSchema.safeParse({
        NEXT_PUBLIC_REALTIME_URL: "http://localhost:3001",
      });
      expect(result.success).toBe(false);
    });
  });
});
