// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@/test/test-utils";

const mockInvalidateQueries = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${ns}.${key}(${JSON.stringify(params)})`;
    return `${ns}.${key}`;
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

let profileOnComplete: (() => void) | undefined;
let guidelinesOnComplete: (() => void) | undefined;

vi.mock("@/features/profiles", () => ({
  ProfileStep: (props: { onComplete: () => void }) => {
    profileOnComplete = props.onComplete;
    return <div data-testid="profile-step">ProfileStep</div>;
  },
  GuidelinesStep: (props: { onComplete: () => void; guidelinesHtml: string }) => {
    guidelinesOnComplete = props.onComplete;
    return <div data-testid="guidelines-step">GuidelinesStep</div>;
  },
  TourStep: () => <div data-testid="tour-step">TourStep</div>,
}));

import { OnboardingWizard } from "./OnboardingWizard";

beforeEach(() => {
  vi.clearAllMocks();
  profileOnComplete = undefined;
  guidelinesOnComplete = undefined;
});

const defaultProps = {
  initialStep: "profile" as const,
  defaultDisplayName: "Test User",
  defaultLocationCity: "Lagos",
  defaultLocationState: "Lagos State",
  defaultLocationCountry: "Nigeria",
  guidelinesHtml: "<p>Guidelines</p>",
};

describe("OnboardingWizard", () => {
  it("renders step progress indicator", () => {
    render(<OnboardingWizard {...defaultProps} />);

    expect(screen.getByText('Onboarding.stepProgress({"step":1,"total":3})')).toBeInTheDocument();
  });

  it("renders step tabs for all three steps", () => {
    render(<OnboardingWizard {...defaultProps} />);

    expect(screen.getByText("Onboarding.steps.profile")).toBeInTheDocument();
    expect(screen.getByText("Onboarding.steps.guidelines")).toBeInTheDocument();
    expect(screen.getByText("Onboarding.steps.tour")).toBeInTheDocument();
  });

  it("renders ProfileStep when initialStep is profile", () => {
    render(<OnboardingWizard {...defaultProps} />);
    expect(screen.getByTestId("profile-step")).toBeInTheDocument();
  });

  it("renders GuidelinesStep when initialStep is guidelines", () => {
    render(<OnboardingWizard {...defaultProps} initialStep="guidelines" />);
    expect(screen.getByTestId("guidelines-step")).toBeInTheDocument();
  });

  it("renders TourStep when initialStep is tour", () => {
    render(<OnboardingWizard {...defaultProps} initialStep="tour" />);
    expect(screen.getByTestId("tour-step")).toBeInTheDocument();
  });

  it("advances from profile to guidelines on onComplete", () => {
    render(<OnboardingWizard {...defaultProps} />);

    expect(screen.getByTestId("profile-step")).toBeInTheDocument();

    act(() => {
      profileOnComplete?.();
    });

    expect(screen.getByTestId("guidelines-step")).toBeInTheDocument();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["onboarding-state"] });
  });

  it("advances from guidelines to tour on onComplete", () => {
    render(<OnboardingWizard {...defaultProps} initialStep="guidelines" />);

    act(() => {
      guidelinesOnComplete?.();
    });

    expect(screen.getByTestId("tour-step")).toBeInTheDocument();
  });

  it("updates step progress text when advancing", () => {
    render(<OnboardingWizard {...defaultProps} />);

    act(() => {
      profileOnComplete?.();
    });

    expect(screen.getByText('Onboarding.stepProgress({"step":2,"total":3})')).toBeInTheDocument();
  });
});
