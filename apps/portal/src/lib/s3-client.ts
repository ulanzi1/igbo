import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

let _s3Client: S3Client | null = null;

// portal has no @/env module; follows @igbo/auth pattern of direct process.env reads
export function getPortalS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({
      endpoint: process.env.HETZNER_S3_ENDPOINT, // ci-allow-process-env
      region: process.env.HETZNER_S3_REGION ?? "us-east-1", // ci-allow-process-env
      credentials: {
        accessKeyId: process.env.HETZNER_S3_ACCESS_KEY_ID ?? "", // ci-allow-process-env
        secretAccessKey: process.env.HETZNER_S3_SECRET_ACCESS_KEY ?? "", // ci-allow-process-env
      },
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return _s3Client;
}
