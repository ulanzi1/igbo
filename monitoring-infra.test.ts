// @vitest-environment node
/**
 * Monitoring Infrastructure tests (Task 9.4)
 * Validates configuration files for the monitoring stack.
 * Root-level test file — picked up by vitest.config.ts include: ["*.test.ts"]
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import yaml from "js-yaml";

const ROOT = resolve(__dirname, ".");

// ─────────────────────────────────────────────────────────
// Helper types
// ─────────────────────────────────────────────────────────

interface ComposeService {
  image?: string;
  restart?: string;
  mem_limit?: string;
  cpus?: number;
  ports?: string[];
  volumes?: string[];
  environment?: string[] | Record<string, string>;
  networks?: string[] | Record<string, unknown>;
}

interface ComposeFile {
  services?: Record<string, ComposeService>;
  volumes?: Record<string, unknown>;
  networks?: Record<string, unknown>;
}

interface PrometheusConfig {
  global?: { scrape_interval?: string; evaluation_interval?: string };
  scrape_configs?: Array<{ job_name: string; static_configs?: unknown[] }>;
  alerting?: { alertmanagers?: unknown[] };
  rule_files?: string[];
}

interface AlertRulesConfig {
  groups?: Array<{
    name: string;
    rules: Array<{ alert: string; expr: string }>;
  }>;
}

// ─────────────────────────────────────────────────────────
// docker-compose.monitoring.yml
// ─────────────────────────────────────────────────────────

const monitoringComposePath = resolve(ROOT, "docker-compose.monitoring.yml");
let monitoringCompose: ComposeFile = {};

try {
  monitoringCompose = yaml.load(readFileSync(monitoringComposePath, "utf-8")) as ComposeFile;
} catch {
  // File not found or invalid — tests will fail with descriptive errors
}

describe("docker-compose.monitoring.yml — required services", () => {
  it("file exists", () => {
    expect(existsSync(monitoringComposePath)).toBe(true);
  });

  it("is valid YAML with services", () => {
    expect(monitoringCompose.services).toBeDefined();
  });

  it("has prometheus service", () => {
    expect(monitoringCompose.services?.prometheus).toBeDefined();
  });

  it("grafana service is defined", () => {
    expect(monitoringCompose.services?.grafana).toBeDefined();
  });

  it("node-exporter service is defined", () => {
    expect(monitoringCompose.services?.["node-exporter"]).toBeDefined();
  });

  it("alertmanager service is defined", () => {
    expect(monitoringCompose.services?.alertmanager).toBeDefined();
  });

  it("prometheus has prom/prometheus image", () => {
    expect(monitoringCompose.services?.prometheus?.image).toContain("prom/prometheus");
  });

  it("grafana has grafana/grafana image", () => {
    expect(monitoringCompose.services?.grafana?.image).toContain("grafana/grafana");
  });

  it("grafana uses GRAFANA_ADMIN_PASSWORD env var", () => {
    const env = monitoringCompose.services?.grafana?.environment;
    const envStr = JSON.stringify(env);
    expect(envStr).toContain("GRAFANA_ADMIN_PASSWORD");
  });

  it("grafana has mem_limit defined", () => {
    expect(monitoringCompose.services?.grafana?.mem_limit).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────
// monitoring/prometheus/prometheus.yml
// ─────────────────────────────────────────────────────────

const promConfigPath = resolve(ROOT, "monitoring/prometheus/prometheus.yml");
let promConfig: PrometheusConfig = {};

try {
  promConfig = yaml.load(readFileSync(promConfigPath, "utf-8")) as PrometheusConfig;
} catch {
  // tests will fail with descriptive errors
}

describe("monitoring/prometheus/prometheus.yml", () => {
  it("file exists", () => {
    expect(existsSync(promConfigPath)).toBe(true);
  });

  it("is valid YAML", () => {
    expect(promConfig).toBeDefined();
  });

  it("has scrape_configs", () => {
    expect(promConfig.scrape_configs).toBeDefined();
    expect(Array.isArray(promConfig.scrape_configs)).toBe(true);
  });

  it("has scrape config for web target", () => {
    const webJob = promConfig.scrape_configs?.find((c) => c.job_name === "web");
    expect(webJob).toBeDefined();
  });

  it("has scrape config for realtime target", () => {
    const realtimeJob = promConfig.scrape_configs?.find((c) => c.job_name === "realtime");
    expect(realtimeJob).toBeDefined();
  });

  it("has global scrape_interval", () => {
    expect(promConfig.global?.scrape_interval).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────
// monitoring/prometheus/alert-rules.yml
// ─────────────────────────────────────────────────────────

const alertRulesPath = resolve(ROOT, "monitoring/prometheus/alert-rules.yml");
let alertRules: AlertRulesConfig = {};

try {
  alertRules = yaml.load(readFileSync(alertRulesPath, "utf-8")) as AlertRulesConfig;
} catch {
  // tests will fail with descriptive errors
}

describe("monitoring/prometheus/alert-rules.yml", () => {
  it("file exists", () => {
    expect(existsSync(alertRulesPath)).toBe(true);
  });

  it("is valid YAML with groups", () => {
    expect(alertRules.groups).toBeDefined();
    expect(Array.isArray(alertRules.groups)).toBe(true);
  });

  it("has HighErrorRate alert rule", () => {
    const allRules = alertRules.groups?.flatMap((g) => g.rules) ?? [];
    expect(allRules.find((r) => r.alert === "HighErrorRate")).toBeDefined();
  });

  it("has HighLatency alert rule", () => {
    const allRules = alertRules.groups?.flatMap((g) => g.rules) ?? [];
    expect(allRules.find((r) => r.alert === "HighLatency")).toBeDefined();
  });

  it("has HighDiskUsage alert rule", () => {
    const allRules = alertRules.groups?.flatMap((g) => g.rules) ?? [];
    expect(allRules.find((r) => r.alert === "HighDiskUsage")).toBeDefined();
  });

  it("has WebSocketConnectionDrop alert rule", () => {
    const allRules = alertRules.groups?.flatMap((g) => g.rules) ?? [];
    expect(allRules.find((r) => r.alert === "WebSocketConnectionDrop")).toBeDefined();
  });

  it("has HealthCheckFailure alert rule", () => {
    const allRules = alertRules.groups?.flatMap((g) => g.rules) ?? [];
    expect(allRules.find((r) => r.alert === "HealthCheckFailure")).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────
// monitoring/alertmanager/alertmanager.yml
// ─────────────────────────────────────────────────────────

describe("monitoring/alertmanager/alertmanager.yml", () => {
  it("file exists", () => {
    expect(existsSync(resolve(ROOT, "monitoring/alertmanager/alertmanager.yml"))).toBe(true);
  });

  it("is valid YAML", () => {
    const content = readFileSync(
      resolve(ROOT, "monitoring/alertmanager/alertmanager.yml"),
      "utf-8",
    );
    const parsed = yaml.load(content);
    expect(parsed).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────
// Grafana provisioning
// ─────────────────────────────────────────────────────────

describe("monitoring/grafana/provisioning/datasources/prometheus.yml", () => {
  it("file exists", () => {
    expect(
      existsSync(resolve(ROOT, "monitoring/grafana/provisioning/datasources/prometheus.yml")),
    ).toBe(true);
  });

  it("contains Prometheus datasource", () => {
    const content = readFileSync(
      resolve(ROOT, "monitoring/grafana/provisioning/datasources/prometheus.yml"),
      "utf-8",
    );
    expect(content).toContain("prometheus");
  });
});

// ─────────────────────────────────────────────────────────
// Grafana dashboard JSON
// ─────────────────────────────────────────────────────────

describe("monitoring/grafana/dashboards/igbo-overview.json", () => {
  it("file exists", () => {
    expect(existsSync(resolve(ROOT, "monitoring/grafana/dashboards/igbo-overview.json"))).toBe(
      true,
    );
  });

  it("is valid JSON", () => {
    const content = readFileSync(
      resolve(ROOT, "monitoring/grafana/dashboards/igbo-overview.json"),
      "utf-8",
    );
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it("has panels array", () => {
    const content = readFileSync(
      resolve(ROOT, "monitoring/grafana/dashboards/igbo-overview.json"),
      "utf-8",
    );
    const parsed = JSON.parse(content) as { panels?: unknown[] };
    expect(parsed.panels).toBeDefined();
    expect(Array.isArray(parsed.panels)).toBe(true);
    expect(parsed.panels!.length).toBeGreaterThan(0);
  });

  it("has required top-level dashboard fields", () => {
    const content = readFileSync(
      resolve(ROOT, "monitoring/grafana/dashboards/igbo-overview.json"),
      "utf-8",
    );
    const parsed = JSON.parse(content) as Record<string, unknown>;
    expect(parsed.title).toBeDefined();
    expect(parsed.uid).toBeDefined();
    expect(parsed.schemaVersion).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────
// Documentation files
// ─────────────────────────────────────────────────────────

describe("Documentation files — existence checks", () => {
  it("docs/monitoring-setup.md exists", () => {
    expect(existsSync(resolve(ROOT, "docs/monitoring-setup.md"))).toBe(true);
  });

  it("docs/uptimerobot-setup.md exists", () => {
    expect(existsSync(resolve(ROOT, "docs/uptimerobot-setup.md"))).toBe(true);
  });
});
