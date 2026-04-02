// @vitest-environment node
/**
 * Production Infrastructure tests (Task 7)
 * Validates configuration files for production deployment.
 * Root-level test file — picked up by vitest.config.ts include: ["*.test.ts"]
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import yaml from "js-yaml";

const ROOT = resolve(__dirname, "../..");

// ─────────────────────────────────────────────────────────
// Helper types
// ─────────────────────────────────────────────────────────

interface ComposeService {
  image?: string;
  build?: unknown; // backup + postgres services use build: instead of image: (Story 12.4)
  restart?: string;
  mem_limit?: string;
  cpus?: number;
  ports?: string[];
  expose?: string[];
  healthcheck?: {
    test?: string | string[];
    interval?: string;
    timeout?: string;
    retries?: number;
    start_period?: string;
  };
  depends_on?: Record<string, { condition: string }> | string[];
  command?: string | string[];
  environment?: Record<string, string>;
  env_file?: string | string[];
  profiles?: string[];
  volumes?: string[];
}

interface ComposeFile {
  services?: Record<string, ComposeService>;
  volumes?: Record<string, unknown>;
  networks?: Record<string, unknown>;
}

interface K8sManifest {
  apiVersion?: string;
  kind?: string;
  metadata?: { name?: string; namespace?: string };
  spec?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────
// Load docker-compose.prod.yml once
// ─────────────────────────────────────────────────────────

const composePath = resolve(ROOT, "docker-compose.prod.yml");
let compose: ComposeFile = {};

try {
  compose = yaml.load(readFileSync(composePath, "utf-8")) as ComposeFile;
} catch {
  // File not found or invalid — tests will fail with descriptive errors
}

const services = compose.services ?? {};

describe("docker-compose.prod.yml — restart policies (Task 7.2)", () => {
  const expectedServices = ["web", "realtime", "postgres", "redis", "clamav", "backup"];

  for (const svc of expectedServices) {
    it(`${svc} has restart: unless-stopped`, () => {
      expect(services[svc]).toBeDefined();
      expect(services[svc].restart).toBe("unless-stopped");
    });
  }
});

describe("docker-compose.prod.yml — resource limits (Task 7.3)", () => {
  it("web has mem_limit defined", () => {
    expect(services.web?.mem_limit).toBeDefined();
    expect(typeof services.web.mem_limit).toBe("string");
  });

  it("web has cpus defined", () => {
    expect(services.web?.cpus).toBeDefined();
  });

  it("realtime has mem_limit defined", () => {
    expect(services.realtime?.mem_limit).toBeDefined();
  });

  it("realtime has cpus defined", () => {
    expect(services.realtime?.cpus).toBeDefined();
  });
});

describe("docker-compose.prod.yml — postgres and redis health checks (Task 7.4)", () => {
  it("postgres service exists", () => {
    expect(services.postgres).toBeDefined();
  });

  it("postgres has a healthcheck defined", () => {
    expect(services.postgres?.healthcheck).toBeDefined();
    expect(services.postgres?.healthcheck?.test).toBeDefined();
  });

  it("redis service exists", () => {
    expect(services.redis).toBeDefined();
  });

  it("redis has a healthcheck defined", () => {
    expect(services.redis?.healthcheck).toBeDefined();
    expect(services.redis?.healthcheck?.test).toBeDefined();
  });
});

describe("docker-compose.prod.yml — port exposure (Task 7.5)", () => {
  it("only web exposes port 3000", () => {
    const webPorts = services.web?.ports ?? [];
    expect(webPorts.some((p) => String(p).includes("3000"))).toBe(true);
  });

  it("only realtime exposes port 3001", () => {
    const realtimePorts = services.realtime?.ports ?? [];
    expect(realtimePorts.some((p) => String(p).includes("3001"))).toBe(true);
  });

  it("postgres does NOT expose port 5432 to host", () => {
    const postgresPorts = services.postgres?.ports ?? [];
    expect(postgresPorts.some((p) => String(p).includes("5432"))).toBe(false);
  });

  it("redis does NOT expose port 6379 to host", () => {
    const redisPorts = services.redis?.ports ?? [];
    expect(redisPorts.some((p) => String(p).includes("6379"))).toBe(false);
  });

  it("clamav does NOT expose port 3310 to host (when defined)", () => {
    const clamavPorts = services.clamav?.ports ?? [];
    expect(clamavPorts.some((p) => String(p).includes("3310"))).toBe(false);
  });
});

describe("docker-compose.prod.yml — ClamAV and backup services (Review Fix)", () => {
  it("clamav uses Docker Compose profiles", () => {
    expect(services.clamav?.profiles).toBeDefined();
    expect(services.clamav?.profiles).toContain("clamav");
  });

  it("clamav has resource limits", () => {
    expect(services.clamav?.mem_limit).toBeDefined();
    expect(services.clamav?.cpus).toBeDefined();
  });

  it("clamav has a healthcheck defined", () => {
    expect(services.clamav?.healthcheck).toBeDefined();
    expect(services.clamav?.healthcheck?.test).toBeDefined();
  });

  it("backup depends_on postgres with condition: service_healthy", () => {
    const dependsOn = services.backup?.depends_on as Record<string, { condition: string }>;
    expect(dependsOn).toBeDefined();
    expect(dependsOn.postgres).toBeDefined();
    expect(dependsOn.postgres.condition).toBe("service_healthy");
  });

  it("postgres has env_file: .env", () => {
    expect(services.postgres?.env_file).toBe(".env");
  });

  it("redis has env_file: .env", () => {
    expect(services.redis?.env_file).toBe(".env");
  });
});

describe("docker-compose.prod.yml — Redis password auth (Task 7.6)", () => {
  it("redis command includes --requirepass", () => {
    const command = services.redis?.command ?? "";
    expect(String(command)).toContain("--requirepass");
  });
});

describe("docker-compose.prod.yml — named volumes (Task 7.7)", () => {
  it("pgdata volume is defined", () => {
    expect(compose.volumes).toBeDefined();
    expect(Object.keys(compose.volumes ?? {})).toContain("pgdata");
  });

  it("redisdata volume is defined", () => {
    expect(Object.keys(compose.volumes ?? {})).toContain("redisdata");
  });
});

describe("docker-compose.prod.yml — depends_on with health conditions (Task 7.12)", () => {
  it("web depends_on postgres with condition: service_healthy", () => {
    const dependsOn = services.web?.depends_on as Record<string, { condition: string }>;
    expect(dependsOn).toBeDefined();
    expect(dependsOn.postgres).toBeDefined();
    expect(dependsOn.postgres.condition).toBe("service_healthy");
  });

  it("web depends_on redis with condition: service_healthy", () => {
    const dependsOn = services.web?.depends_on as Record<string, { condition: string }>;
    expect(dependsOn.redis).toBeDefined();
    expect(dependsOn.redis.condition).toBe("service_healthy");
  });
});

describe(".env.production.example — required vars (Task 7.8)", () => {
  const envExamplePath = resolve(ROOT, ".env.production.example");

  it("file exists", () => {
    expect(existsSync(envExamplePath)).toBe(true);
  });

  const requiredVars = [
    "DATABASE_URL",
    "DATABASE_POOL_SIZE",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_DB",
    "REDIS_URL",
    "REDIS_PASSWORD",
    "AUTH_SECRET",
    "AUTH_URL",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_REALTIME_URL",
    "REALTIME_INTERNAL_URL",
    "HETZNER_S3_ENDPOINT",
    "HETZNER_S3_REGION",
    "HETZNER_S3_BUCKET",
    "HETZNER_S3_ACCESS_KEY_ID",
    "HETZNER_S3_SECRET_ACCESS_KEY",
    "HETZNER_S3_PUBLIC_URL",
    "ENABLE_CLAMAV",
    "CLAMAV_HOST",
    "CLAMAV_PORT",
    "EMAIL_PROVIDER",
    "RESEND_API_KEY",
    "EMAIL_FROM_ADDRESS",
    "EMAIL_FROM_NAME",
    "ENABLE_EMAIL_SENDING",
    "DAILY_API_KEY",
    "DAILY_API_URL",
    "DAILY_WEBHOOK_SECRET",
    "VAPID_PRIVATE_KEY",
    "VAPID_CONTACT_EMAIL",
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    "BACKUP_S3_ENDPOINT",
    "BACKUP_S3_BUCKET",
    "BACKUP_S3_ACCESS_KEY_ID",
    "BACKUP_S3_SECRET_ACCESS_KEY",
    "EMAIL_SUPPORT_ADDRESS",
    "INCLUDE_RECEIVED_MESSAGES_IN_EXPORT",
    "ENABLE_GEOCODING",
    "NOMINATIM_URL",
    "REALTIME_PORT",
    "REALTIME_CORS_ORIGIN",
    "NODE_ENV",
  ];

  const envContent = existsSync(envExamplePath) ? readFileSync(envExamplePath, "utf-8") : "";

  for (const varName of requiredVars) {
    it(`contains ${varName}`, () => {
      expect(envContent).toContain(varName);
    });
  }
});

describe("K8s manifests — valid YAML and required fields (Task 7.9)", () => {
  const manifests = [
    { file: "k8s/web-deployment.yaml", kind: "Deployment", expectedReplicas: 2, hasProbes: true },
    {
      file: "k8s/realtime-deployment.yaml",
      kind: "Deployment",
      expectedReplicas: 2,
      hasProbes: true,
    },
    { file: "k8s/web-service.yaml", kind: "Service", expectedReplicas: null, hasProbes: false },
    {
      file: "k8s/realtime-service.yaml",
      kind: "Service",
      expectedReplicas: null,
      hasProbes: false,
    },
    {
      file: "k8s/web-hpa.yaml",
      kind: "HorizontalPodAutoscaler",
      expectedReplicas: null,
      hasProbes: false,
    },
    { file: "k8s/namespace.yaml", kind: "Namespace", expectedReplicas: null, hasProbes: false },
  ];

  for (const { file, kind, expectedReplicas, hasProbes } of manifests) {
    const filePath = resolve(ROOT, file);

    it(`${file} is valid YAML and has kind: ${kind}`, () => {
      expect(existsSync(filePath)).toBe(true);
      const doc = yaml.load(readFileSync(filePath, "utf-8")) as K8sManifest;
      expect(doc).toBeDefined();
      expect(doc.kind).toBe(kind);
      expect(doc.metadata?.name).toBeDefined();
    });

    if (expectedReplicas !== null) {
      it(`${file} has spec.replicas = ${expectedReplicas}`, () => {
        const doc = yaml.load(readFileSync(filePath, "utf-8")) as K8sManifest;
        expect((doc.spec as { replicas?: number })?.replicas).toBe(expectedReplicas);
      });
    }

    if (hasProbes) {
      it(`${file} has readinessProbe and livenessProbe on first container`, () => {
        const doc = yaml.load(readFileSync(filePath, "utf-8")) as K8sManifest;
        const spec = doc.spec as {
          template: {
            spec: {
              containers: Array<{ readinessProbe?: unknown; livenessProbe?: unknown }>;
            };
          };
        };
        const container = spec?.template?.spec?.containers?.[0];
        expect(container?.readinessProbe).toBeDefined();
        expect(container?.livenessProbe).toBeDefined();
      });
    }
  }
});

describe("Documentation files — existence checks (Task 7.10)", () => {
  const docs = [
    "docs/cloudflare-setup.md",
    "docs/hetzner-storage-setup.md",
    "docs/kubernetes-migration.md",
    "docs/secrets-management.md",
  ];

  for (const doc of docs) {
    it(`${doc} exists`, () => {
      expect(existsSync(resolve(ROOT, doc))).toBe(true);
    });
  }
});

describe("Helm chart — Chart.yaml (Task 7.11)", () => {
  const chartPath = resolve(ROOT, "k8s/helm/igbo/Chart.yaml");

  it("k8s/helm/igbo/Chart.yaml exists", () => {
    expect(existsSync(chartPath)).toBe(true);
  });

  it("Chart.yaml has valid name field", () => {
    const chart = yaml.load(readFileSync(chartPath, "utf-8")) as {
      name?: string;
      version?: string;
    };
    expect(chart.name).toBeDefined();
    expect(typeof chart.name).toBe("string");
    expect(chart.name!.length).toBeGreaterThan(0);
  });

  it("Chart.yaml has valid version field", () => {
    const chart = yaml.load(readFileSync(chartPath, "utf-8")) as {
      name?: string;
      version?: string;
    };
    expect(chart.version).toBeDefined();
    expect(typeof chart.version).toBe("string");
    // semver pattern: major.minor.patch
    expect(chart.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
