import "server-only";
import type { ScreeningResult, ScreeningInput } from "./types";
import { RULES } from "./registry";
import { getActiveBlocklistPhrases } from "@igbo/db/queries/portal-screening-keywords";

export { type ScreeningInput, type ScreeningResult };

export const RULE_VERSION = RULES.reduce((sum, rule) => sum + rule.version, 0);

export async function runScreening(input: ScreeningInput): Promise<ScreeningResult> {
  // Load blocklist once before iterating rules
  const blocklistPhrases = await getActiveBlocklistPhrases();
  const ctx = { blocklistPhrases };

  const allFlags = (
    await Promise.all(RULES.map((rule) => Promise.resolve(rule.run(input, ctx))))
  ).flat();

  const hasHigh = allFlags.some((f) => f.severity === "high");
  const hasMedium = allFlags.some((f) => f.severity === "medium");

  const status: "pass" | "warning" | "fail" = hasHigh ? "fail" : hasMedium ? "warning" : "pass";

  return {
    status,
    flags: allFlags,
    checked_at: new Date().toISOString(),
    rule_version: RULE_VERSION,
  };
}
