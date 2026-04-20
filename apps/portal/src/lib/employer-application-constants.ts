import type { PortalApplicationStatus } from "@igbo/db/schema/portal-applications";

export const EMPLOYER_STATUS_GROUP_MAP: Record<string, PortalApplicationStatus[]> = {
  new: ["submitted"],
  inReview: ["under_review", "shortlisted"],
  interview: ["interview"],
  offered: ["offered"],
  closed: ["hired", "rejected", "withdrawn"],
};

export const EMPLOYER_STATUS_GROUP_KEYS = Object.keys(EMPLOYER_STATUS_GROUP_MAP);

export const EMPLOYER_SORT_WHITELIST = [
  "applicantName",
  "jobTitle",
  "status",
  "appliedDate",
] as const;

export type EmployerSortKey = (typeof EMPLOYER_SORT_WHITELIST)[number];

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
