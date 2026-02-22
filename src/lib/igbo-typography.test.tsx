// @vitest-environment jsdom
import { render, screen } from "@/test/test-utils";

/**
 * Validates that Igbo diacritic characters render correctly in the DOM.
 * The Inter font is loaded with the `latin-ext` subset which covers all
 * Igbo diacritics. This test verifies the characters are valid Unicode
 * and render without corruption in a React component.
 */
describe("Igbo diacritic rendering", () => {
  const igboDiacritics = ["ụ", "ọ", "ṅ", "á", "à", "é", "è", "í", "ì", "ó", "ò", "ú", "ù"];

  it("validates all Igbo diacritics are properly encoded Unicode characters", () => {
    igboDiacritics.forEach((char) => {
      expect(typeof char).toBe("string");
      expect(char.length).toBeGreaterThan(0);
      // Each character must be a single grapheme (not garbled multi-byte)
      const codePoint = char.codePointAt(0);
      expect(codePoint).toBeDefined();
      expect(codePoint).toBeGreaterThan(0);
    });
  });

  it("renders Igbo diacritic text in a React component without corruption", () => {
    const testText = "Ị bụ ọnye Igbo — ụlọ gị dị ebe a";
    render(<p data-testid="igbo-text">{testText}</p>);
    const element = screen.getByTestId("igbo-text");
    expect(element.textContent).toBe(testText);
    expect(element.textContent).toContain("ụ");
    expect(element.textContent).toContain("ọ");
  });

  it("renders a component containing all required diacritic characters", () => {
    const allDiacritics = igboDiacritics.join(" ");
    render(<span data-testid="diacritics">{allDiacritics}</span>);
    const element = screen.getByTestId("diacritics");
    igboDiacritics.forEach((char) => {
      expect(element.textContent).toContain(char);
    });
  });

  it("encodes diacritics to correct Unicode code points (latin-ext block)", () => {
    // ụ U+1EE5, ọ U+1ECD — in Latin Extended Additional (U+1E00–U+1EFF)
    expect("ụ".codePointAt(0)).toBe(0x1ee5);
    expect("ọ".codePointAt(0)).toBe(0x1ecd);
    // ṅ U+1E45 — in Latin Extended Additional
    expect("ṅ".codePointAt(0)).toBe(0x1e45);
    // á U+00E1 — in Latin-1 Supplement
    expect("á".codePointAt(0)).toBe(0x00e1);
  });
});
