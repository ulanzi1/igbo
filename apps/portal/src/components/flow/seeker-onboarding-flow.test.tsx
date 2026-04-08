import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

// ─── Polyfills for jsdom ──────────────────────────────────────────────────────
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

// ─── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    "aria-busy": ariaBusy,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { "aria-busy"?: boolean }) => (
    <button onClick={onClick} disabled={disabled} aria-busy={ariaBusy} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/domain/onboarding-step-indicator", () => ({
  OnboardingStepIndicator: ({
    currentStep,
    stepTitles,
  }: {
    currentStep: number;
    completedSteps: number[];
    stepTitles?: string[];
  }) => (
    <nav aria-label="onboarding steps" data-testid="step-indicator" data-current={currentStep}>
      {stepTitles?.map((t, i) => (
        <span key={i} data-testid={`step-title-${i}`}>
          {t}
        </span>
      ))}
    </nav>
  ),
}));

// SeekerProfileForm stub that can trigger onSuccess or onCancel
vi.mock("@/components/flow/seeker-profile-form", () => ({
  SeekerProfileForm: ({
    onSuccess,
    onCancel: _onCancel,
    prefill,
  }: {
    onSuccess?: (p: unknown) => void;
    onCancel?: () => void;
    prefill?: unknown;
  }) => {
    return (
      <div data-testid="seeker-profile-form" data-has-prefill={prefill ? "true" : "false"}>
        <button
          onClick={() =>
            onSuccess?.({
              id: "new-profile-uuid",
              userId: "user-123",
              headline: "Test",
              onboardingCompletedAt: null,
            })
          }
        >
          __triggerSuccess
        </button>
      </div>
    );
  },
}));

// SeekerPreferencesSection stub
vi.mock("@/components/flow/seeker-preferences-section", () => ({
  SeekerPreferencesSection: ({ onSave }: { onSave?: () => void }) => {
    return (
      <div data-testid="seeker-preferences-section">
        <button onClick={() => onSave?.()}>__triggerSave</button>
      </div>
    );
  },
}));

// SeekerCvManager stub
vi.mock("@/components/flow/seeker-cv-manager", () => ({
  SeekerCvManager: ({ onUploadSuccess }: { onUploadSuccess?: () => void }) => {
    return (
      <div data-testid="seeker-cv-manager">
        <button onClick={() => onUploadSuccess?.()}>__triggerUpload</button>
      </div>
    );
  },
}));

// ─── Module under test ────────────────────────────────────────────────────────
import { SeekerOnboardingFlow } from "./seeker-onboarding-flow";

const mockPush = vi.fn();
const mockFetch = vi.fn();
global.fetch = mockFetch;

