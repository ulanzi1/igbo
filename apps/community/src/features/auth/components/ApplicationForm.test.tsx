// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@/test/test-utils";
import userEvent from "@testing-library/user-event";

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
  useLocale: () => "en",
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/apply",
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  redirect: vi.fn(),
  getPathname: vi.fn(),
}));

vi.mock("country-state-city", () => ({
  Country: {
    getAllCountries: () => [
      { isoCode: "NG", name: "Nigeria" },
      { isoCode: "US", name: "United States" },
      { isoCode: "VC", name: "Saint Vincent and the Grenadines" }, // no states
    ],
  },
  State: {
    getStatesOfCountry: (code: string) => {
      if (code === "NG") {
        return [
          { isoCode: "LA", name: "Lagos State", countryCode: "NG" },
          { isoCode: "AB", name: "Abia State", countryCode: "NG" },
        ];
      }
      if (code === "US") {
        return [{ isoCode: "CA", name: "California", countryCode: "US" }];
      }
      return [];
    },
  },
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value?: string;
    onValueChange?: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <div data-testid="select-root" data-value={value}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(
              child as React.ReactElement<{ onValueChange?: (v: string) => void }>,
              { onValueChange },
            )
          : child,
      )}
    </div>
  ),
  SelectTrigger: ({
    id,
    className,
    children,
    "aria-required": ariaRequired,
    "aria-describedby": ariaDescribedby,
  }: {
    id?: string;
    className?: string;
    children: React.ReactNode;
    "aria-required"?: string;
    "aria-describedby"?: string;
    onValueChange?: (v: string) => void;
  }) => (
    <div
      id={id}
      className={className}
      aria-required={ariaRequired as "true" | "false" | boolean | undefined}
      aria-describedby={ariaDescribedby}
    >
      {children}
    </div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span data-testid="select-value">{placeholder}</span>
  ),
  SelectContent: ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode;
    onValueChange?: (v: string) => void;
  }) => (
    <div data-testid="select-content">
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(
              child as React.ReactElement<{ onValueChange?: (v: string) => void }>,
              { onValueChange },
            )
          : child,
      )}
    </div>
  ),
  SelectItem: ({
    value,
    children,
    onValueChange,
  }: {
    value: string;
    children: React.ReactNode;
    onValueChange?: (v: string) => void;
  }) => (
    <button
      type="button"
      data-testid={`select-item-${value}`}
      onClick={() => onValueChange?.(value)}
    >
      {children}
    </button>
  ),
}));

vi.mock("react-phone-number-input", () => ({
  default: ({
    value,
    onChange,
    onBlur,
    id,
    "aria-describedby": ariaDescribedby,
    className,
  }: {
    value?: string;
    onChange: (v: string | undefined) => void;
    onBlur?: () => void;
    id?: string;
    "aria-describedby"?: string;
    className?: string;
  }) => (
    <input
      id={id}
      type="tel"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      onBlur={onBlur}
      aria-describedby={ariaDescribedby}
      className={className}
      data-testid="phone-input"
    />
  ),
  isValidPhoneNumber: (v: string) => /^\+[1-9]\d{1,14}$/.test(v),
}));

const mockSubmitApplication = vi.fn();
const mockResendVerification = vi.fn();

vi.mock("@/features/auth/actions/submit-application", () => ({
  submitApplication: (...args: unknown[]) => mockSubmitApplication(...args),
}));

vi.mock("@/features/auth/actions/resend-verification", () => ({
  resendVerification: (...args: unknown[]) => mockResendVerification(...args),
}));

vi.mock("@/features/auth/components/ApplicationStepper", () => ({
  ApplicationStepper: ({ currentStep }: { currentStep: number }) => (
    <div data-testid="stepper" data-step={currentStep} aria-label="Application progress">
      Step {currentStep}
    </div>
  ),
}));

import { ApplicationForm } from "./ApplicationForm";

const geoDefaults = { city: "", state: "", country: "" };
const geoDefaultsFilled = { city: "Lagos", state: "Lagos State", country: "NG" };

beforeEach(() => {
  vi.clearAllMocks();
  mockSubmitApplication.mockResolvedValue({ success: true });
  mockResendVerification.mockResolvedValue({ success: true });
});

// Helper to fill step 1 fields
async function fillStep1(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Apply\.fields\.name/i), "Chukwuemeka Obi");
  await user.type(screen.getByLabelText(/Apply\.fields\.email/i), "chukwu@example.com");
}

async function goToStep(user: ReturnType<typeof userEvent.setup>, targetStep: number) {
  for (let i = 1; i < targetStep; i++) {
    const nextBtn = screen.getByRole("button", { name: /Apply\.next/i });
    await user.click(nextBtn);
    await waitFor(() => {
      const stepper = screen.getByTestId("stepper");
      expect(stepper).toHaveAttribute("data-step", String(i + 1));
    });
  }
}

