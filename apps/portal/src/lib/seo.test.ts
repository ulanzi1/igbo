import { describe, it, expect } from "vitest";
import { buildJobPostingJsonLd, buildJobOpenGraph, buildJobTwitterCard } from "./seo";

const PORTAL_URL = "https://jobs.igbo.com";

const basePosting = {
  id: "posting-uuid",
  title: "Senior Software Engineer",
  descriptionHtml: "<p>We need a <strong>talented</strong> engineer.</p>",
  location: "Lagos, Nigeria",
  employmentType: "full_time",
  salaryMin: 5000000,
  salaryMax: 8000000,
  salaryCompetitiveOnly: false,
  applicationDeadline: null,
  expiresAt: null,
  createdAt: new Date("2026-04-01T00:00:00Z"),
};

const baseCompany = {
  id: "company-uuid",
  name: "Acme Corp",
  logoUrl: "https://cdn.example.com/logo.png",
};

describe("buildJobPostingJsonLd", () => {
  it("returns correct @context and @type", () => {
    const result = buildJobPostingJsonLd(basePosting, baseCompany, PORTAL_URL);
    expect(result["@context"]).toBe("https://schema.org");
    expect(result["@type"]).toBe("JobPosting");
  });

  it("includes title and datePosted", () => {
    const result = buildJobPostingJsonLd(basePosting, baseCompany, PORTAL_URL);
    expect(result.title).toBe("Senior Software Engineer");
    expect(result.datePosted).toBe("2026-04-01");
  });

  it("maps full_time employment type correctly", () => {
    const result = buildJobPostingJsonLd(basePosting, baseCompany, PORTAL_URL);
    expect(result.employmentType).toBe("FULL_TIME");
  });

  it("maps part_time employment type correctly", () => {
    const result = buildJobPostingJsonLd(
      { ...basePosting, employmentType: "part_time" },
      baseCompany,
      PORTAL_URL,
    );
    expect(result.employmentType).toBe("PART_TIME");
  });

  it("maps contract employment type correctly", () => {
    const result = buildJobPostingJsonLd(
      { ...basePosting, employmentType: "contract" },
      baseCompany,
      PORTAL_URL,
    );
    expect(result.employmentType).toBe("CONTRACTOR");
  });

  it("maps internship employment type correctly", () => {
    const result = buildJobPostingJsonLd(
      { ...basePosting, employmentType: "internship" },
      baseCompany,
      PORTAL_URL,
    );
    expect(result.employmentType).toBe("INTERN");
  });

  it("maps apprenticeship employment type to OTHER", () => {
    const result = buildJobPostingJsonLd(
      { ...basePosting, employmentType: "apprenticeship" },
      baseCompany,
      PORTAL_URL,
    );
    expect(result.employmentType).toBe("OTHER");
  });

  it("includes baseSalary when both min and max are set", () => {
    const result = buildJobPostingJsonLd(basePosting, baseCompany, PORTAL_URL);
    const salary = result.baseSalary as Record<string, unknown>;
    expect(salary).toBeDefined();
    expect(salary["@type"]).toBe("MonetaryAmount");
    expect(salary.currency).toBe("NGN");
    const value = salary.value as Record<string, unknown>;
    expect(value.minValue).toBe(5000000);
    expect(value.maxValue).toBe(8000000);
    expect(value.unitText).toBe("YEAR");
  });

  it("includes baseSalary when only salaryMin is set", () => {
    const result = buildJobPostingJsonLd(
      { ...basePosting, salaryMax: null },
      baseCompany,
      PORTAL_URL,
    );
    const salary = result.baseSalary as Record<string, unknown>;
    expect(salary).toBeDefined();
    const value = salary.value as Record<string, unknown>;
    expect(value.minValue).toBe(5000000);
    expect(value.maxValue).toBeUndefined();
  });

  it("omits baseSalary when salaryCompetitiveOnly is true", () => {
    const result = buildJobPostingJsonLd(
      { ...basePosting, salaryCompetitiveOnly: true },
      baseCompany,
      PORTAL_URL,
    );
    expect(result.baseSalary).toBeUndefined();
  });

  it("omits baseSalary when both salary values are null", () => {
    const result = buildJobPostingJsonLd(
      { ...basePosting, salaryMin: null, salaryMax: null },
      baseCompany,
      PORTAL_URL,
    );
    expect(result.baseSalary).toBeUndefined();
  });

  it("validThrough uses applicationDeadline when it is earlier than expiresAt", () => {
    const deadline = new Date("2026-05-01T00:00:00Z");
    const expiresAt = new Date("2026-06-01T00:00:00Z");
    const result = buildJobPostingJsonLd(
      { ...basePosting, applicationDeadline: deadline, expiresAt },
      baseCompany,
      PORTAL_URL,
    );
    expect(result.validThrough).toBe(deadline.toISOString());
  });

  it("validThrough uses expiresAt when it is earlier than applicationDeadline", () => {
    const deadline = new Date("2026-06-01T00:00:00Z");
    const expiresAt = new Date("2026-05-01T00:00:00Z");
    const result = buildJobPostingJsonLd(
      { ...basePosting, applicationDeadline: deadline, expiresAt },
      baseCompany,
      PORTAL_URL,
    );
    expect(result.validThrough).toBe(expiresAt.toISOString());
  });

  it("validThrough uses applicationDeadline when expiresAt is null", () => {
    const deadline = new Date("2026-05-15T00:00:00Z");
    const result = buildJobPostingJsonLd(
      { ...basePosting, applicationDeadline: deadline, expiresAt: null },
      baseCompany,
      PORTAL_URL,
    );
    expect(result.validThrough).toBe(deadline.toISOString());
  });

  it("validThrough uses expiresAt when applicationDeadline is null", () => {
    const expiresAt = new Date("2026-05-20T00:00:00Z");
    const result = buildJobPostingJsonLd(
      { ...basePosting, applicationDeadline: null, expiresAt },
      baseCompany,
      PORTAL_URL,
    );
    expect(result.validThrough).toBe(expiresAt.toISOString());
  });

  it("omits validThrough when both applicationDeadline and expiresAt are null", () => {
    const result = buildJobPostingJsonLd(
      { ...basePosting, applicationDeadline: null, expiresAt: null },
      baseCompany,
      PORTAL_URL,
    );
    expect(result.validThrough).toBeUndefined();
  });

  it("includes jobLocation when location is set", () => {
    const result = buildJobPostingJsonLd(basePosting, baseCompany, PORTAL_URL);
    const loc = result.jobLocation as Record<string, unknown>;
    expect(loc["@type"]).toBe("Place");
    expect(loc.address).toBe("Lagos, Nigeria");
  });

  it("omits jobLocation when location is null", () => {
    const result = buildJobPostingJsonLd(
      { ...basePosting, location: null },
      baseCompany,
      PORTAL_URL,
    );
    expect(result.jobLocation).toBeUndefined();
  });

  it("includes hiringOrganization with name, logo, and sameAs", () => {
    const result = buildJobPostingJsonLd(basePosting, baseCompany, PORTAL_URL);
    const org = result.hiringOrganization as Record<string, unknown>;
    expect(org["@type"]).toBe("Organization");
    expect(org.name).toBe("Acme Corp");
    expect(org.logo).toBe("https://cdn.example.com/logo.png");
    expect(org.sameAs).toBe(`${PORTAL_URL}/en/companies/company-uuid`);
  });

  it("omits logo in hiringOrganization when logoUrl is null", () => {
    const result = buildJobPostingJsonLd(
      basePosting,
      { ...baseCompany, logoUrl: null },
      PORTAL_URL,
    );
    const org = result.hiringOrganization as Record<string, unknown>;
    expect(org.logo).toBeUndefined();
  });

  it("includes identifier with OBIGBO name and posting id", () => {
    const result = buildJobPostingJsonLd(basePosting, baseCompany, PORTAL_URL);
    const ident = result.identifier as Record<string, unknown>;
    expect(ident["@type"]).toBe("PropertyValue");
    expect(ident.name).toBe("OBIGBO");
    expect(ident.value).toBe("posting-uuid");
  });

  it("strips HTML from description for plain text output", () => {
    const result = buildJobPostingJsonLd(basePosting, baseCompany, PORTAL_URL);
    expect(result.description).toBe("We need a talented engineer.");
    expect((result.description as string).includes("<")).toBe(false);
  });
});

