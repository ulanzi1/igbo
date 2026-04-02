// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "./article-rejected";

describe("article-rejected email template", () => {
  const data = {
    name: "Ada",
    title: "My Article",
    editUrl: "https://example.com/en/articles/uuid/edit",
    feedback: "Please add more cultural context.",
  };

  it("renders English subject and body with feedback", () => {
    const result = render(data, "en");
    expect(result.subject).toContain("not approved");
    expect(result.html).toContain("My Article");
    expect(result.html).toContain("cultural context");
    expect(result.text).toContain("Ada");
  });

  it("renders Igbo version with different subject", () => {
    const result = render(data, "ig");
    expect(result.subject).toBeDefined();
    expect(result.subject).not.toBe(render(data, "en").subject);
    expect(result.html).toBeTruthy();
  });

  it("escapes HTML in title and feedback to prevent XSS", () => {
    const xssData = {
      name: "Ada",
      title: "<script>alert(1)</script>",
      editUrl: "https://example.com",
      feedback: '<img src=x onerror="alert(2)">',
    };
    const result = render(xssData, "en");
    expect(result.html).not.toContain("<script>");
    expect(result.html).not.toContain("<img src=x");
  });
});
