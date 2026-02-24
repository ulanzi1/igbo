import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/test-utils";

// ─── Mocks ─────────────────────────────────────────────────────────────────
vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { LoginForm } from "./LoginForm";
import { signIn } from "next-auth/react";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LoginForm", () => {
  it("renders email and password fields", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/emailLabel/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/passwordLabel/i)).toBeInTheDocument();
  });

  it("shows error message on invalid credentials", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: "Invalid credentials" }),
    });

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/emailLabel/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/passwordLabel/i), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submitButton/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalidCredentials/i)).toBeInTheDocument();
    });
  });

  it("shows 2FA form when credentials succeed", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: { requiresMfaSetup: false, challengeToken: "tok-abc" },
      }),
    });

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/emailLabel/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/passwordLabel/i), {
      target: { value: "Pass1!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submitButton/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/codeLabel/i)).toBeInTheDocument();
    });
  });

  it("calls signIn after 2FA verification", async () => {
    // First call: credentials
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { requiresMfaSetup: false, challengeToken: "tok-abc" },
        }),
      })
      // Second call: 2FA verify
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { challengeToken: "verified-tok" } }),
      });

    vi.mocked(signIn).mockResolvedValue({ error: null } as never);

    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/emailLabel/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/passwordLabel/i), {
      target: { value: "Pass1!" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submitButton/i }));

    await waitFor(() => screen.getByLabelText(/codeLabel/i));

    fireEvent.change(screen.getByLabelText(/codeLabel/i), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submitButton/i }));

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith("credentials", {
        challengeToken: "verified-tok",
        redirect: false,
      });
    });
  });
});
