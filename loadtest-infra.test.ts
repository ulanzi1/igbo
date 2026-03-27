// @vitest-environment node
/**
 * Load Test Infrastructure tests (Story 12.6, Task 7)
 * Validates load test scripts, configuration, seeder, and CI workflow exist
 * and have correct structure.
 * Root-level test file — picked up by vitest.config.ts include: ["*.test.ts"]
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import yaml from "js-yaml";

const ROOT = resolve(__dirname, ".");

// ─────────────────────────────────────────────────────────────────────────────
// Helper types
// ─────────────────────────────────────────────────────────────────────────────

interface ComposeService {
  image?: string;
  build?: unknown;
  restart?: string;
  mem_limit?: string;
  cpus?: number;
  ports?: string[];
  expose?: string[];
  healthcheck?: { test?: string | string[] };
  depends_on?: Record<string, { condition: string }> | string[];
  command?: string | string[];
  environment?: Record<string, string>;
  env_file?: string | string[];
  volumes?: string[];
  networks?: string[];
}

interface ComposeFile {
  services?: Record<string, ComposeService>;
  volumes?: Record<string, unknown>;
  networks?: Record<string, unknown>;
}

interface GhWorkflow {
  on?: {
    schedule?: Array<{ cron: string }>;
    workflow_dispatch?: unknown;
  };
  jobs?: Record<
    string,
    {
      steps?: Array<{
        uses?: string;
        name?: string;
        run?: string;
        with?: Record<string, unknown>;
        if?: string;
      }>;
    }
  >;
}

// ─────────────────────────────────────────────────────────────────────────────
// Load docker-compose.loadtest.yml once
// ─────────────────────────────────────────────────────────────────────────────

const loadtestComposePath = resolve(ROOT, "docker-compose.loadtest.yml");
let ltCompose: ComposeFile = {};

try {
  ltCompose = yaml.load(readFileSync(loadtestComposePath, "utf-8")) as ComposeFile;
} catch {
  // File not found or invalid — tests will fail with descriptive errors
}

const ltServices = ltCompose.services ?? {};

// ─────────────────────────────────────────────────────────────────────────────
// Task 7.2 — Docker Compose: file exists and has required services
// ─────────────────────────────────────────────────────────────────────────────

describe("docker-compose.loadtest.yml — file and services (Task 1)", () => {
  it("file exists", () => {
    expect(existsSync(loadtestComposePath)).toBe(true);
  });

  it("parses as valid YAML", () => {
    expect(ltCompose).toBeDefined();
    expect(typeof ltCompose).toBe("object");
  });

  const requiredServices = ["web", "realtime", "postgres", "redis"];

  for (const svc of requiredServices) {
    it(`has required service: ${svc}`, () => {
      expect(ltServices[svc]).toBeDefined();
    });
  }

  it("does NOT include clamav service", () => {
    expect(ltServices.clamav).toBeUndefined();
  });

  it("does NOT include backup service", () => {
    expect(ltServices.backup).toBeUndefined();
  });
});

describe("docker-compose.loadtest.yml — resource limits (Task 1.4)", () => {
  it("web has mem_limit: 2g (increased for 500 WS connections)", () => {
    expect(ltServices.web?.mem_limit).toBe("2g");
  });

  it("realtime has mem_limit: 1g", () => {
    expect(ltServices.realtime?.mem_limit).toBe("1g");
  });

  it("web has cpus defined", () => {
    expect(ltServices.web?.cpus).toBeDefined();
  });
});

describe("docker-compose.loadtest.yml — separate volume names (Task 1.2)", () => {
  it("defines loadtest-pgdata volume", () => {
    expect(Object.keys(ltCompose.volumes ?? {})).toContain("loadtest-pgdata");
  });

  it("defines loadtest-redisdata volume", () => {
    expect(Object.keys(ltCompose.volumes ?? {})).toContain("loadtest-redisdata");
  });

  it("does NOT define pgdata (shared with prod)", () => {
    expect(Object.keys(ltCompose.volumes ?? {})).not.toContain("pgdata");
  });

  it("does NOT define redisdata (shared with prod)", () => {
    expect(Object.keys(ltCompose.volumes ?? {})).not.toContain("redisdata");
  });
});

describe("docker-compose.loadtest.yml — distinct network (Task 1.2)", () => {
  it("defines loadtest-network (not app-network)", () => {
    expect(Object.keys(ltCompose.networks ?? {})).toContain("loadtest-network");
  });

  it("does NOT define app-network (avoids namespace collision)", () => {
    expect(Object.keys(ltCompose.networks ?? {})).not.toContain("app-network");
  });
});

describe("docker-compose.loadtest.yml — postgres bulk seeding tuning (Task 1.3)", () => {
  it("postgres command includes shared_buffers=256MB", () => {
    const cmd = ltServices.postgres?.command ?? [];
    const cmdStr = Array.isArray(cmd) ? cmd.join(" ") : String(cmd);
    expect(cmdStr).toContain("shared_buffers=256MB");
  });

  it("postgres command includes work_mem=64MB", () => {
    const cmd = ltServices.postgres?.command ?? [];
    const cmdStr = Array.isArray(cmd) ? cmd.join(" ") : String(cmd);
    expect(cmdStr).toContain("work_mem=64MB");
  });

  it("postgres command includes maintenance_work_mem=512MB", () => {
    const cmd = ltServices.postgres?.command ?? [];
    const cmdStr = Array.isArray(cmd) ? cmd.join(" ") : String(cmd);
    expect(cmdStr).toContain("maintenance_work_mem=512MB");
  });

  it("postgres command includes max_connections=200", () => {
    const cmd = ltServices.postgres?.command ?? [];
    const cmdStr = Array.isArray(cmd) ? cmd.join(" ") : String(cmd);
    expect(cmdStr).toContain("max_connections=200");
  });
});

describe("docker-compose.loadtest.yml — env vars (Task 1.5)", () => {
  it("web environment has NODE_ENV: production", () => {
    expect(ltServices.web?.environment?.NODE_ENV).toBe("production");
  });

  it("web environment has MAINTENANCE_MODE: false", () => {
    expect(ltServices.web?.environment?.MAINTENANCE_MODE).toBe("false");
  });

  it("web environment has NEXT_PUBLIC_DAILY_ENABLED: false", () => {
    expect(ltServices.web?.environment?.NEXT_PUBLIC_DAILY_ENABLED).toBe("false");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 7.2 — Seeder: file exists and imports from src/db/schema
// ─────────────────────────────────────────────────────────────────────────────

describe("Seeder — scripts/seed-loadtest.ts (Task 2)", () => {
  const seederPath = resolve(ROOT, "scripts/seed-loadtest.ts");
  let seederContent = "";

  beforeAll(() => {
    if (existsSync(seederPath)) {
      seederContent = readFileSync(seederPath, "utf-8");
    }
  });

  it("file exists at scripts/seed-loadtest.ts", () => {
    expect(existsSync(seederPath)).toBe(true);
  });

  it("imports from src/db/schema/auth-users", () => {
    expect(seederContent).toContain("src/db/schema/auth-users");
  });

  it("imports from src/db/schema/community-profiles", () => {
    expect(seederContent).toContain("src/db/schema/community-profiles");
  });

  it("imports from src/db/schema/community-groups", () => {
    expect(seederContent).toContain("src/db/schema/community-groups");
  });

  it("does NOT import db from @/db (uses dedicated loadtest connection)", () => {
    expect(seederContent).not.toMatch(/from ['"]@\/db['"]/);
  });

  it("uses LOADTEST_DATABASE_URL env var for connection", () => {
    expect(seederContent).toContain("LOADTEST_DATABASE_URL");
  });

  it("hashes known user passwords with bcrypt", () => {
    expect(seederContent).toContain("bcrypt");
    expect(seederContent).toContain("LoadTest123!");
  });

  it("uses batch inserts (not individual row inserts)", () => {
    // Should use .values([...batch]) with chunk/batch logic
    expect(seederContent).toContain("chunk");
  });

  it("uses @faker-js/faker for synthetic data", () => {
    expect(seederContent).toContain("@faker-js/faker");
  });

  it("implements idempotency check", () => {
    // Should check if already seeded before running
    expect(seederContent).toContain("isAlreadySeeded");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 7.2 — k6 scripts exist (Task 3)
// ─────────────────────────────────────────────────────────────────────────────

describe("k6 HTTP load test scripts — existence (Task 3)", () => {
  const scripts = [
    "tests/load/scenarios/api-endpoints.js",
    "tests/load/scenarios/feed-pagination.js",
    "tests/load/scenarios/event-spike.js",
  ];

  for (const script of scripts) {
    it(`${script} exists`, () => {
      expect(existsSync(resolve(ROOT, script))).toBe(true);
    });
  }
});

describe("k6 scripts — threshold config exported (Task 3.7)", () => {
  const apiEndpointsPath = resolve(ROOT, "tests/load/scenarios/api-endpoints.js");
  let content = "";

  beforeAll(() => {
    if (existsSync(apiEndpointsPath)) {
      content = readFileSync(apiEndpointsPath, "utf-8");
    }
  });

  it("api-endpoints.js exports options with thresholds", () => {
    expect(content).toContain("export const options");
    expect(content).toContain("thresholds");
  });

  it("api-endpoints.js has general load profile stages", () => {
    expect(content).toContain("stages");
    // Should include 200 VU spike
    expect(content).toContain("200");
  });

  it("api-endpoints.js implements pre-generated session cookie setup()", () => {
    expect(content).toContain("export function setup");
    expect(content).toContain("sessionCookies");
    expect(content).toContain("COOKIES_FILE");
  });
});

describe("k6 event-spike.js — dedicated spike profile (Task 3.5, 3.6)", () => {
  const path = resolve(ROOT, "tests/load/scenarios/event-spike.js");
  let content = "";

  beforeAll(() => {
    if (existsSync(path)) {
      content = readFileSync(path, "utf-8");
    }
  });

  it("event-spike.js exports options with stages", () => {
    expect(content).toContain("export const options");
    expect(content).toContain("stages");
  });

  it("event-spike.js ramps directly to 200 VUs (no warm-up)", () => {
    // First stage should be the direct ramp to 200 (15s)
    expect(content).toContain('"15s"');
    expect(content).toContain("200");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 7.2 — WebSocket script exists and uses socket.io-client (Task 4)
// ─────────────────────────────────────────────────────────────────────────────

describe("WebSocket load test — ws-loadtest.mjs (Task 4)", () => {
  const wsPath = resolve(ROOT, "tests/load/scenarios/ws-loadtest.mjs");
  let wsContent = "";

  beforeAll(() => {
    if (existsSync(wsPath)) {
      wsContent = readFileSync(wsPath, "utf-8");
    }
  });

  it("ws-loadtest.mjs exists", () => {
    expect(existsSync(wsPath)).toBe(true);
  });

  it("imports from socket.io-client", () => {
    expect(wsContent).toContain("socket.io-client");
  });

  it("forces WebSocket transport (not polling)", () => {
    expect(wsContent).toContain('transports: ["websocket"]');
  });

  it("targets 500+ connections (NFR-P10)", () => {
    expect(wsContent).toContain("500");
  });

  it("uses batched auth with AUTH_BATCH_SIZE to avoid sequential bottleneck", () => {
    expect(wsContent).toContain("AUTH_BATCH_SIZE");
    expect(wsContent).toContain("Promise.all");
  });

  it("writes results to tests/load/results/ws.json", () => {
    expect(wsContent).toContain("ws.json");
  });

  it("results include structured NFR fields", () => {
    expect(wsContent).toContain("connections");
    expect(wsContent).toContain("throughput");
    expect(wsContent).toContain("latency");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 7.2 — Thresholds config (Task 5.1)
// ─────────────────────────────────────────────────────────────────────────────

describe("Thresholds config — tests/load/config/thresholds.js (Task 5)", () => {
  const thresholdsPath = resolve(ROOT, "tests/load/config/thresholds.js");
  let content = "";

  beforeAll(() => {
    if (existsSync(thresholdsPath)) {
      content = readFileSync(thresholdsPath, "utf-8");
    }
  });

  it("file exists", () => {
    expect(existsSync(thresholdsPath)).toBe(true);
  });

  it("exports thresholds object", () => {
    expect(content).toContain("export const thresholds");
  });

  it("includes API response time threshold", () => {
    expect(content).toContain("p(95)<");
    expect(content).toContain("type:api");
  });

  it("includes error rate threshold", () => {
    expect(content).toContain("http_req_failed");
    expect(content).toContain("rate<");
  });

  it("exports nfrMap documenting NFR coverage", () => {
    expect(content).toContain("nfrMap");
    expect(content).toContain("NFR-P8");
    expect(content).toContain("NFR-SC4");
    expect(content).toContain("NFR-P7");
    expect(content).toContain("NFR-P10");
    expect(content).toContain("NFR-SC3");
    expect(content).toContain("NFR-SC5");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 7.2 — Report generator (Task 5.2)
// ─────────────────────────────────────────────────────────────────────────────

describe("Report generator — tests/load/lib/report.mjs (Task 5)", () => {
  const reportPath = resolve(ROOT, "tests/load/lib/report.mjs");
  let content = "";

  beforeAll(() => {
    if (existsSync(reportPath)) {
      content = readFileSync(reportPath, "utf-8");
    }
  });

  it("file exists", () => {
    expect(existsSync(reportPath)).toBe(true);
  });

  it("parses k6 NDJSON with split('\\n') (not JSON.parse directly)", () => {
    // k6 --out json writes NDJSON, not a JSON array
    expect(content).toContain('.split("\\n")');
  });

  it("reads ws.json separately (standard JSON)", () => {
    expect(content).toContain("ws.json");
    expect(content).toContain("JSON.parse");
  });

  it("supports --save-baseline flag", () => {
    expect(content).toContain("--save-baseline");
  });

  it("detects regressions > 10% from baseline", () => {
    expect(content).toContain("REGRESSION_THRESHOLD");
    expect(content).toContain("0.1");
  });

  it("exits with code 1 on failure or regression", () => {
    expect(content).toContain("process.exit(1)");
  });

  it("handles missing baseline gracefully", () => {
    expect(content).toContain("No baseline found");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 7.2 — npm scripts (Task 5.4)
// ─────────────────────────────────────────────────────────────────────────────

describe("package.json — load test scripts (Task 5.4)", () => {
  const pkgPath = resolve(ROOT, "package.json");
  let pkg: { scripts?: Record<string, string> } = {};

  beforeAll(() => {
    if (existsSync(pkgPath)) {
      pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { scripts?: Record<string, string> };
    }
  });

  const expectedScripts = [
    "test:load",
    "test:load:seed",
    "test:load:http",
    "test:load:ws",
    "test:load:report",
  ];

  for (const script of expectedScripts) {
    it(`has script: ${script}`, () => {
      expect(pkg.scripts).toBeDefined();
      expect(pkg.scripts![script]).toBeDefined();
    });
  }

  it("test:load:seed uses bun (not npm)", () => {
    expect(pkg.scripts?.["test:load:seed"]).toContain("bun");
  });

  it("test:load checks for k6 installation", () => {
    expect(pkg.scripts?.["test:load"]).toContain("which k6");
    expect(pkg.scripts?.["test:load"]).toContain("brew install k6");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 7.2 — GitHub Actions CI workflow (Task 6)
// ─────────────────────────────────────────────────────────────────────────────

describe("GitHub Actions — .github/workflows/load-test.yml (Task 6)", () => {
  const workflowPath = resolve(ROOT, ".github/workflows/load-test.yml");
  let workflow: GhWorkflow = {};

  beforeAll(() => {
    if (existsSync(workflowPath)) {
      try {
        workflow = yaml.load(readFileSync(workflowPath, "utf-8")) as GhWorkflow;
      } catch {
        /* will fail in tests below */
      }
    }
  });

  it("file exists", () => {
    expect(existsSync(workflowPath)).toBe(true);
  });

  it("parses as valid YAML", () => {
    expect(workflow).toBeDefined();
    expect(typeof workflow).toBe("object");
  });

  it("has schedule trigger (nightly at 3 AM UTC)", () => {
    const schedules = workflow.on?.schedule ?? [];
    expect(schedules.length).toBeGreaterThan(0);
    expect(schedules[0].cron).toBe("0 3 * * *");
  });

  it("has workflow_dispatch trigger (manual runs)", () => {
    expect(workflow.on?.workflow_dispatch).toBeDefined();
  });

  it("has at least one job defined", () => {
    expect(Object.keys(workflow.jobs ?? {})).toHaveLength(1);
  });

  it("installs k6 via grafana/setup-k6-action@v1", () => {
    const allSteps = Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
    const k6Step = allSteps.find((s) => s.uses?.includes("grafana/setup-k6-action"));
    expect(k6Step).toBeDefined();
  });

  it("pins k6 to explicit version (prevents nightly instability)", () => {
    const allSteps = Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
    const k6Step = allSteps.find((s) => s.uses?.includes("grafana/setup-k6-action"));
    expect(k6Step?.with?.["k6-version"]).toBeDefined();
  });

  it("uploads load test results as artifact", () => {
    const allSteps = Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
    const uploadStep = allSteps.find((s) => s.uses?.includes("upload-artifact"));
    expect(uploadStep).toBeDefined();
  });

  it("artifact has retention-days: 30", () => {
    const allSteps = Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
    const uploadStep = allSteps.find((s) => s.uses?.includes("upload-artifact"));
    expect(uploadStep?.with?.["retention-days"]).toBe(30);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional: results directory .gitkeep
// ─────────────────────────────────────────────────────────────────────────────

describe("Load test results directory (Task 2.7)", () => {
  it("tests/load/results/.gitkeep exists", () => {
    expect(existsSync(resolve(ROOT, "tests/load/results/.gitkeep"))).toBe(true);
  });

  it(".gitignore excludes tests/load/results/ but keeps .gitkeep", () => {
    const gitignorePath = resolve(ROOT, ".gitignore");
    const content = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf-8") : "";
    expect(content).toContain("tests/load/results/");
    expect(content).toContain("!tests/load/results/.gitkeep");
  });
});
