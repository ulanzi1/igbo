// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "./article-published";

describe("article-published email template", () => {
  const data = {
    name: "Ada",
    title: "My First Article",
    articleUrl: "https://example.com/en/articles/my-first-article",
  };

  it("renders English subject and body with article title", () => {
    const result = render(data, "en");
    expect(result.subject).toContain("published");
    expect(result.html).toContain("My First Article");
    expect(result.text).toContain("Ada");
    expect(result.html).toContain("example.com");
  });

  it("renders Igbo version with different subject", () => {
    const result = render(data, "ig");
    expect(result.subject).toBeDefined();
    expect(result.subject).not.toBe(render(data, "en").subject);
    expect(result.html).toBeTruthy();
  });

  it("escapes HTML in name and title to prevent XSS", () => {
    const xssData = {
      name: '<script>alert("xss")</script>',
      title: "<img src=x onerror=alert(1)>",
      articleUrl: "https://example.com",
    };
    const result = render(xssData, "en");
    expect(result.html).not.toContain("<script>");
    expect(result.html).not.toContain("<img src=x");
    expect(result.html).toContain("&lt;script&gt;");
  });
});
