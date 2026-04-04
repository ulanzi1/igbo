import { scanForStaleImports } from "./check-stale-imports";
import { scanDirectProcessEnv } from "./check-process-env";
import { scanMissingServerOnly } from "./check-server-only";
import type { CheckResult } from "./types";

function run(): void {
  const rootDir = process.cwd();

  const staleImports = scanForStaleImports(rootDir);
  const processEnv = scanDirectProcessEnv(rootDir);
  const serverOnly = scanMissingServerOnly(rootDir);

  const allResults: CheckResult[] = [...staleImports, ...processEnv, ...serverOnly];

  if (allResults.length === 0) {
    console.log("✅ All CI checks passed.");
    process.exit(0);
  }

  // Group by check name
  const grouped = new Map<string, CheckResult[]>();
  for (const r of allResults) {
    const list = grouped.get(r.check) ?? [];
    list.push(r);
    grouped.set(r.check, list);
  }

  for (const [check, results] of grouped) {
    console.error(`\n❌ ${check} violations:`);
    for (const r of results) {
      console.error(`  ${r.file}:${r.line}: ${r.match}`);
    }
  }

  const parts: string[] = [];
  for (const check of ["stale-import", "process-env", "server-only"]) {
    const count = grouped.get(check)?.length ?? 0;
    parts.push(`${count} ${check}`);
  }
  console.error(`\n${allResults.length} violation(s): ${parts.join(", ")}`);
  process.exit(1);
}

// CLI guard: only execute when run directly
if (process.argv[1]?.includes("ci-checks/index")) {
  run();
}

export { run };
