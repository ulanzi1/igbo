// @vitest-environment node
import { describe, it, expect } from "vitest";
import { EMPLOYER_STATUS_GROUP_MAP } from "./employer-application-constants";
import { portalApplicationStatusEnum } from "@igbo/db/schema/portal-applications";

const ALL_STATUSES = portalApplicationStatusEnum.enumValues;

describe("EMPLOYER_STATUS_GROUP_MAP drift guard", () => {
  it("covers every PortalApplicationStatus exactly once", () => {
    const covered = Object.values(EMPLOYER_STATUS_GROUP_MAP).flat();

    // Every status is covered
    for (const status of ALL_STATUSES) {
      expect(covered).toContain(status);
    }

    // No duplicates
    const unique = new Set(covered);
    expect(unique.size).toBe(covered.length);

    // No extras beyond known statuses
    for (const status of covered) {
      expect(ALL_STATUSES).toContain(status);
    }
  });
});
