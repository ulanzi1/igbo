// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
  useLocale: () => "en",
}));

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: mockRefresh }),
}));

const mockSignIn = vi.fn();
vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryFn }: { queryFn: () => Promise<unknown> }) => {
    // Return mock data immediately without actually calling queryFn
    return {
      data: { secret: "JBSWY3DPEHPK3PXP", qrCodeDataUrl: "data:image/png;base64,abc" },
      isLoading: false,
    };
  },
}));

import { TwoFactorSetup } from "./TwoFactorSetup";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
});

describe("TwoFactorSetup", () => {
  it("renders QR code and verification form", () => {
    render(<TwoFactorSetup challengeToken="token-123" />);

    expect(screen.getByText("Auth.twoFactorSetup.heading")).toBeInTheDocument();
    expect(screen.getByAltText("Auth.twoFactorSetup.qrCodeAlt")).toBeInTheDocument();
    expect(screen.getByLabelText("Auth.twoFactorSetup.codeLabel")).toBeInTheDocument();
    expect(screen.getByText("Auth.twoFactorSetup.submitButton")).toBeInTheDocument();
  });

  it("shows the secret for manual entry", () => {
    render(<TwoFactorSetup challengeToken="token-123" />);
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
  });

  it("shows error when code verification fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    });

    render(<TwoFactorSetup challengeToken="token-123" />);

    fireEvent.change(screen.getByLabelText("Auth.twoFactorSetup.codeLabel"), {
      target: { value: "123456" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: /Auth.twoFactorSetup.submitButton/i }).closest("form")!,
    );

    await waitFor(() => {
      expect(screen.getByText("Auth.twoFactorSetup.invalidCode")).toBeInTheDocument();
    });
  });

  it("shows recovery codes after successful verification", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            recoveryCodes: ["code-1", "code-2", "code-3"],
            challengeToken: "verified-token",
          },
        }),
    });

    render(<TwoFactorSetup challengeToken="token-123" />);

    fireEvent.change(screen.getByLabelText("Auth.twoFactorSetup.codeLabel"), {
      target: { value: "123456" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: /Auth.twoFactorSetup.submitButton/i }).closest("form")!,
    );

    await waitFor(() => {
      expect(screen.getByText("Auth.twoFactorSetup.recoveryCodesTitle")).toBeInTheDocument();
    });

    expect(screen.getByText("code-1")).toBeInTheDocument();
    expect(screen.getByText("code-2")).toBeInTheDocument();
    expect(screen.getByText("code-3")).toBeInTheDocument();
  });

  it("copies recovery codes to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { recoveryCodes: ["c1", "c2"], challengeToken: "vt" },
        }),
    });

    render(<TwoFactorSetup challengeToken="token-123" />);

    // Submit to get to recovery step
    fireEvent.change(screen.getByLabelText("Auth.twoFactorSetup.codeLabel"), {
      target: { value: "123456" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: /Auth.twoFactorSetup.submitButton/i }).closest("form")!,
    );

    await waitFor(() => {
      expect(screen.getByText("Auth.twoFactorSetup.copyRecoveryCodes")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Auth.twoFactorSetup.copyRecoveryCodes"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("c1\nc2");
    });
  });

  it("calls signIn and navigates on continue", async () => {
    mockSignIn.mockResolvedValue({ error: null });

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { recoveryCodes: ["c1"], challengeToken: "verified" },
        }),
    });

    render(<TwoFactorSetup challengeToken="token-123" />);

    fireEvent.change(screen.getByLabelText("Auth.twoFactorSetup.codeLabel"), {
      target: { value: "123456" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: /Auth.twoFactorSetup.submitButton/i }).closest("form")!,
    );

    await waitFor(() => {
      expect(screen.getByText("Auth.twoFactorSetup.recoveryContinue")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Auth.twoFactorSetup.recoveryContinue"));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith("credentials", {
        challengeToken: "verified",
        redirect: false,
      });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/en/onboarding");
    });
  });
});
