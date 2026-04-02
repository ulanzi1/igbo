// @vitest-environment node
/**
 * Backup & Disaster Recovery Infrastructure tests (Story 12.4)
 * Validates Dockerfiles, backup scripts, PostgreSQL config, Docker Compose
 * changes, alert rules documentation, and recovery runbook.
 * Root-level test file — picked up by vitest.config.ts include: ["*.test.ts"]
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import yaml from "js-yaml";

const ROOT = resolve(__dirname, "../..");

// ─────────────────────────────────────────────────────────────────────────────
// Helper types
// ─────────────────────────────────────────────────────────────────────────────

interface ComposeService {
  image?: string;
  build?: { context?: string; dockerfile?: string } | string;
  restart?: string;
  command?: string | string[];
  healthcheck?: { test?: string | string[]; interval?: string };
  depends_on?: Record<string, { condition: string }> | string[];
  environment?: Record<string, string>;
  volumes?: string[];
}

interface ComposeFile {
  services?: Record<string, ComposeService>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Load docker-compose.prod.yml once
// ─────────────────────────────────────────────────────────────────────────────

const composePath = resolve(ROOT, "docker-compose.prod.yml");
let compose: ComposeFile = {};

try {
  compose = yaml.load(readFileSync(composePath, "utf-8")) as ComposeFile;
} catch {
  // File not found — tests will fail with descriptive errors
}

const services = compose.services ?? {};

// ─────────────────────────────────────────────────────────────────────────────
// Dockerfile.backup validation (Task 1)
// ─────────────────────────────────────────────────────────────────────────────

describe("Dockerfile.backup — custom backup sidecar image (Task 1)", () => {
  const dockerfilePath = resolve(ROOT, "Dockerfile.backup");
  let content = "";

  beforeAll(() => {
    if (existsSync(dockerfilePath)) {
      content = readFileSync(dockerfilePath, "utf-8");
    }
  });

  it("Dockerfile.backup exists", () => {
    expect(existsSync(dockerfilePath)).toBe(true);
  });

  it("uses FROM alpine base image", () => {
    expect(content).toMatch(/^FROM alpine/m);
  });

  it("installs postgresql16-client at build time", () => {
    expect(content).toContain("postgresql16-client");
  });

  it("installs aws-cli at build time", () => {
    expect(content).toContain("aws-cli");
  });

  it("installs bash at build time", () => {
    expect(content).toContain("bash");
  });

  it("installs gzip at build time", () => {
    expect(content).toContain("gzip");
  });

  it("contains CMD with crond entrypoint", () => {
    expect(content).toContain("crond");
  });

  it("contains HEALTHCHECK directive", () => {
    expect(content).toContain("HEALTHCHECK");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dockerfile.postgres validation (Task 4.5)
// ─────────────────────────────────────────────────────────────────────────────

describe("Dockerfile.postgres — PostgreSQL with aws-cli (Task 4.5)", () => {
  const dockerfilePath = resolve(ROOT, "Dockerfile.postgres");
  let content = "";

  beforeAll(() => {
    if (existsSync(dockerfilePath)) {
      content = readFileSync(dockerfilePath, "utf-8");
    }
  });

  it("Dockerfile.postgres exists", () => {
    expect(existsSync(dockerfilePath)).toBe(true);
  });

  it("extends postgres:16-alpine", () => {
    expect(content).toContain("postgres:16-alpine");
  });

  it("installs aws-cli for WAL archive_command", () => {
    expect(content).toContain("aws-cli");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Backup scripts validation (Tasks 2, 3, 4, 5, 6, 8)
// ─────────────────────────────────────────────────────────────────────────────

describe("backup.sh — daily pg_dump script (Task 2)", () => {
  const scriptPath = resolve(ROOT, "scripts/backup/backup.sh");
  let content = "";

  beforeAll(() => {
    if (existsSync(scriptPath)) {
      content = readFileSync(scriptPath, "utf-8");
    }
  });

  it("scripts/backup/backup.sh exists", () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  it("uses pg_dump", () => {
    expect(content).toContain("pg_dump");
  });

  it("uses custom format -Fc (not piped through gzip)", () => {
    expect(content).toContain("-Fc");
  });

  it("uploads to S3 with endpoint-url", () => {
    expect(content).toContain("aws s3 cp");
    expect(content).toContain("endpoint-url");
  });
});

describe("retention-cleanup.sh — 30-day retention (Task 3)", () => {
  const scriptPath = resolve(ROOT, "scripts/backup/retention-cleanup.sh");
  let content = "";

  beforeAll(() => {
    if (existsSync(scriptPath)) {
      content = readFileSync(scriptPath, "utf-8");
    }
  });

  it("scripts/backup/retention-cleanup.sh exists", () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  it("contains S3 delete logic (aws s3 rm)", () => {
    expect(content).toContain("aws s3 rm");
  });

  it("references 30 days cutoff", () => {
    expect(content).toContain("30 days");
  });
});

describe("wal-archive.sh — PostgreSQL archive_command (Task 4)", () => {
  const scriptPath = resolve(ROOT, "scripts/backup/wal-archive.sh");
  let content = "";

  beforeAll(() => {
    if (existsSync(scriptPath)) {
      content = readFileSync(scriptPath, "utf-8");
    }
  });

  it("scripts/backup/wal-archive.sh exists", () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  it("uploads WAL segment to S3", () => {
    expect(content).toContain("aws s3 cp");
  });

  it("contains retry logic", () => {
    expect(content).toContain("MAX_RETRIES");
  });
});

describe("restore.sh — full database restore (Task 5)", () => {
  const scriptPath = resolve(ROOT, "scripts/backup/restore.sh");
  let content = "";

  beforeAll(() => {
    if (existsSync(scriptPath)) {
      content = readFileSync(scriptPath, "utf-8");
    }
  });

  it("scripts/backup/restore.sh exists", () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  it("uses pg_restore", () => {
    expect(content).toContain("pg_restore");
  });

  it("requires explicit 'yes' confirmation (destructive operation)", () => {
    expect(content).toContain("yes");
  });
});

describe("restore-pitr.sh — point-in-time recovery (Task 5.2)", () => {
  const scriptPath = resolve(ROOT, "scripts/backup/restore-pitr.sh");
  let content = "";

  beforeAll(() => {
    if (existsSync(scriptPath)) {
      content = readFileSync(scriptPath, "utf-8");
    }
  });

  it("scripts/backup/restore-pitr.sh exists", () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  it("references recovery_target_time for PITR", () => {
    expect(content).toContain("recovery_target_time");
  });
});

describe("verify-backup.sh — monthly integrity test (Task 6)", () => {
  const scriptPath = resolve(ROOT, "scripts/backup/verify-backup.sh");
  let content = "";

  beforeAll(() => {
    if (existsSync(scriptPath)) {
      content = readFileSync(scriptPath, "utf-8");
    }
  });

  it("scripts/backup/verify-backup.sh exists", () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  it("contains integrity check logic (table count)", () => {
    expect(content).toContain("information_schema.tables");
  });

  it("spins up a temporary PostgreSQL container", () => {
    expect(content).toContain("pg-verify-temp");
  });
});

describe("check-backup-freshness.sh — daily freshness check (Task 8)", () => {
  const scriptPath = resolve(ROOT, "scripts/backup/check-backup-freshness.sh");
  let content = "";

  beforeAll(() => {
    if (existsSync(scriptPath)) {
      content = readFileSync(scriptPath, "utf-8");
    }
  });

  it("scripts/backup/check-backup-freshness.sh exists", () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  it("checks for stale backup (references 25 hour threshold)", () => {
    expect(content).toContain("25");
  });
});

describe("crontab — cron schedule for backup jobs (Task 1.2)", () => {
  const crontabPath = resolve(ROOT, "scripts/backup/crontab");
  let content = "";

  beforeAll(() => {
    if (existsSync(crontabPath)) {
      content = readFileSync(crontabPath, "utf-8");
    }
  });

  it("scripts/backup/crontab exists", () => {
    expect(existsSync(crontabPath)).toBe(true);
  });

  it("contains daily backup schedule (backup.sh)", () => {
    expect(content).toContain("backup.sh");
  });

  it("contains monthly verification schedule (verify-backup.sh)", () => {
    expect(content).toContain("verify-backup.sh");
  });

  it("contains daily freshness check schedule (check-backup-freshness.sh)", () => {
    expect(content).toContain("check-backup-freshness.sh");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PostgreSQL custom config validation (Task 4.2)
// ─────────────────────────────────────────────────────────────────────────────

describe("postgresql-custom.conf — WAL archiving config (Task 4.2)", () => {
  const configPath = resolve(ROOT, "scripts/backup/postgresql-custom.conf");
  let content = "";

  beforeAll(() => {
    if (existsSync(configPath)) {
      content = readFileSync(configPath, "utf-8");
    }
  });

  it("scripts/backup/postgresql-custom.conf exists", () => {
    expect(existsSync(configPath)).toBe(true);
  });

  it("has archive_mode = on", () => {
    expect(content).toContain("archive_mode = on");
  });

  it("has wal_level = replica", () => {
    expect(content).toContain("wal_level = replica");
  });

  it("has archive_timeout configured", () => {
    expect(content).toContain("archive_timeout");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Docker Compose validation (Task 7)
// ─────────────────────────────────────────────────────────────────────────────

describe("docker-compose.prod.yml — backup service (Task 7.1)", () => {
  it("backup service exists", () => {
    expect(services.backup).toBeDefined();
  });

  it("backup service uses custom build (not alpine:3.19 placeholder)", () => {
    const svc = services.backup;
    expect(svc).toBeDefined();
    // Must use build: (custom Dockerfile), not image: alpine:3.19
    expect(svc?.build).toBeDefined();
    expect(svc?.image).not.toBe("alpine:3.19");
  });

  it("backup service has health check defined", () => {
    expect(services.backup?.healthcheck).toBeDefined();
    expect(services.backup?.healthcheck?.test).toBeDefined();
  });

  it("backup service depends_on postgres with condition: service_healthy", () => {
    const dependsOn = services.backup?.depends_on as Record<string, { condition: string }>;
    expect(dependsOn).toBeDefined();
    expect(dependsOn.postgres).toBeDefined();
    expect(dependsOn.postgres.condition).toBe("service_healthy");
  });

  it("backup service has POSTGRES_USER env var", () => {
    expect(services.backup?.environment?.POSTGRES_USER).toBeDefined();
  });

  it("backup service has POSTGRES_PASSWORD env var", () => {
    expect(services.backup?.environment?.POSTGRES_PASSWORD).toBeDefined();
  });

  it("backup service has POSTGRES_DB env var", () => {
    expect(services.backup?.environment?.POSTGRES_DB).toBeDefined();
  });

  it("backup service has BACKUP_S3_ENDPOINT env var", () => {
    expect(services.backup?.environment?.BACKUP_S3_ENDPOINT).toBeDefined();
  });

  it("backup service has BACKUP_S3_BUCKET env var", () => {
    expect(services.backup?.environment?.BACKUP_S3_BUCKET).toBeDefined();
  });

  it("backup service has BACKUP_S3_ACCESS_KEY_ID env var", () => {
    expect(services.backup?.environment?.BACKUP_S3_ACCESS_KEY_ID).toBeDefined();
  });

  it("backup service has BACKUP_S3_SECRET_ACCESS_KEY env var", () => {
    expect(services.backup?.environment?.BACKUP_S3_SECRET_ACCESS_KEY).toBeDefined();
  });
});

describe("docker-compose.prod.yml — postgres service WAL support (Task 7.2)", () => {
  it("postgres service uses custom build (for WAL archiving support)", () => {
    const svc = services.postgres;
    expect(svc).toBeDefined();
    // Must use build: (custom Dockerfile.postgres with aws-cli)
    expect(svc?.build).toBeDefined();
  });

  it("postgres service has BACKUP_S3_ENDPOINT env var (needed by wal-archive.sh)", () => {
    expect(services.postgres?.environment?.BACKUP_S3_ENDPOINT).toBeDefined();
  });

  it("postgres service has BACKUP_S3_BUCKET env var", () => {
    expect(services.postgres?.environment?.BACKUP_S3_BUCKET).toBeDefined();
  });

  it("postgres service has BACKUP_S3_ACCESS_KEY_ID env var", () => {
    expect(services.postgres?.environment?.BACKUP_S3_ACCESS_KEY_ID).toBeDefined();
  });

  it("postgres service has BACKUP_S3_SECRET_ACCESS_KEY env var", () => {
    expect(services.postgres?.environment?.BACKUP_S3_SECRET_ACCESS_KEY).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Alert rules — backup monitoring documentation (Task 8.2)
// ─────────────────────────────────────────────────────────────────────────────

describe("alert-rules.yml — backup monitoring documentation (Task 8.2)", () => {
  const alertRulesPath = resolve(ROOT, "monitoring/prometheus/alert-rules.yml");
  let content = "";

  beforeAll(() => {
    if (existsSync(alertRulesPath)) {
      content = readFileSync(alertRulesPath, "utf-8");
    }
  });

  it("alert-rules.yml documents that backup monitoring is log-based", () => {
    expect(content.toLowerCase()).toContain("log-based");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Documentation validation (Tasks 8.3, 9)
// ─────────────────────────────────────────────────────────────────────────────

describe("backup-recovery-runbook.md — disaster recovery runbook (Task 9)", () => {
  const runbookPath = resolve(ROOT, "docs/backup-recovery-runbook.md");
  let content = "";

  beforeAll(() => {
    if (existsSync(runbookPath)) {
      content = readFileSync(runbookPath, "utf-8");
    }
  });

  it("docs/backup-recovery-runbook.md exists", () => {
    expect(existsSync(runbookPath)).toBe(true);
  });

  it("runbook contains Full Recovery section", () => {
    expect(content).toContain("Full Recovery");
  });

  it("runbook contains Point-in-Time Recovery section", () => {
    expect(content).toContain("Point-in-Time Recovery");
  });

  it("runbook contains DNS Failover section", () => {
    expect(content).toContain("DNS Failover");
  });

  it("runbook contains Post-Recovery Verification section", () => {
    expect(content).toContain("Post-Recovery Verification");
  });

  it("runbook mentions RTO target (4 hours)", () => {
    expect(content).toContain("4 hours");
  });

  it("runbook mentions RPO target (24 hours or 24h)", () => {
    expect(content.toLowerCase()).toMatch(/24.?hour/);
  });
});

describe("monitoring-setup.md — backup monitoring section (Task 8.3)", () => {
  const monitoringDocPath = resolve(ROOT, "docs/monitoring-setup.md");
  let content = "";

  beforeAll(() => {
    if (existsSync(monitoringDocPath)) {
      content = readFileSync(monitoringDocPath, "utf-8");
    }
  });

  it("docs/monitoring-setup.md contains backup monitoring section", () => {
    expect(content).toContain("Backup Monitoring");
  });

  it("monitoring doc explains how to verify backup ran", () => {
    expect(content).toContain("backup_completed");
  });

  it("monitoring doc explains how to trigger manual backup", () => {
    expect(content).toContain("backup.sh");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Environment variables validation (Task 7.3)
// ─────────────────────────────────────────────────────────────────────────────

describe(".env.production.example — backup environment variables (Task 7.3)", () => {
  const envExamplePath = resolve(ROOT, ".env.production.example");
  let content = "";

  beforeAll(() => {
    if (existsSync(envExamplePath)) {
      content = readFileSync(envExamplePath, "utf-8");
    }
  });

  it("contains ENABLE_WAL_ARCHIVING", () => {
    expect(content).toContain("ENABLE_WAL_ARCHIVING");
  });

  it("contains BACKUP_S3_REGION", () => {
    expect(content).toContain("BACKUP_S3_REGION");
  });

  it("still contains BACKUP_S3_ENDPOINT (existing var not removed)", () => {
    expect(content).toContain("BACKUP_S3_ENDPOINT");
  });

  it("still contains BACKUP_S3_BUCKET (existing var not removed)", () => {
    expect(content).toContain("BACKUP_S3_BUCKET");
  });

  it("still contains BACKUP_S3_ACCESS_KEY_ID (existing var not removed)", () => {
    expect(content).toContain("BACKUP_S3_ACCESS_KEY_ID");
  });

  it("still contains BACKUP_S3_SECRET_ACCESS_KEY (existing var not removed)", () => {
    expect(content).toContain("BACKUP_S3_SECRET_ACCESS_KEY");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Review fix validations
// ─────────────────────────────────────────────────────────────────────────────

describe("Review fixes — postgres command uses -c flags (not config_file=)", () => {
  it("postgres command does NOT use config_file= (would replace entire default config)", () => {
    const command = services.postgres?.command;
    if (typeof command === "string") {
      expect(command).not.toContain("config_file");
    } else if (Array.isArray(command)) {
      expect(command.join(" ")).not.toContain("config_file");
    }
  });

  it("postgres command includes -c wal_level=replica", () => {
    const command = services.postgres?.command;
    const commandStr = Array.isArray(command) ? command.join(" ") : String(command ?? "");
    expect(commandStr).toContain("wal_level=replica");
  });

  it("postgres command includes -c archive_mode=on", () => {
    const command = services.postgres?.command;
    const commandStr = Array.isArray(command) ? command.join(" ") : String(command ?? "");
    expect(commandStr).toContain("archive_mode=on");
  });

  it("postgres command includes -c archive_timeout", () => {
    const command = services.postgres?.command;
    const commandStr = Array.isArray(command) ? command.join(" ") : String(command ?? "");
    expect(commandStr).toContain("archive_timeout=");
  });
});

describe("Review fixes — wal-archive.sh checks ENABLE_WAL_ARCHIVING", () => {
  const scriptPath = resolve(ROOT, "scripts/backup/wal-archive.sh");
  let content = "";

  beforeAll(() => {
    if (existsSync(scriptPath)) {
      content = readFileSync(scriptPath, "utf-8");
    }
  });

  it("wal-archive.sh checks ENABLE_WAL_ARCHIVING env var", () => {
    expect(content).toContain("ENABLE_WAL_ARCHIVING");
  });
});

describe("base-backup.sh — weekly physical base backup (TD-1 PITR fix)", () => {
  const scriptPath = resolve(ROOT, "scripts/backup/base-backup.sh");
  let content = "";

  beforeAll(() => {
    if (existsSync(scriptPath)) {
      content = readFileSync(scriptPath, "utf-8");
    }
  });

  it("scripts/backup/base-backup.sh exists", () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  it("uses pg_basebackup for physical backup", () => {
    expect(content).toContain("pg_basebackup");
    // Verify pg_basebackup is the actual command used (not pg_dump)
    expect(content).toMatch(/if ! pg_basebackup/);
  });

  it("uploads to S3 base-backups/ prefix", () => {
    expect(content).toContain("base-backups/");
  });

  it("compresses backup as tar.gz", () => {
    expect(content).toContain("tar -czf");
  });

  it("validates archive is non-empty (> 1MB)", () => {
    expect(content).toContain("1048576");
  });

  it("verifies S3 upload succeeded", () => {
    expect(content).toContain("s3_verify_failed");
  });

  it("cleans up local temp files", () => {
    expect(content).toContain("rm -f");
    expect(content).toContain("rm -rf");
  });

  it("uses structured JSON logging", () => {
    expect(content).toContain("log_json");
    expect(content).toContain("base_backup_started");
    expect(content).toContain("base_backup_completed");
  });
});

describe("restore-pitr.sh — uses pg_basebackup physical backup (TD-1 fix)", () => {
  const scriptPath = resolve(ROOT, "scripts/backup/restore-pitr.sh");
  let content = "";

  beforeAll(() => {
    if (existsSync(scriptPath)) {
      content = readFileSync(scriptPath, "utf-8");
    }
  });

  it("restore-pitr.sh uses physical base backup from base-backups/ prefix", () => {
    expect(content).toContain("base-backups/");
  });

  it("replaces PGDATA with physical backup (not pg_restore)", () => {
    expect(content).toContain("tar -xzf");
    expect(content).not.toContain("pg_restore");
  });

  it("preserves pg_wal symlink if present", () => {
    expect(content).toContain("pg_wal");
    expect(content).toContain("readlink");
  });

  it("references recovery_target_time for PITR", () => {
    expect(content).toContain("recovery_target_time");
  });

  it("configures restore_command for WAL replay", () => {
    expect(content).toContain("restore_command");
    expect(content).toContain("wal-archive");
  });
});

describe("crontab includes weekly base-backup schedule", () => {
  const crontabPath = resolve(ROOT, "scripts/backup/crontab");
  let content = "";

  beforeAll(() => {
    if (existsSync(crontabPath)) {
      content = readFileSync(crontabPath, "utf-8");
    }
  });

  it("crontab has weekly base-backup.sh entry (Sunday 3:00 AM)", () => {
    expect(content).toContain("base-backup.sh");
    expect(content).toMatch(/0 3 \* \* 0/);
  });
});

describe("runbook documents pg_basebackup PITR pipeline", () => {
  const runbookPath = resolve(ROOT, "docs/backup-recovery-runbook.md");
  let content = "";

  beforeAll(() => {
    if (existsSync(runbookPath)) {
      content = readFileSync(runbookPath, "utf-8");
    }
  });

  it("runbook references pg_basebackup", () => {
    expect(content).toContain("pg_basebackup");
  });

  it("runbook describes three-tier backup strategy", () => {
    expect(content).toContain("Weekly pg_basebackup");
  });

  it("runbook S3 structure includes base-backups/ prefix", () => {
    expect(content).toContain("base-backups/");
  });

  it("runbook PITR section no longer has limitation warning", () => {
    expect(content).not.toContain("not functional");
  });
});
