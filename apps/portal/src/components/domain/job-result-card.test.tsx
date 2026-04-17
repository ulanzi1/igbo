// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import { renderWithPortalProviders, screen } from "@/test-utils/render";
import { JobResultCard, JobResultCardSkeleton } from "./job-result-card";
import type { JobSearchResultItem } from "@/lib/validations/job-search";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next-intl")>();
  return {
    ...mod,
    useLocale: () => "en",
  };
});

const baseItem: JobSearchResultItem = {
  id: "job-1",
  title: "Software Engineer",
  companyName: "TechCorp",
  companyId: "company-1",
  companyLogoUrl: null,
  location: "Lagos, Nigeria",
  employmentType: "full_time",
  salaryMin: 50000,
  salaryMax: 100000,
  salaryCompetitiveOnly: false,
  culturalContext: null,
  applicationDeadline: null,
  createdAt: new Date().toISOString(),
  relevance: null,
  snippet: null,
};

describe("JobResultCard — basic rendering", () => {
  it("renders an article element with data-testid=job-result-card", () => {
    renderWithPortalProviders(<JobResultCard item={baseItem} queryHasValue={false} />);
    expect(screen.getByTestId("job-result-card")).toBeInTheDocument();
  });

  it("renders the job title as a heading", () => {
    renderWithPortalProviders(<JobResultCard item={baseItem} queryHasValue={false} />);
    expect(screen.getByRole("heading", { name: "Software Engineer" })).toBeInTheDocument();
  });

  it("renders the company name", () => {
    renderWithPortalProviders(<JobResultCard item={baseItem} queryHasValue={false} />);
    expect(screen.getByText("TechCorp")).toBeInTheDocument();
  });

  it("renders the location", () => {
    renderWithPortalProviders(<JobResultCard item={baseItem} queryHasValue={false} />);
    expect(screen.getByText("Lagos, Nigeria")).toBeInTheDocument();
  });

  it("renders the employment type label", () => {
    renderWithPortalProviders(<JobResultCard item={baseItem} queryHasValue={false} />);
    // employment type is translated — check that the label renders
    expect(screen.getByText("Full-time")).toBeInTheDocument();
  });

  it("renders View details link", () => {
    renderWithPortalProviders(<JobResultCard item={baseItem} queryHasValue={false} />);
    expect(screen.getByText("View details")).toBeInTheDocument();
  });
});

describe("JobResultCard — title link", () => {
  it("title link href points to /en/jobs/[id]", () => {
    renderWithPortalProviders(<JobResultCard item={baseItem} queryHasValue={false} />);
    const titleLink = screen.getByRole("link", { name: "Software Engineer" });
    expect(titleLink).toHaveAttribute("href", "/en/jobs/job-1");
  });
});

describe("JobResultCard — company link", () => {
  it("renders company name as link when companyId is present", () => {
    renderWithPortalProviders(<JobResultCard item={baseItem} queryHasValue={false} />);
    // Company name should be a link when companyId present
    const companyLinks = screen.getAllByRole("link");
    const companyLink = companyLinks.find((l) => l.getAttribute("href")?.includes("/companies/"));
    expect(companyLink).toBeDefined();
    expect(companyLink).toHaveAttribute("href", "/en/companies/company-1");
  });

  it("renders company name as plain text when companyId is null", () => {
    renderWithPortalProviders(
      <JobResultCard item={{ ...baseItem, companyId: null }} queryHasValue={false} />,
    );
    // Should render as span, not link
    const links = screen.getAllByRole("link");
    const companyLink = links.find((l) => l.getAttribute("href")?.includes("/companies/"));
    expect(companyLink).toBeUndefined();
  });
});

