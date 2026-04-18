// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "./saved-search-digest";

const SAMPLE_DATA = {
  seekerName: "Ada Obi",
  searches: [
    {
      name: "Lagos Engineers",
      newJobs: [
        {
          title: "Senior Engineer",
          company: "Igbo Tech",
          location: "Lagos",
          detailUrl: "https://portal.igbo.global/jobs/job-1",
        },
        {
          title: "Backend Developer",
          company: "Naija Labs",
          location: "Remote",
          detailUrl: "https://portal.igbo.global/jobs/job-2",
        },
      ],
    },
    {
      name: "Remote Finance",
      newJobs: [
        {
          title: "Finance Analyst",
          company: "Lagos Finance Co",
          location: null,
          detailUrl: "https://portal.igbo.global/jobs/job-3",
        },
      ],
    },
  ],
};

describe("saved-search-digest template", () => {
  it("renders English subject with correct job count", () => {
    const result = render(SAMPLE_DATA as Record<string, unknown>, "en");
    expect(result.subject).toContain("3 new jobs");
  });

  it("renders singular subject for 1 job", () => {
    const data = {
      ...SAMPLE_DATA,
      searches: [{ name: "S", newJobs: [SAMPLE_DATA.searches[0]!.newJobs[0]!] }],
    };
    const result = render(data as Record<string, unknown>, "en");
    expect(result.subject).toContain("1 new job");
    expect(result.subject).not.toContain("1 new jobs");
  });

  it("renders Igbo subject", () => {
    const result = render(SAMPLE_DATA as Record<string, unknown>, "ig");
    expect(result.subject).toContain("3");
    expect(result.subject).toMatch(/ọrụ ọhụrụ/i);
  });

  it("renders HTML with job titles and company names", () => {
    const result = render(SAMPLE_DATA as Record<string, unknown>, "en");
    expect(result.html).toContain("Senior Engineer");
    expect(result.html).toContain("Igbo Tech");
    expect(result.html).toContain("Finance Analyst");
  });

  it("renders HTML with seeker name greeting", () => {
    const result = render(SAMPLE_DATA as Record<string, unknown>, "en");
    expect(result.html).toContain("Ada Obi");
  });

  it("renders HTML with search section headers", () => {
    const result = render(SAMPLE_DATA as Record<string, unknown>, "en");
    expect(result.html).toContain("Lagos Engineers");
    expect(result.html).toContain("Remote Finance");
  });

  it("renders plain text alternative", () => {
    const result = render(SAMPLE_DATA as Record<string, unknown>, "en");
    expect(result.text).toContain("Ada Obi");
    expect(result.text).toContain("Senior Engineer");
    expect(result.text).toContain("Lagos Engineers");
  });

  it("handles missing location gracefully", () => {
    const result = render(SAMPLE_DATA as Record<string, unknown>, "en");
    // Finance Analyst has null location — should not crash
    expect(result.html).toContain("Finance Analyst");
  });

  it("handles empty searches array gracefully", () => {
    const data = { seekerName: "Ada", searches: [] };
    const result = render(data as Record<string, unknown>, "en");
    expect(result.subject).toContain("0 new jobs");
    expect(result.html).toBeTruthy();
  });

  it("escapes HTML in job title to prevent XSS", () => {
    const data = {
      seekerName: "Ada",
      searches: [
        {
          name: "S",
          newJobs: [
            {
              title: "<script>alert(1)</script>",
              company: "Co",
              location: null,
              detailUrl: "/jobs/1",
            },
          ],
        },
      ],
    };
    const result = render(data as Record<string, unknown>, "en");
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;script&gt;");
  });
});
