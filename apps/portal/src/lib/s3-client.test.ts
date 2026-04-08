// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const S3ClientMock = vi.hoisted(() => vi.fn(function S3Client(this: unknown, _config: unknown) {}));

vi.mock("@aws-sdk/client-s3", () => ({ S3Client: S3ClientMock }));

import { getPortalS3Client } from "./s3-client";

describe("getPortalS3Client", () => {
  beforeEach(() => {
    process.env.HETZNER_S3_ENDPOINT = "https://s3.example.com";
    process.env.HETZNER_S3_REGION = "eu-central";
    process.env.HETZNER_S3_ACCESS_KEY_ID = "test-key";
    process.env.HETZNER_S3_SECRET_ACCESS_KEY = "test-secret";
  });

  it("returns the same S3Client instance on repeated calls (singleton)", () => {
    const a = getPortalS3Client();
    const b = getPortalS3Client();
    expect(a).toBe(b);
    // constructor called at most once across these two calls
    expect(S3ClientMock).toHaveBeenCalledTimes(1);
  });

  it("constructs S3Client with env var credentials and forcePathStyle", () => {
    expect(S3ClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://s3.example.com",
        region: "eu-central",
        credentials: {
          accessKeyId: "test-key",
          secretAccessKey: "test-secret",
        },
        forcePathStyle: true,
      }),
    );
  });
});
