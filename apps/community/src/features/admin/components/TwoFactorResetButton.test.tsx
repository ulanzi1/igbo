// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
}));

import { TwoFactorResetButton } from "./TwoFactorResetButton";

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn();
  window.confirm = vi.fn();
});

describe("TwoFactorResetButton", () => {
  it("renders reset button", () => {
    render(<TwoFactorResetButton userId="u1" />);
    expect(screen.getByText("Auth.adminTwoFactorReset.resetButton")).toBeInTheDocument();
  });

  it("does nothing when user cancels confirm dialog", async () => {
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(false);
    render(<TwoFactorResetButton userId="u1" />);

    fireEvent.click(screen.getByText("Auth.adminTwoFactorReset.resetButton"));

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("calls API and shows success on successful reset", async () => {
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();

    render(<TwoFactorResetButton userId="u1" onSuccess={onSuccess} />);
    fireEvent.click(screen.getByText("Auth.adminTwoFactorReset.resetButton"));

    await waitFor(() => {
      expect(screen.getByText("Auth.adminTwoFactorReset.resetSuccess")).toBeInTheDocument();
    });
    expect(onSuccess).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/v1/admin/members/u1/reset-2fa",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows error when API returns non-ok", async () => {
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });

    render(<TwoFactorResetButton userId="u1" />);
    fireEvent.click(screen.getByText("Auth.adminTwoFactorReset.resetButton"));

    await waitFor(() => {
      expect(screen.getByText("Auth.adminTwoFactorReset.resetError")).toBeInTheDocument();
    });
  });

  it("shows error when fetch throws", async () => {
    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

    render(<TwoFactorResetButton userId="u1" />);
    fireEvent.click(screen.getByText("Auth.adminTwoFactorReset.resetButton"));

    await waitFor(() => {
      expect(screen.getByText("Auth.adminTwoFactorReset.resetError")).toBeInTheDocument();
    });
  });
});
