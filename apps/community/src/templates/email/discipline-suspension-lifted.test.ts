// @vitest-environment node
import { describe, it, expect } from "vitest";
import { render } from "./discipline-suspension-lifted";

const DATA = { name: "Alice", reason: "Good behavior and time served" };

describe("discipline-suspension-lifted email template", () => {
  it("render with en locale returns non-empty subject, html, text", () => {
    const result = render(DATA, "en");
    expect(result.subject).toBeTruthy();
    expect(result.html).toBeTruthy();
    expect(result.text).toBeTruthy();
  });

  it("render with ig locale returns non-empty subject, html, text", () => {
    const result = render(DATA, "ig");
    expect(result.subject).toBeTruthy();
    expect(result.html).toBeTruthy();
    expect(result.text).toBeTruthy();
  });

  it("reason appears in both html and text output", () => {
    const result = render(DATA, "en");
    expect(result.html).toContain("Good behavior and time served");
    expect(result.text).toContain("Good behavior and time served");
  });

  it("English subject contains 'lifted'", () => {
    const result = render(DATA, "en");
    expect(result.subject.toLowerCase()).toContain("lifted");
  });

  it("Igbo subject contains 'Emepela'", () => {
    const result = render(DATA, "ig");
    expect(result.subject).toContain("Emepela");
  });
});
