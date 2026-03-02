// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/test-utils";

const mockResendVerification = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
}));

vi.mock("@/features/auth/actions/resend-verification", () => ({
  resendVerification: (...args: unknown[]) => mockResendVerification(...args),
}));

vi.mock("@/components/ui/button", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

import { ResendForm } from "./ResendForm";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResendForm", () => {
  it("renders email input and submit button", () => {
    render(<ResendForm emailPlaceholder="email@example.com" />);

    expect(screen.getByRole("textbox", { name: /Apply.fields.email/i })).toBeInTheDocument();
    expect(screen.getByText("Apply.resend")).toBeInTheDocument();
  });

  it("disables submit when email is empty", () => {
    render(<ResendForm emailPlaceholder="email@example.com" />);

    const button = screen.getByText("Apply.resend");
    expect(button).toBeDisabled();
  });

  it("shows success message on successful resend", async () => {
    mockResendVerification.mockResolvedValue({ success: true });
    render(<ResendForm emailPlaceholder="email@example.com" />);

    const input = screen.getByRole("textbox", { name: /Apply.fields.email/i });
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Apply.confirmation.resendSuccess");
    });

    expect(mockResendVerification).toHaveBeenCalledWith("test@example.com");
  });

  it("shows error message on failed resend", async () => {
    mockResendVerification.mockResolvedValue({ success: false, error: "Rate limited" });
    render(<ResendForm emailPlaceholder="email@example.com" />);

    const input = screen.getByRole("textbox", { name: /Apply.fields.email/i });
    fireEvent.change(input, { target: { value: "test@example.com" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Rate limited");
    });
  });
});