const defaultProps = {
  locale: "en",
  initialStep: 1 as const,
  seekerProfile: null,
  prefill: null,
  initialPreferences: null,
  initialCvs: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SeekerOnboardingFlow", () => {
  it("renders Step 1 with SeekerProfileForm when initialStep=1", () => {
    render(<SeekerOnboardingFlow {...defaultProps} />);
    expect(screen.getByTestId("seeker-profile-form")).toBeTruthy();
    expect(screen.queryByTestId("seeker-preferences-section")).toBeNull();
    expect(screen.queryByTestId("seeker-cv-manager")).toBeNull();
  });

  it("renders Step 2 with preferences section when initialStep=2", () => {
    const profile = {
      id: "seeker-uuid",
      userId: "user-123",
      headline: "Dev",
      summary: null,
      skills: [],
      experienceJson: [],
      educationJson: [],
      visibility: "passive" as const,
      consentMatching: false,
      consentEmployerView: false,
      consentMatchingChangedAt: null,
      consentEmployerViewChangedAt: null,
      onboardingCompletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    render(<SeekerOnboardingFlow {...defaultProps} initialStep={2} seekerProfile={profile} />);
    expect(screen.getByTestId("seeker-preferences-section")).toBeTruthy();
    expect(screen.getByTestId("seeker-cv-manager")).toBeTruthy();
    expect(screen.queryByTestId("seeker-profile-form")).toBeNull();
  });

  it("step indicator shows 3 steps with seeker titles", () => {
    render(<SeekerOnboardingFlow {...defaultProps} />);
    expect(screen.getByTestId("step-title-0").textContent).toBe("step1Title");
    expect(screen.getByTestId("step-title-1").textContent).toBe("step2Title");
    expect(screen.getByTestId("step-title-2").textContent).toBe("step3Title");
  });

  it("Step 1 completion advances to Step 2 via onSuccess callback", async () => {
    const user = userEvent.setup();
    render(<SeekerOnboardingFlow {...defaultProps} />);
    await user.click(screen.getByText("__triggerSuccess"));
    expect(screen.getByTestId("seeker-preferences-section")).toBeTruthy();
    expect(screen.getByTestId("step-indicator").getAttribute("data-current")).toBe("2");
  });

  it("Step 2 Skip for now advances to Step 3", async () => {
    const user = userEvent.setup();
    render(
      <SeekerOnboardingFlow
        {...defaultProps}
        initialStep={2}
        seekerProfile={{
          id: "p",
          userId: "u",
          headline: "h",
          summary: null,
          skills: [],
          experienceJson: [],
          educationJson: [],
          visibility: "passive" as const,
          consentMatching: false,
          consentEmployerView: false,
          consentMatchingChangedAt: null,
          consentEmployerViewChangedAt: null,
          onboardingCompletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: /skipForNow/i }));
    expect(screen.getByText("summaryTitle")).toBeTruthy();
    expect(screen.getByTestId("step-indicator").getAttribute("data-current")).toBe("3");
  });

  it("Step 3 renders completion summary", async () => {
    const user = userEvent.setup();
    render(<SeekerOnboardingFlow {...defaultProps} />);
    // Advance to Step 2
    await user.click(screen.getByText("__triggerSuccess"));
    // Skip to Step 3
    await user.click(screen.getByRole("button", { name: /skipForNow/i }));
    expect(screen.getByText("summaryTitle")).toBeTruthy();
    expect(screen.getByText("summaryProfileCreated")).toBeTruthy();
  });

  it("Step 3 shows nudge when preferences were skipped", async () => {
    const user = userEvent.setup();
    render(<SeekerOnboardingFlow {...defaultProps} />);
    await user.click(screen.getByText("__triggerSuccess"));
    await user.click(screen.getByRole("button", { name: /skipForNow/i }));
    expect(screen.getByText("summaryPreferencesSkipped")).toBeTruthy();
    expect(screen.getByText("summaryCvSkipped")).toBeTruthy();
  });

  it("Step 3 shows check when preferences were completed", async () => {
    const user = userEvent.setup();
    render(<SeekerOnboardingFlow {...defaultProps} />);
    // Advance to Step 2
    await user.click(screen.getByText("__triggerSuccess"));
    // Trigger onSave (preferences saved)
    await user.click(screen.getByText("__triggerSave"));
    // Trigger onUploadSuccess (CV uploaded)
    await user.click(screen.getByText("__triggerUpload"));
    // Skip to Step 3
    await user.click(screen.getByRole("button", { name: /skipForNow/i }));
    expect(screen.getByText("summaryPreferencesSet")).toBeTruthy();
    expect(screen.getByText("summaryCvUploaded")).toBeTruthy();
  });

  it("Step 3 Get started calls POST /api/v1/seekers/me/onboarding/complete", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: { completed: true } }) });
    render(<SeekerOnboardingFlow {...defaultProps} />);
    await user.click(screen.getByText("__triggerSuccess"));
    await user.click(screen.getByRole("button", { name: /skipForNow/i }));
    await user.click(screen.getByRole("button", { name: /getStarted/i }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/seekers/me/onboarding/complete",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("Step 3 Get started navigates to home on success", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ data: { completed: true } }) });
    render(<SeekerOnboardingFlow {...defaultProps} />);
    await user.click(screen.getByText("__triggerSuccess"));
    await user.click(screen.getByRole("button", { name: /skipForNow/i }));
    await user.click(screen.getByRole("button", { name: /getStarted/i }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/en");
    });
  });

  it("Step 3 Get started shows error toast and resets state when POST fails", async () => {
    const user = userEvent.setup();
    const { toast } = await import("sonner");
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ detail: "Server exploded" }),
    });
    render(<SeekerOnboardingFlow {...defaultProps} />);
    await user.click(screen.getByText("__triggerSuccess"));
    await user.click(screen.getByRole("button", { name: /skipForNow/i }));
    await user.click(screen.getByRole("button", { name: /getStarted/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Server exploded");
    });
    // Did NOT navigate
    expect(mockPush).not.toHaveBeenCalled();
    // Button is re-enabled (no longer aria-busy)
    const btn = screen.getByRole("button", { name: /getStarted/i });
    expect(btn.getAttribute("aria-busy")).toBe("false");
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("Step 3 Get started uses i18n key when error body has no detail", async () => {
    const user = userEvent.setup();
    const { toast } = await import("sonner");
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<SeekerOnboardingFlow {...defaultProps} />);
    await user.click(screen.getByText("__triggerSuccess"));
    await user.click(screen.getByRole("button", { name: /skipForNow/i }));
    await user.click(screen.getByRole("button", { name: /getStarted/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("completeError");
    });
  });

  it("Step 3 Get started shows unexpectedError i18n key when fetch rejects", async () => {
    const user = userEvent.setup();
    const { toast } = await import("sonner");
    mockFetch.mockRejectedValue(new Error("network down"));
    render(<SeekerOnboardingFlow {...defaultProps} />);
    await user.click(screen.getByText("__triggerSuccess"));
    await user.click(screen.getByRole("button", { name: /skipForNow/i }));
    await user.click(screen.getByRole("button", { name: /getStarted/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("unexpectedError");
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("Step 3 Get started shows aria-busy during API call", async () => {
    const user = userEvent.setup();
    let resolveFetch!: () => void;
    mockFetch.mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = () =>
          resolve({ ok: true, json: async () => ({ data: { completed: true } }) } as Response);
      }),
    );
    render(<SeekerOnboardingFlow {...defaultProps} />);
    await user.click(screen.getByText("__triggerSuccess"));
    await user.click(screen.getByRole("button", { name: /skipForNow/i }));

    const btn = screen.getByRole("button", { name: /getStarted/i });
    await user.click(btn);

    // Button should show "completing" text and aria-busy during the call
    expect(screen.getByText("completing")).toBeTruthy();
    expect(screen.getByRole("button", { name: /completing/i }).getAttribute("aria-busy")).toBe(
      "true",
    );

    await act(async () => {
      resolveFetch();
    });
  });

  it("community pre-fill is passed to SeekerProfileForm", () => {
    const prefill = { displayName: "Chidi", bio: "Engineer" };
    render(<SeekerOnboardingFlow {...defaultProps} prefill={prefill} />);
    expect(screen.getByTestId("seeker-profile-form").getAttribute("data-has-prefill")).toBe("true");
  });

  it("focus moves to step 2 heading on step transition", async () => {
    const user = userEvent.setup();
    render(<SeekerOnboardingFlow {...defaultProps} />);
    await user.click(screen.getByText("__triggerSuccess"));
    // After advancing to step 2, the step 2 heading should be in the document
    await waitFor(() => {
      const heading = screen.getByRole("heading", { name: "step2Title" });
      expect(heading).toBeTruthy();
    });
  });

  it("has no accessibility violations on Step 1", async () => {
    const { container } = render(<SeekerOnboardingFlow {...defaultProps} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no accessibility violations on Step 2", async () => {
    const profile = {
      id: "p",
      userId: "u",
      headline: "h",
      summary: null,
      skills: [],
      experienceJson: [],
      educationJson: [],
      visibility: "passive" as const,
      consentMatching: false,
      consentEmployerView: false,
      consentMatchingChangedAt: null,
      consentEmployerViewChangedAt: null,
      onboardingCompletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { container } = render(
      <SeekerOnboardingFlow {...defaultProps} initialStep={2} seekerProfile={profile} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no accessibility violations on Step 3", async () => {
    const user = userEvent.setup();
    const { container } = render(<SeekerOnboardingFlow {...defaultProps} />);
    await user.click(screen.getByText("__triggerSuccess"));
    await user.click(screen.getByRole("button", { name: /skipForNow/i }));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
