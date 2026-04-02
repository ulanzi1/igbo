import "server-only";
import { S3Client } from "@aws-sdk/client-s3";
import { env } from "@/env";

/**
 * Creates a new S3 client configured for Hetzner Object Storage.
 * Use path-style addressing; disable CRC32 checksums (not supported by Hetzner).
 */
export function getS3Client(): S3Client {
  return new S3Client({
    endpoint: env.HETZNER_S3_ENDPOINT,
    region: env.HETZNER_S3_REGION,
    credentials: {
      accessKeyId: env.HETZNER_S3_ACCESS_KEY_ID,
      secretAccessKey: env.HETZNER_S3_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}