describe("buildJobOpenGraph", () => {
  it("returns correct og:title", () => {
    const result = buildJobOpenGraph(basePosting, baseCompany, PORTAL_URL, "en");
    expect(result?.title).toBe("Senior Software Engineer at Acme Corp");
  });

  it("returns og:description as plain text (no HTML)", () => {
    const result = buildJobOpenGraph(basePosting, baseCompany, PORTAL_URL, "en");
    expect(result?.description).not.toContain("<");
    expect(result?.description).toContain("talented engineer");
  });

  it("returns og:type as website", () => {
    const result = buildJobOpenGraph(basePosting, baseCompany, PORTAL_URL, "en") as Record<
      string,
      unknown
    >;
    expect(result?.type).toBe("website");
  });

  it("returns og:siteName as OBIGBO Job Portal", () => {
    const result = buildJobOpenGraph(basePosting, baseCompany, PORTAL_URL, "en");
    expect(result?.siteName).toBe("OBIGBO Job Portal");
  });

  it("returns og:url as canonical URL (always /en/)", () => {
    const result = buildJobOpenGraph(basePosting, baseCompany, PORTAL_URL, "en");
    expect(result?.url).toBe(`${PORTAL_URL}/en/jobs/posting-uuid`);
  });

  it("uses company logoUrl as og:image when available", () => {
    const result = buildJobOpenGraph(basePosting, baseCompany, PORTAL_URL, "en");
    const images = result?.images;
    const firstImage = Array.isArray(images) ? images[0] : images;
    const imageUrl =
      typeof firstImage === "string" ? firstImage : (firstImage as { url: string })?.url;
    expect(imageUrl).toBe("https://cdn.example.com/logo.png");
  });

  it("falls back to og-default.png when logoUrl is null", () => {
    const result = buildJobOpenGraph(
      basePosting,
      { ...baseCompany, logoUrl: null },
      PORTAL_URL,
      "en",
    );
    const images = result?.images;
    const firstImage = Array.isArray(images) ? images[0] : images;
    const imageUrl =
      typeof firstImage === "string" ? firstImage : (firstImage as { url: string })?.url;
    expect(imageUrl).toBe(`${PORTAL_URL}/og-default.png`);
  });

  it("omits images entirely when logoUrl is null and portalUrl is empty", () => {
    const result = buildJobOpenGraph(basePosting, { ...baseCompany, logoUrl: null }, "", "en");
    // When portalUrl is empty, imageUrl = null → images omitted
    expect(result?.images).toBeUndefined();
  });

  it("returns og:locale matching the provided locale", () => {
    const result = buildJobOpenGraph(basePosting, baseCompany, PORTAL_URL, "ig");
    expect(result?.locale).toBe("ig");
  });
});