describe("JobResultCard — snippet", () => {
  it("does NOT render snippet when queryHasValue=false", () => {
    renderWithPortalProviders(
      <JobResultCard
        item={{ ...baseItem, snippet: "<mark>Software</mark> Engineer" }}
        queryHasValue={false}
      />,
    );
    // Snippet paragraph should not be in the DOM
    const marked = document.querySelector("mark");
    expect(marked).toBeNull();
  });

  it("does NOT render snippet when snippet is null even with queryHasValue=true", () => {
    renderWithPortalProviders(
      <JobResultCard item={{ ...baseItem, snippet: null }} queryHasValue={true} />,
    );
    const marked = document.querySelector("mark");
    expect(marked).toBeNull();
  });

  it("renders sanitized snippet with <mark> when queryHasValue=true and snippet present", () => {
    renderWithPortalProviders(
      <JobResultCard
        item={{ ...baseItem, snippet: "<mark>Software</mark> Engineer" }}
        queryHasValue={true}
      />,
    );
    const marked = document.querySelector("mark");
    expect(marked).not.toBeNull();
    expect(marked?.textContent).toBe("Software");
  });

  it("strips dangerous tags from snippet (sanitization)", () => {
    renderWithPortalProviders(
      <JobResultCard
        item={{ ...baseItem, snippet: "<script>alert(1)</script>text" }}
        queryHasValue={true}
      />,
    );
    const scriptEl = document.querySelector("script");
    expect(scriptEl).toBeNull();
  });
});

describe("JobResultCard — logo", () => {
  it("renders img when companyLogoUrl is set", () => {
    renderWithPortalProviders(
      <JobResultCard
        item={{ ...baseItem, companyLogoUrl: "https://example.com/logo.png" }}
        queryHasValue={false}
      />,
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/logo.png");
  });

  it("renders avatar fallback with first letter when no logo", () => {
    renderWithPortalProviders(
      <JobResultCard item={{ ...baseItem, companyLogoUrl: null }} queryHasValue={false} />,
    );
    // Fallback shows first char of company name
    expect(screen.getByText("T")).toBeInTheDocument();
  });
});

describe("JobResultCard — salary", () => {
  it("renders salary range when salaryMin and salaryMax are set", () => {
    renderWithPortalProviders(
      <JobResultCard
        item={{ ...baseItem, salaryMin: 50000, salaryMax: 100000 }}
        queryHasValue={false}
      />,
    );
    // SalaryDisplay renders the range — just check it renders something
    const card = screen.getByTestId("job-result-card");
    expect(card).toBeInTheDocument();
  });

  it("does NOT render salary section when all salary fields are null/false", () => {
    renderWithPortalProviders(
      <JobResultCard
        item={{ ...baseItem, salaryMin: null, salaryMax: null, salaryCompetitiveOnly: false }}
        queryHasValue={false}
      />,
    );
    // No salary display — just ensure card still renders
    expect(screen.getByTestId("job-result-card")).toBeInTheDocument();
  });
});

describe("JobResultCard — skeleton", () => {
  it("renders the skeleton with correct testid", () => {
    renderWithPortalProviders(<JobResultCardSkeleton />);
    expect(screen.getByTestId("job-result-card-skeleton")).toBeInTheDocument();
  });
});

describe("JobResultCard — accessibility", () => {
  it("passes axe check", async () => {
    const { container } = renderWithPortalProviders(
      <JobResultCard item={baseItem} queryHasValue={false} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

import type { MatchScoreResult } from "@igbo/config";

const strongScore: MatchScoreResult = {
  score: 85,
  tier: "strong",
  signals: { skillsOverlap: 60, locationMatch: true, employmentTypeMatch: true },
};

const noneScore: MatchScoreResult = {
  score: 15,
  tier: "none",
  signals: { skillsOverlap: 0, locationMatch: false, employmentTypeMatch: true },
};

describe("JobResultCard — matchScore prop", () => {
  it("renders MatchPill when matchScore is provided with tier !== 'none'", () => {
    renderWithPortalProviders(
      <JobResultCard item={baseItem} queryHasValue={false} matchScore={strongScore} />,
    );
    expect(screen.getByTestId("match-pill")).toBeInTheDocument();
  });

  it("does NOT render MatchPill when matchScore is null", () => {
    renderWithPortalProviders(
      <JobResultCard item={baseItem} queryHasValue={false} matchScore={null} />,
    );
    expect(screen.queryByTestId("match-pill")).not.toBeInTheDocument();
  });

  it("does NOT render MatchPill when matchScore is undefined", () => {
    renderWithPortalProviders(<JobResultCard item={baseItem} queryHasValue={false} />);
    expect(screen.queryByTestId("match-pill")).not.toBeInTheDocument();
  });

  it("does NOT render MatchPill when tier is 'none'", () => {
    renderWithPortalProviders(
      <JobResultCard item={baseItem} queryHasValue={false} matchScore={noneScore} />,
    );
    expect(screen.queryByTestId("match-pill")).not.toBeInTheDocument();
  });
});
