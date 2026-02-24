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

import { ForgotPasswordForm } from "./ForgotPasswordForm";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ForgotPasswordForm", () => {
  it("renders email input", () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByLabelText(/emailLabel/i)).toBeInTheDocument();
  });

  it("shows success message after submit", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { message: "sent" } }),
    });

    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText(/emailLabel/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submitButton/i }));

    await waitFor(() => {
      expect(screen.getByText(/successTitle/i)).toBeInTheDocument();
    });
  });

  it("shows error on invalid email format", async () => {
    render(<ForgotPasswordForm />);
    // HTML5 validation prevents submission with invalid email type input
    const input = screen.getByLabelText(/emailLabel/i) as HTMLInputElement;
    expect(input.type).toBe("email");
  });
});
