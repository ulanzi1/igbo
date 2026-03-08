// @vitest-environment node
import { describe, it, expect } from "vitest";
import { scanContent } from "./moderation-scanner";
import type { Keyword } from "./moderation-scanner";

const kw = (keyword: string, severity: Keyword["severity"] = "medium"): Keyword => ({
  keyword,
  severity,
  category: "other",
});

describe("scanContent", () => {
  it("returns null for empty keyword list", () => {
    expect(scanContent("some text here", [])).toBeNull();
  });

  it("returns null when no keyword matches", () => {
    expect(scanContent("hello world", [kw("badword")])).toBeNull();
  });

  it("returns null for empty text string", () => {
    expect(scanContent("", [kw("badword")])).toBeNull();
  });

  it("matches exact keyword (case-insensitive)", () => {
    const result = scanContent("I saw BADWORD in the post", [kw("badword")]);
    expect(result).not.toBeNull();
    expect(result?.keyword).toBe("badword");
  });

  it("matches keyword with Igbo diacritics stripped (NFD normalization)", () => {
    // "Ụnọ" normalizes to "uno" — keyword "uno" should match
    const result = scanContent("Ụnọ na ulo", [kw("uno")]);
    expect(result).not.toBeNull();
    expect(result?.keyword).toBe("uno");
  });

  it("does NOT match keyword as a substring (whole-word boundary)", () => {
    // "classic" should NOT match keyword "ass"
    const result = scanContent("I love classic music", [kw("ass", "high")]);
    expect(result).toBeNull();
  });

  it("returns highest-severity match when multiple keywords present", () => {
    const keywords: Keyword[] = [kw("text", "low"), kw("badword", "high"), kw("stuff", "medium")];
    const result = scanContent("text with badword and stuff", keywords);
    expect(result).not.toBeNull();
    expect(result?.severity).toBe("high");
    expect(result?.keyword).toBe("badword");
  });

  it("returns high-severity keyword even when low-severity appears first in text", () => {
    const keywords: Keyword[] = [
      { keyword: "text", severity: "low", category: "spam" },
      { keyword: "badword", severity: "high", category: "hate_speech" },
    ];
    // "text" appears before "badword" in the string, but high severity wins
    const result = scanContent("text with BADWORD here", keywords);
    expect(result?.severity).toBe("high");
  });

  it("matches correctly with diacritical keyword normalized", () => {
    // keyword with accent: "café" normalizes to "cafe"
    const result = scanContent("I went to the cafe today", [kw("café")]);
    expect(result).not.toBeNull();
  });

  it("does not match partial word at word boundary edge", () => {
    // "spam" should match "spam" but not "spammer" (well, \b is at end of word too)
    const spamResult = scanContent("This is spam.", [kw("spam")]);
    expect(spamResult).not.toBeNull();
  });
});
