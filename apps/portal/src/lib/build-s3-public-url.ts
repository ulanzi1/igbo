/**
 * Build a public S3 URL for an object key.
 * Portal uploads never use processedUrl (no async pipeline) — this constructs the public URL
 * from environment variables, matching the pattern in the upload route.
 */
export function buildS3PublicUrl(objectKey: string): string {
  const s3PublicUrl = process.env.HETZNER_S3_PUBLIC_URL; // ci-allow-process-env
  const s3Bucket = process.env.HETZNER_S3_BUCKET; // ci-allow-process-env
  const s3Region = process.env.HETZNER_S3_REGION ?? "us-east-1"; // ci-allow-process-env
  if (s3PublicUrl) {
    return `${s3PublicUrl}/${objectKey}`;
  }
  return `https://${s3Bucket}.s3.${s3Region}.amazonaws.com/${objectKey}`;
}
