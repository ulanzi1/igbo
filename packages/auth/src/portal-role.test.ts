// @vitest-environment node
import { describe, it, expect } from "vitest";

import { getActivePortalRole, type PortalRole } from "./portal-role";

describe("portal-role stub", () => {
  it("getActivePortalRole returns null (P-0.3B not yet implemented)", async () => {
    const result = await getActivePortalRole();
    expect(result).toBeNull();
  });

  it("PortalRole type includes expected values", () => {
    // Compile-time check — just verify the type exists at runtime
    const roles: PortalRole[] = ["JOB_SEEKER", "EMPLOYER", "JOB_ADMIN"];
    expect(roles).toHaveLength(3);
  });
});
