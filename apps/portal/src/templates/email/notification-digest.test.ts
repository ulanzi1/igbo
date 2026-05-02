// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "./notification-digest";

const BASE_DATA = {
  seekerName: "Ada Okafor",
  recommendations: [{ title: "Senior Engineer", body: "At Acme Corp", link: "/jobs/job-1" }],
  savedSearches: [
    {
      title: "3 new results for 'engineer'",
      body: "Search results updated",
      link: "/saved-searches/s-1",
    },
  ],
  activity: [
    {
      title: "Application reviewed",
      body: "Your application for Engineer was reviewed",
      link: "/applications/app-1",
    },
  ],
  preferencesUrl: "https://portal.igbo.global/settings/notifications",
};

describe("notification-digest email template", () => {
  it("renders English template with all sections present", () => {
    const result = render(BASE_DATA, "en");

    expect(result.subject).toContain("3"); // 1 rec + 1 saved + 1 activity = 3
    expect(result.subject).toContain("new item");
    expect(result.html).toContain("Ada Okafor");
    expect(result.html).toContain("New Job Recommendations");
    expect(result.html).toContain("Saved Search Results");
    expect(result.html).toContain("Activity Summary");
    expect(result.html).toContain("Senior Engineer");
    expect(result.html).toContain("OBIGBO"); // from base template header
  });

  it("renders Igbo template with translated section headings", () => {
    const result = render(BASE_DATA, "ig");

    expect(result.subject).toContain("Nkwurịta ọrụ gị");
    expect(result.html).toContain("Ndewo");
    expect(result.html).toContain("Ntụzi Ọrụ Ọhụrụ");
    expect(result.html).toContain("Nsonaazụ Achọchaa Ezipụtara");
    expect(result.html).toContain("Nchịkọta Ọrụ");
  });

  it("omits empty sections from HTML output", () => {
    const data = {
      ...BASE_DATA,
      recommendations: [],
      savedSearches: [],
      activity: [
        { title: "Status changed", body: "Application updated", link: "/applications/a-1" },
      ],
    };
    const result = render(data, "en");

    expect(result.html).not.toContain("New Job Recommendations");
    expect(result.html).not.toContain("Saved Search Results");
    expect(result.html).toContain("Activity Summary");
    expect(result.html).toContain("Status changed");
  });

  it("renders subject with singular 'item' for single notification", () => {
    const data = {
      ...BASE_DATA,
      recommendations: [{ title: "One Job", body: "At Corp", link: "/jobs/j-1" }],
      savedSearches: [],
      activity: [],
    };
    const result = render(data, "en");

    expect(result.subject).toContain("1 new item");
    expect(result.subject).not.toContain("items");
  });

  it("generates plain text version with all sections", () => {
    const result = render(BASE_DATA, "en");

    expect(result.text).toContain("Ada Okafor");
    expect(result.text).toContain("New Job Recommendations");
    expect(result.text).toContain("Senior Engineer");
    expect(result.text).toContain("Activity Summary");
    expect(result.text).toContain("Manage preferences");
  });
});
