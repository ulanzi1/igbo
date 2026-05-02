import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { DigestFrequencySelector } from "./digest-frequency-selector";

// ── Radix Select jsdom polyfills ───────────────────────────────────────────────
beforeAll(() => {
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});

// ── i18n fixture ──────────────────────────────────────────────────────────────
const MESSAGES = {
  Portal: {
    digest: {
      frequencyInstant: "Instant",
      frequencyDaily: "Daily Digest",
      frequencyWeekly: "Weekly Digest",
      frequencyOff: "Off",
      frequencyLabel: "Email frequency",
    },
  },
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={MESSAGES}>
      {children}
    </NextIntlClientProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("DigestFrequencySelector", () => {
  it("renders the frequency label", () => {
    render(
      <Wrapper>
        <DigestFrequencySelector value="none" onChange={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText("Email frequency")).toBeInTheDocument();
  });

  it("renders with 'Daily Digest' as current value", () => {
    render(
      <Wrapper>
        <DigestFrequencySelector value="daily" onChange={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Daily Digest");
  });

  it("renders with 'Weekly Digest' as current value", () => {
    render(
      <Wrapper>
        <DigestFrequencySelector value="weekly" onChange={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Weekly Digest");
  });

  it("renders with 'Instant' for value=none", () => {
    render(
      <Wrapper>
        <DigestFrequencySelector value="none" onChange={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Instant");
  });

  it("renders with 'Off' as current value", () => {
    render(
      <Wrapper>
        <DigestFrequencySelector value="off" onChange={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Off");
  });

  it("renders as disabled when disabled prop is set", () => {
    render(
      <Wrapper>
        <DigestFrequencySelector value="daily" onChange={vi.fn()} disabled />
      </Wrapper>,
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
