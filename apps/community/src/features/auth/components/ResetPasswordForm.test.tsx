import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { ResetPasswordForm } from "./ResetPasswordForm";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResetPasswordForm", () => {
  it("shows invalid link message when token is null", () => {
    render(<ResetPasswordForm token={null} />);
    expect(screen.getByText(/tokenInvalid/i)).toBeInTheDocument();
  });

  it("renders password fields when token is provided", () => {
    render(<ResetPasswordForm token="valid-token" />);
    expect(screen.getByLabelText("passwordLabel")).toBeInTheDocument();
    expect(screen.getByLabelText("confirmPasswordLabel")).toBeInTheDocument();
  });

  it("shows error when passwords do not match", async () => {
    render(<ResetPasswordForm token="valid-token" />);
    fireEvent.change(screen.getByLabelText(/^passwordLabel/i), {
      target: { value: "MyStr0ng!Pass" },
    });
    fireEvent.change(screen.getByLabelText(/confirmPasswordLabel/i), {
      target: { value: "DifferentPass1!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submitButton/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwordMismatch/i)).toBeInTheDocument();
    });
  });

  it("shows success message after successful reset", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { message: "reset" } }),
    });

    render(<ResetPasswordForm token="valid-token" />);
    fireEvent.change(screen.getByLabelText(/^passwordLabel/i), {
      target: { value: "MyStr0ng!Pass" },
    });
    fireEvent.change(screen.getByLabelText(/confirmPasswordLabel/i), {
      target: { value: "MyStr0ng!Pass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submitButton/i }));

    await waitFor(() => {
      expect(screen.getByText(/successTitle/i)).toBeInTheDocument();
    });
  });
});
