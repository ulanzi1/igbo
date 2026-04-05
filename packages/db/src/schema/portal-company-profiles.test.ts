// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  portalCompanyProfiles,
  type PortalCompanyProfile,
  type NewPortalCompanyProfile,
} from "./portal-company-profiles";

describe("portalCompanyProfiles schema", () => {
  it("has all required columns", () => {
    const cols = Object.keys(portalCompanyProfiles);
    expect(cols).toContain("id");
    expect(cols).toContain("ownerUserId");
    expect(cols).toContain("name");
    expect(cols).toContain("logoUrl");
    expect(cols).toContain("description");
    expect(cols).toContain("industry");
    expect(cols).toContain("companySize");
    expect(cols).toContain("cultureInfo");
    expect(cols).toContain("trustBadge");
    expect(cols).toContain("onboardingCompletedAt");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });

  it("exports PortalCompanyProfile select type with all required columns", () => {
    // Compile-time check — if this type assertion compiles, schema shape is correct
    const _check: PortalCompanyProfile = {
      id: "uuid-1",
      ownerUserId: "uuid-2",
      name: "Test Company",
      logoUrl: null,
      description: null,
      industry: null,
      companySize: null,
      cultureInfo: null,
      trustBadge: false,
      onboardingCompletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(_check.id).toBe("uuid-1");
    expect(_check.trustBadge).toBe(false);
    expect(_check.onboardingCompletedAt).toBeNull();
  });

  it("has onboardingCompletedAt column (nullable)", () => {
    expect(portalCompanyProfiles.onboardingCompletedAt).toBeDefined();
  });

  it("exports NewPortalCompanyProfile insert type with required fields", () => {
    const _check: NewPortalCompanyProfile = {
      ownerUserId: "uuid-2",
      name: "Test Company",
    };
    expect(_check.name).toBe("Test Company");
  });

  it("has ownerUserId column", () => {
    expect(portalCompanyProfiles.ownerUserId).toBeDefined();
  });

  it("has trustBadge column", () => {
    expect(portalCompanyProfiles.trustBadge).toBeDefined();
  });

  it("has createdAt and updatedAt columns", () => {
    expect(portalCompanyProfiles.createdAt).toBeDefined();
    expect(portalCompanyProfiles.updatedAt).toBeDefined();
  });
});
