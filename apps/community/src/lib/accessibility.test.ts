/**
 * Accessibility compliance tests for the OBIGBO design token color palette.
 *
 * Validates WCAG 2.1 contrast ratios using hex-equivalent values for our
 * OKLCH-defined CSS custom properties. The hex values are pre-computed
 * approximations from the OKLCH values in globals.css.
 *
 * WCAG contrast ratio thresholds:
 *   - AA normal text: 4.5:1+
 *   - AA large text / UI components: 3:1+
 *   - AAA (high contrast mode target): 7:1+
 *   - Elder accessibility (body text aspiration): 12:1+
 */

// OBIGBO palette — hex equivalents from globals.css OKLCH values
const COLORS = {
  // Normal mode
  background: "#FAF8F5", // --background: oklch(0.981 0.006 90)
  foreground: "#1A1612", // --foreground: oklch(0.122 0.010 55)
  primary: "#2D5A27", // --primary: oklch(0.422 0.093 141)
  primaryForeground: "#FFFFFF", // --primary-foreground: oklch(1 0 0)
  secondary: "#D4A574", // --secondary: oklch(0.726 0.080 65)
  secondaryForeground: "#3D2415", // --secondary-foreground: oklch(0.216 0.044 45)
  muted: "#F0EDE8", // --muted: oklch(0.941 0.008 75)
  mutedForeground: "#78716C", // --muted-foreground: oklch(0.521 0.012 55)
  // High-contrast mode overrides
  hcBackground: "#FFFFFF", // data-contrast="high" --background
  hcForeground: "#141414", // data-contrast="high" --foreground: oklch(0.08 0 0)
  hcMutedForeground: "#4A4540", // data-contrast="high" --muted-foreground: oklch(0.32 0.010 55)
};

/** Convert 8-bit channel value (0-255) to linear RGB for WCAG luminance */
function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Compute relative luminance (WCAG 2.1 formula) from hex color string */
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Compute WCAG 2.1 contrast ratio between two colors */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("OBIGBO color contrast ratios — normal mode", () => {
  it("foreground on background meets elder accessibility target (12:1+)", () => {
    const ratio = contrastRatio(COLORS.foreground, COLORS.background);
    // #1A1612 on #FAF8F5 — warm near-black on warm off-white
    expect(ratio).toBeGreaterThanOrEqual(12);
  });

  it("primary-foreground (white) on primary (forest green) meets WCAG AA (4.5:1+)", () => {
    const ratio = contrastRatio(COLORS.primaryForeground, COLORS.primary);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("secondary-foreground (dark brown) on secondary (sandy tan) meets WCAG AA (4.5:1+)", () => {
    const ratio = contrastRatio(COLORS.secondaryForeground, COLORS.secondary);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("muted-foreground on background meets WCAG AA for normal text (4.5:1+)", () => {
    const ratio = contrastRatio(COLORS.mutedForeground, COLORS.background);
    // Muted foreground is used for text-sm secondary text (CardDescription, FormDescription, etc.)
    // which is normal-size text requiring WCAG AA 4.5:1 minimum.
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe("OBIGBO color contrast ratios — high contrast mode", () => {
  it("hc-foreground on hc-background meets WCAG AAA (7:1+)", () => {
    const ratio = contrastRatio(COLORS.hcForeground, COLORS.hcBackground);
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  it("hc-muted-foreground on hc-background meets WCAG AAA (7:1+)", () => {
    const ratio = contrastRatio(COLORS.hcMutedForeground, COLORS.hcBackground);
    expect(ratio).toBeGreaterThanOrEqual(7);
  });

  it("hc-foreground on hc-background achieves near-black maximum contrast (15:1+)", () => {
    const ratio = contrastRatio(COLORS.hcForeground, COLORS.hcBackground);
    expect(ratio).toBeGreaterThanOrEqual(15);
  });
});

describe("Accessibility structural requirements", () => {
  it("validates 16px minimum body text is defined in globals.css", async () => {
    // Read globals.css and verify font-size: 16px is present in @layer base
    const fs = await import("node:fs/promises");
    const css = await fs.readFile("src/app/globals.css", "utf-8");
    expect(css).toContain("font-size: 16px");
  });

  it("validates prefers-reduced-motion is handled in globals.css", async () => {
    const fs = await import("node:fs/promises");
    const css = await fs.readFile("src/app/globals.css", "utf-8");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("animate-pulse");
  });

  it("validates high-contrast mode CSS override exists in globals.css", async () => {
    const fs = await import("node:fs/promises");
    const css = await fs.readFile("src/app/globals.css", "utf-8");
    expect(css).toContain('data-contrast="high"');
    // 3px focus indicator
    expect(css).toContain("outline: 3px solid");
  });

  it("validates Button component enforces 44px minimum tap target", async () => {
    const fs = await import("node:fs/promises");
    const buttonSrc = await fs.readFile("src/components/ui/button.tsx", "utf-8");
    expect(buttonSrc).toContain("min-h-[44px]");
  });

  it("validates Input component enforces 44px minimum tap target", async () => {
    const fs = await import("node:fs/promises");
    const inputSrc = await fs.readFile("src/components/ui/input.tsx", "utf-8");
    expect(inputSrc).toContain("min-h-[44px]");
  });

  it("validates Input component enforces 16px text (no md:text-sm override)", async () => {
    const fs = await import("node:fs/promises");
    const inputSrc = await fs.readFile("src/components/ui/input.tsx", "utf-8");
    // Must have text-base (16px) and NOT have md:text-sm (which reduces to 14px)
    expect(inputSrc).toContain("text-base");
    expect(inputSrc).not.toContain("md:text-sm");
  });
});