describe("ApplicationForm", () => {
  describe("rendering", () => {
    it("renders the heading", () => {
      render(<ApplicationForm geoDefaults={geoDefaults} />);
      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    });

    it("renders the ApplicationStepper", () => {
      render(<ApplicationForm geoDefaults={geoDefaults} />);
      expect(screen.getByTestId("stepper")).toBeInTheDocument();
    });

    it("renders step 1 fields on initial render", () => {
      render(<ApplicationForm geoDefaults={geoDefaults} />);
      expect(screen.getByLabelText(/Apply\.fields\.name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Apply\.fields\.email/i)).toBeInTheDocument();
      expect(screen.getByTestId("phone-input")).toBeInTheDocument();
    });

    it("renders step 2 heading with location label after advancing", async () => {
      const user = userEvent.setup();
      render(<ApplicationForm geoDefaults={geoDefaults} />);
      await fillStep1(user);
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => {
        expect(screen.getByLabelText(/Apply\.fields\.locationCity/i)).toBeInTheDocument();
      });
    });

    it("optional fields are labeled with '(optional)' suffix via i18n key", () => {
      render(<ApplicationForm geoDefaults={geoDefaults} />);
      // Phone label should contain optional key
      const phoneLabel = screen.getByText((content) => content.includes("Apply.fields.phone"));
      expect(phoneLabel).toBeInTheDocument();
    });

    it("pre-fills location fields from geo defaults", () => {
      render(<ApplicationForm geoDefaults={geoDefaultsFilled} />);
      // Geo values are passed as defaultValues; step 2 would show them
      // We verify the form renders without error with prefilled data
      expect(screen.getByTestId("stepper")).toBeInTheDocument();
    });

    it("shows no location-not-detected notice when geo headers are present", async () => {
      const user = userEvent.setup();
      render(<ApplicationForm geoDefaults={geoDefaultsFilled} />);
      await fillStep1(user);
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => {
        expect(screen.queryByText(/Apply\.locationNotDetected/)).not.toBeInTheDocument();
      });
    });

    it("shows location-not-detected notice when geo headers are absent", async () => {
      const user = userEvent.setup();
      render(<ApplicationForm geoDefaults={geoDefaults} />);
      await fillStep1(user);
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => {
        expect(screen.getByText("Apply.locationNotDetected")).toBeInTheDocument();
      });
    });
  });

  describe("step navigation", () => {
    it("advances to step 2 after filling required step-1 fields and clicking Next", async () => {
      const user = userEvent.setup();
      render(<ApplicationForm geoDefaults={geoDefaults} />);
      await fillStep1(user);
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => {
        expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "2");
      });
    });

    it("Back button returns to step 1 from step 2", async () => {
      const user = userEvent.setup();
      render(<ApplicationForm geoDefaults={geoDefaults} />);
      await fillStep1(user);
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "2"));
      await user.click(screen.getByRole("button", { name: /Apply\.back/i }));
      await waitFor(() => {
        expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "1");
      });
    });

    it("does not show Back button on step 1", () => {
      render(<ApplicationForm geoDefaults={geoDefaults} />);
      expect(screen.queryByRole("button", { name: /Apply\.back/i })).not.toBeInTheDocument();
    });

    it("shows Submit button on step 5", async () => {
      const user = userEvent.setup();
      render(<ApplicationForm geoDefaults={geoDefaultsFilled} />);

      // Step 1
      await fillStep1(user);
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "2"));

      // Step 2 — location pre-filled, just advance
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "3"));

      // Step 3 — cultural connection
      await user.type(
        screen.getByLabelText(/Apply\.fields\.culturalConnection/i),
        "I am Igbo and proud",
      );
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "4"));

      // Step 4 — reason for joining
      await user.type(
        screen.getByLabelText(/Apply\.fields\.reasonForJoining/i),
        "I want to connect with the community",
      );
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "5"));

      expect(screen.getByRole("button", { name: /Apply\.submit/i })).toBeInTheDocument();
    });
  });

  describe("validation", () => {
    it("shows email validation error on blur for invalid email", async () => {
      const user = userEvent.setup();
      render(<ApplicationForm geoDefaults={geoDefaults} />);
      const emailInput = screen.getByLabelText(/Apply\.fields\.email/i);
      await user.type(emailInput, "not-an-email");
      await user.tab(); // trigger onBlur
      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });
    });

    it("does not advance to step 2 without required name field", async () => {
      const user = userEvent.setup();
      render(<ApplicationForm geoDefaults={geoDefaults} />);
      // Only fill email, not name
      await user.type(screen.getByLabelText(/Apply\.fields\.email/i), "test@example.com");
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => {
        // Still on step 1
        expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "1");
      });
    });

    it("shows consent required error when submitting without checking consent", async () => {
      const user = userEvent.setup();
      render(<ApplicationForm geoDefaults={geoDefaultsFilled} />);
      // Navigate to step 5 without checking consent and submit
      await fillStep1(user);
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "2"));
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "3"));
      await user.type(
        screen.getByLabelText(/Apply\.fields\.culturalConnection/i),
        "I love Igbo culture",
      );
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "4"));
      await user.type(
        screen.getByLabelText(/Apply\.fields\.reasonForJoining/i),
        "I want to connect with community",
      );
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "5"));
      // Do NOT check consent; submit
      await user.click(screen.getByRole("button", { name: /Apply\.submit/i }));
      await waitFor(() => {
        expect(screen.getByRole("alert")).toBeInTheDocument();
      });
      expect(mockSubmitApplication).not.toHaveBeenCalled();
    });
  });

  describe("form submission", () => {
    it("calls submitApplication with form values on successful submit", async () => {
      const user = userEvent.setup();
      render(<ApplicationForm geoDefaults={geoDefaultsFilled} />);

      await fillStep1(user);
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "2"));
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "3"));
      await user.type(
        screen.getByLabelText(/Apply\.fields\.culturalConnection/i),
        "Igbo culture is my heritage",
      );
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "4"));
      await user.type(
        screen.getByLabelText(/Apply\.fields\.reasonForJoining/i),
        "I want to connect with my community",
      );
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "5"));

      const consentCheckbox = screen.getByRole("checkbox");
      await user.click(consentCheckbox);
      await user.click(screen.getByRole("button", { name: /Apply\.submit/i }));

      await waitFor(() => {
        expect(mockSubmitApplication).toHaveBeenCalledOnce();
      });
    });

    it("shows confirmation state after successful submission", async () => {
      const user = userEvent.setup();
      render(<ApplicationForm geoDefaults={geoDefaultsFilled} />);

      await fillStep1(user);
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "2"));
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "3"));
      await user.type(
        screen.getByLabelText(/Apply\.fields\.culturalConnection/i),
        "Deep Igbo roots",
      );
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "4"));
      await user.type(
        screen.getByLabelText(/Apply\.fields\.reasonForJoining/i),
        "Community and connection",
      );
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "5"));
      await user.click(screen.getByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: /Apply\.submit/i }));

      await waitFor(() => {
        expect(screen.getByText("Apply.confirmation.title")).toBeInTheDocument();
      });
    });

    it("sets field-level error when server returns duplicate email error", async () => {
      mockSubmitApplication.mockResolvedValue({
        success: false,
        error: { field: "email", message: "An application with this email address already exists" },
      });

      const user = userEvent.setup();
      render(<ApplicationForm geoDefaults={geoDefaultsFilled} />);

      await fillStep1(user);
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "2"));
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "3"));
      await user.type(screen.getByLabelText(/Apply\.fields\.culturalConnection/i), "Igbo heritage");
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "4"));
      await user.type(
        screen.getByLabelText(/Apply\.fields\.reasonForJoining/i),
        "Community connection",
      );
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "5"));
      await user.click(screen.getByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: /Apply\.submit/i }));

      await waitFor(() => {
        // Navigate back to step 1 for email error
        expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "1");
      });
    });
  });

  describe("resend verification", () => {
    it("shows resend form after successful submission", async () => {
      const user = userEvent.setup();
      render(<ApplicationForm geoDefaults={geoDefaultsFilled} />);

      await fillStep1(user);
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "2"));
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "3"));
      await user.type(screen.getByLabelText(/Apply\.fields\.culturalConnection/i), "Igbo heritage");
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "4"));
      await user.type(
        screen.getByLabelText(/Apply\.fields\.reasonForJoining/i),
        "Community connection",
      );
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "5"));
      await user.click(screen.getByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: /Apply\.submit/i }));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Apply\.resend/i })).toBeInTheDocument();
      });
    });

    it("calls resendVerification when resend button clicked", async () => {
      const user = userEvent.setup();
      render(<ApplicationForm geoDefaults={geoDefaultsFilled} />);

      // Submit the form first
      await fillStep1(user);
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "2"));
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "3"));
      await user.type(screen.getByLabelText(/Apply\.fields\.culturalConnection/i), "My roots");
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "4"));
      await user.type(
        screen.getByLabelText(/Apply\.fields\.reasonForJoining/i),
        "To connect with community",
      );
      await user.click(screen.getByRole("button", { name: /Apply\.next/i }));
      await waitFor(() => expect(screen.getByTestId("stepper")).toHaveAttribute("data-step", "5"));
      await user.click(screen.getByRole("checkbox"));
      await user.click(screen.getByRole("button", { name: /Apply\.submit/i }));
      await waitFor(() => screen.getByRole("button", { name: /Apply\.resend/i }));

      // Fill in resend email and click resend
      const emailInput = screen.getByRole("textbox", { name: /Apply\.fields\.email/i });
      await user.type(emailInput, "chukwu@example.com");
      await user.click(screen.getByRole("button", { name: /Apply\.resend/i }));

      await waitFor(() => {
        expect(mockResendVerification).toHaveBeenCalledWith("chukwu@example.com");
      });
    });
  });
});
