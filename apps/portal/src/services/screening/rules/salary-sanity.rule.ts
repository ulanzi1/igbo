import "server-only";
import type { ScreeningFlag, ScreeningInput } from "../types";
import {
  SALARY_MIN_BOUND,
  SALARY_MAX_BOUND,
  SALARY_OUTLIER_LOW,
  SALARY_OUTLIER_HIGH,
} from "../salary-bounds";

export function salarySanityRule(input: ScreeningInput): ScreeningFlag[] {
  // Skip entirely if competitive-only or either value is null
  if (input.salaryCompetitiveOnly || input.salaryMin === null || input.salaryMax === null) {
    return [];
  }

  const min = input.salaryMin;
  const max = input.salaryMax;

  // Evaluate in first-match-wins order (high severity first)
  if (min <= 0) {
    return [
      {
        rule_id: "salary_invalid",
        message: `Salary minimum (${min}) must be greater than 0.`,
        severity: "high",
        field: "salary",
      },
    ];
  }

  if (max <= min) {
    return [
      {
        rule_id: "salary_invalid",
        message: `Salary maximum (${max}) must be greater than minimum (${min}).`,
        severity: "high",
        field: "salary",
      },
    ];
  }

  if (max > 10 * min) {
    return [
      {
        rule_id: "salary_invalid",
        message: `Salary range too wide: max (${max}) is more than 10× min (${min}).`,
        severity: "high",
        field: "salary",
      },
    ];
  }

  if (min < SALARY_MIN_BOUND) {
    return [
      {
        rule_id: "salary_invalid",
        message: `Salary minimum (${min}) is below the platform minimum of ${SALARY_MIN_BOUND} NGN.`,
        severity: "high",
        field: "salary",
      },
    ];
  }

  if (max > SALARY_MAX_BOUND) {
    return [
      {
        rule_id: "salary_invalid",
        message: `Salary maximum (${max}) exceeds the platform maximum of ${SALARY_MAX_BOUND} NGN.`,
        severity: "high",
        field: "salary",
      },
    ];
  }

  // Medium severity outlier warnings (only reached when absolute bounds are satisfied)
  if (min < SALARY_OUTLIER_LOW) {
    return [
      {
        rule_id: "salary_outlier",
        message: `Salary minimum (${min} NGN) is unusually low.`,
        severity: "medium",
        field: "salary",
      },
    ];
  }

  if (max > SALARY_OUTLIER_HIGH) {
    return [
      {
        rule_id: "salary_outlier",
        message: `Salary maximum (${max} NGN) is unusually high.`,
        severity: "medium",
        field: "salary",
      },
    ];
  }

  return [];
}