describe("buildJobTwitterCard", () => {
  it("returns twitter:card as summary", () => {
    const result = buildJobTwitterCard(basePosting, baseCompany, PORTAL_URL) as Record<
      string,
      unknown
    >;
    expect(result?.card).toBe("summary");
  });

  it("returns twitter:title", () => {
    const result = buildJobTwitterCard(basePosting, baseCompany, PORTAL_URL);
    expect(result?.title).toBe("Senior Software Engineer at Acme Corp");
  });

  it("returns twitter:description as plain text", () => {
    const result = buildJobTwitterCard(basePosting, baseCompany, PORTAL_URL);
    expect(result?.description).not.toContain("<");
    expect(result?.description).toContain("talented engineer");
  });

  it("returns twitter:image from company logoUrl", () => {
    const result = buildJobTwitterCard(basePosting, baseCompany, PORTAL_URL);
    const images = result?.images;
    const firstImage = Array.isArray(images) ? images[0] : images;
    expect(firstImage).toBe("https://cdn.example.com/logo.png");
  });

  it("falls back to og-default.png when logoUrl is null", () => {
    const result = buildJobTwitterCard(basePosting, { ...baseCompany, logoUrl: null }, PORTAL_URL);
    const images = result?.images;
    const firstImage = Array.isArray(images) ? images[0] : images;
    expect(firstImage).toBe(`${PORTAL_URL}/og-default.png`);
  });

  it("omits images when logoUrl is null and portalUrl is empty", () => {
    const result = buildJobTwitterCard(basePosting, { ...baseCompany, logoUrl: null }, "");
    expect(result?.images).toBeUndefined();
  });
});
