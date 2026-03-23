# Hetzner Object Storage Setup Guide

This guide covers the production configuration for Hetzner Object Storage (S3-compatible API)
including bucket creation, CORS, access management, lifecycle policies, presigned URL flow,
and server-side encryption.

---

## 1. Prerequisites

- Active Hetzner Cloud account with a project
- Access to the Hetzner Cloud Console: [console.hetzner.cloud](https://console.hetzner.cloud)
- AWS CLI v2 configured with Hetzner S3 endpoint (for lifecycle policy management)

---

## 2. Bucket Creation

### 2.1 Required Buckets

Create three buckets for the OBIGBO platform:

| Bucket name    | Purpose                        | Visibility |
| -------------- | ------------------------------ | ---------- |
| `igbo-uploads` | User file attachments & photos | Private    |
| `igbo-backups` | Automated PostgreSQL backups   | Private    |
| `igbo-exports` | GDPR data export downloads     | Private    |

### 2.2 Creating a Bucket (Hetzner Console)

1. Log in to [console.hetzner.cloud](https://console.hetzner.cloud)
2. Navigate to **Object Storage → Buckets → Create Bucket**
3. Select region: **Nuremberg (nbg1)** (or your preferred region)
4. Set name and visibility to **Private**
5. Click **Create Bucket**

### 2.3 Access Key Management

1. Navigate to **Object Storage → Access Keys → Generate Access Key**
2. Create two access keys:
   - **App key** (`igbo-app`): Read/write access to `igbo-uploads` and `igbo-exports` only
   - **Backup key** (`igbo-backup`): Write access to `igbo-backups` only

> **Security principle**: Least privilege — the application never has write access to the backups
> bucket; the backup sidecar never has access to user uploads.

Store keys in the production `.env` file (never in git):

```
# Application key
HETZNER_S3_ACCESS_KEY_ID=<app-key-id>
HETZNER_S3_SECRET_ACCESS_KEY=<app-key-secret>

# Backup sidecar key
BACKUP_S3_ACCESS_KEY_ID=<backup-key-id>
BACKUP_S3_SECRET_ACCESS_KEY=<backup-key-secret>
```

---

## 3. CORS Configuration

The `igbo-uploads` bucket requires CORS for browser-to-S3 direct uploads (presigned PUT URLs).

Apply via AWS CLI (Hetzner S3-compatible endpoint):

```bash
aws s3api put-bucket-cors \
  --endpoint-url https://nbg1.your-objectstorage.com \
  --bucket igbo-uploads \
  --cors-configuration '{
    "CORSRules": [
      {
        "AllowedOrigins": [
          "https://obigbo.app",
          "https://staging.obigbo.app"
        ],
        "AllowedMethods": ["PUT", "GET", "HEAD"],
        "AllowedHeaders": ["*"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3600
      }
    ]
  }'
```

> **Note:** Replace `obigbo.app` and `staging.obigbo.app` with your actual production and staging
> domains. Only allow origins you control — never use `"*"` for presigned upload CORS.

---

## 4. Bucket Lifecycle Policies

### 4.1 `igbo-uploads` — No auto-deletion

User-uploaded files (profile photos, post attachments, article media) are retained indefinitely.
Deletion is explicit (user account deletion, GDPR erasure request) handled by the application.

No lifecycle policy needed for this bucket.

### 4.2 `igbo-backups` — 30-day retention

PostgreSQL backup files are auto-deleted after 30 days per NFR-R3:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --endpoint-url https://nbg1.your-objectstorage.com \
  --bucket igbo-backups \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "delete-backups-after-30-days",
        "Status": "Enabled",
        "Filter": {},
        "Expiration": {
          "Days": 30
        }
      }
    ]
  }'
```

### 4.3 `igbo-exports` — 7-day retention

GDPR data export downloads are auto-deleted after 7 days:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --endpoint-url https://nbg1.your-objectstorage.com \
  --bucket igbo-exports \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "delete-exports-after-7-days",
        "Status": "Enabled",
        "Filter": {},
        "Expiration": {
          "Days": 7
        }
      }
    ]
  }'
```

---

## 5. Presigned URL Flow

The application uses `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` for all
S3 operations. Direct upload/download flow:

```
Browser → POST /api/v1/upload/file
         → Server generates presigned PUT URL (15-min expiry)
         → Returns presigned URL to browser
         → Browser uploads file directly to S3 via PUT (no server proxy)
         → Server receives upload notification (via file status update)
         → ClamAV scans uploaded file (when ENABLE_CLAMAV=true)
         → File status updated: processing → pending_scan → ready (or quarantined)
```

Key implementation details (`src/services/storage-service.ts`):

- Presigned URLs expire after **15 minutes** — sufficient for large file uploads
- Downloads also use presigned GET URLs (files are private, not publicly accessible)
- `x-amz-server-side-encryption: AES256` header is included in all upload presigned URLs
  (see Section 6 for SSE details)

---

## 6. Server-Side Encryption (SSE)

### 6.1 PostgreSQL Data at Rest

Hetzner Cloud Volumes (used to store PostgreSQL `pgdata` volume) use **AES-256 full-disk
encryption by default** — no additional configuration required.

To verify encryption is enabled on a volume:

```bash
hcloud volume describe <volume-id> --output json | jq '.protection'
# Expected output: volume protection details
```

All data written to the PostgreSQL container's `pgdata` named volume (mounted on the Hetzner
Cloud Volume) is encrypted at the block device level.

### 6.2 Hetzner Object Storage — SSE-S3

Hetzner Object Storage supports **SSE-S3 (AES-256)** server-side encryption. Apply it per
object by including the `x-amz-server-side-encryption: AES256` header in upload requests.

The application's presigned PUT URL generation must include this header:

```typescript
// In storage-service.ts — include SSE header in presigned upload command
import { PutObjectCommand } from "@aws-sdk/client-s3";

const command = new PutObjectCommand({
  Bucket: env.HETZNER_S3_BUCKET,
  Key: objectKey,
  ContentType: mimeType,
  ServerSideEncryption: "AES256", // SSE-S3 encryption
});
```

> **Hetzner SSE method:** Hetzner supports per-object encryption via the
> `x-amz-server-side-encryption: AES256` request header. Bucket-level default encryption
> (via bucket policy) is **not currently supported** by Hetzner Object Storage — use
> per-object headers in presigned URLs.

### 6.3 Redis Encryption

Redis is bound to the internal Docker network only (no `ports:` mapping to host) and requires
password authentication (`--requirepass`). Data at rest on the Redis `redisdata` volume is
protected by the Hetzner Cloud Volume full-disk encryption (same as PostgreSQL).

See `docker-compose.prod.yml` for Redis security configuration.

### 6.4 PostgreSQL Network Security

PostgreSQL is configured with `listen_addresses = '*'` within the Docker network — this is
acceptable because:

1. The `postgres` service uses `expose: [5432]` (not `ports:`), so port 5432 is only reachable
   within the `app-network` Docker bridge network.
2. External access is completely blocked — no port is mapped to the host.
3. Only `web` and `backup` containers (on `app-network`) can connect to PostgreSQL.

This configuration is standard Docker practice: `listen_addresses = '*'` means "listen on all
interfaces within the container's network namespace," not "expose to the internet."

---

## 7. Environment Variables Reference

```bash
# Hetzner S3 — application bucket
HETZNER_S3_ENDPOINT=https://nbg1.your-objectstorage.com
HETZNER_S3_REGION=nbg1
HETZNER_S3_BUCKET=igbo-uploads
HETZNER_S3_ACCESS_KEY_ID=<app-access-key-id>
HETZNER_S3_SECRET_ACCESS_KEY=<app-secret-access-key>
HETZNER_S3_PUBLIC_URL=https://igbo-uploads.nbg1.your-objectstorage.com

# Backup sidecar bucket
BACKUP_S3_ENDPOINT=https://nbg1.your-objectstorage.com
BACKUP_S3_BUCKET=igbo-backups
BACKUP_S3_ACCESS_KEY_ID=<backup-access-key-id>
BACKUP_S3_SECRET_ACCESS_KEY=<backup-secret-access-key>
```

---

## Related Documentation

- [docs/cloudflare-setup.md](./cloudflare-setup.md) — CDN + edge security
- [docs/secrets-management.md](./secrets-management.md) — Production secrets handling
- [docs/kubernetes-migration.md](./kubernetes-migration.md) — K8s migration path
