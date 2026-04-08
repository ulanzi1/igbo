import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── Polyfills ──────────────────────────────────────────────────────────────
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
});

// ─── Mocks ──────────────────────────────────────────────────────────────────
const mockPush = vi.fn();
const mockPathname = "/en/jobs/jp-1";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, _params?: Record<string, unknown>) => key,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
  usePathname: () => mockPathname,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="tooltip-content">{children}</span>
  ),
}));
vi.mock("@/components/flow/application-drawer", () => ({
  ApplicationDrawer: ({ open, onSuccess }: { open: boolean; onSuccess: () => void }) =>
    open ? (
      <div data-testid="application-drawer">
        <button onClick={onSuccess}>Submit</button>
      </div>
    ) : null,
}));

import { ApplyButton } from "./apply-button";

const BASE_PROPS = {
  jobId: "jp-1",
  jobTitle: "Software Engineer",
  companyName: "Acme Corp",
  hasProfile: true,
  hasExistingApplication: false,
  deadlinePassed: false,
  enableCoverLetter: false,
  profileHeadline: "Full Stack Developer",
  profileSkills: ["TypeScript", "React"],
  profileLocation: "Lagos, Nigeria",
  locale: "en",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ data: [] }),
    }),
  );
});

describe("ApplyButton — default state", () => {
  it("renders Apply button when seeker has profile and no existing application", () => {
    render(<ApplyButton {...BASE_PROPS} />);
    expect(screen.getByRole("button", { name: /button.apply/i })).toBeInTheDocument();
  });

  it("opens drawer on Apply button click", async () => {
    const user = userEvent.setup();
    render(<ApplyButton {...BASE_PROPS} />);
    await user.click(screen.getByRole("button", { name: /button.apply/i }));
    expect(screen.getByTestId("application-drawer")).toBeInTheDocument();
  });
});

describe("ApplyButton — no profile", () => {
  it("renders Complete Profile button when seeker has no profile", () => {
    render(<ApplyButton {...BASE_PROPS} hasProfile={false} />);
    expect(screen.getByRole("button", { name: /button.completeProfile/i })).toBeInTheDocument();
  });

  it("navigates to onboarding on click when no profile", async () => {
    const user = userEvent.setup();
    render(<ApplyButton {...BASE_PROPS} hasProfile={false} />);
    await user.click(screen.getByRole("button", { name: /button.completeProfile/i }));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("onboarding/seeker"));
  });
});

describe("ApplyButton — existing application", () => {
  it("renders disabled Application Submitted button", () => {
    render(<ApplyButton {...BASE_PROPS} hasExistingApplication={true} />);
    const btn = screen.getByRole("button", { name: /button.submitted/i });
    expect(btn).toBeDisabled();
  });
});

describe("ApplyButton — deadline passed", () => {
  it("renders disabled Apply button with tooltip", () => {
    render(<ApplyButton {...BASE_PROPS} deadlinePassed={true} />);
    const btn = screen.getByRole("button", { name: /button.apply/i });
    expect(btn).toBeDisabled();
  });

  it("shows deadline-passed tooltip content", () => {
    render(<ApplyButton {...BASE_PROPS} deadlinePassed={true} />);
    expect(screen.getByTestId("tooltip-content")).toHaveTextContent("button.deadlinePassed");
  });
});
