/**
 * One-time setup: configure CORS on the Hetzner S3 bucket to allow
 * browser-based direct uploads via presigned PUT URLs.
 *
 * Run with: npx tsx --env-file=.env src/scripts/setup-s3-cors.ts
 */
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

const endpoint = process.env.HETZNER_S3_ENDPOINT;
const region = process.env.HETZNER_S3_REGION;
const bucket = process.env.HETZNER_S3_BUCKET;
const accessKeyId = process.env.HETZNER_S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.HETZNER_S3_SECRET_ACCESS_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
  console.error("Missing required HETZNER_S3_* environment variables.");
  process.exit(1);
}

const client = new S3Client({
  endpoint,
  region,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
  // MinIO rejects the CRC32 checksum header that AWS SDK v3 adds by default
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

const origins = ["http://localhost:3000", "http://localhost:3001", appUrl].filter(
  (v, i, arr) => arr.indexOf(v) === i,
); // deduplicate

const command = new PutBucketCorsCommand({
  Bucket: bucket,
  CORSConfiguration: {
    CORSRules: [
      {
        AllowedOrigins: origins,
        AllowedMethods: ["PUT", "GET", "HEAD"],
        AllowedHeaders: ["*"],
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 3600,
      },
    ],
  },
});

async function main() {
  try {
    await client.send(command);
    console.info(`✓ CORS configured on bucket '${bucket}' for origins:`, origins);
  } catch (err) {
    console.error("Failed to set CORS:", err);
    process.exit(1);
  }
}

void main();
