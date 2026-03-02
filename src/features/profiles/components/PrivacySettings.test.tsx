// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/test-utils";

const mockMutateAsync = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
}));

vi.mock("@/features/profiles/hooks/use-profile", () => ({
  useUpdatePrivacySettings: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

import { PrivacySettings } from "./PrivacySettings";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PrivacySettings", () => {
  it("renders heading and visibility options", () => {
    render(<PrivacySettings initialVisibility="PUBLIC_TO_MEMBERS" initialLocationVisible={true} />);

    expect(screen.getByText("Settings.privacy.heading")).toBeInTheDocument();

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
  });

  it("selects the initial visibility option", () => {
    render(<PrivacySettings initialVisibility="LIMITED" initialLocationVisible={false} />);

    const limitedRadio = screen.getByDisplayValue("LIMITED");
    expect(limitedRadio).toBeChecked();
  });

  it("calls mutateAsync when visibility changes", async () => {
    mockMutateAsync.mockResolvedValue({ success: true });
    render(<PrivacySettings initialVisibility="PUBLIC_TO_MEMBERS" initialLocationVisible={true} />);

    fireEvent.click(screen.getByDisplayValue("PRIVATE"));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ profileVisibility: "PRIVATE" });
    });
  });

  it("shows success message after successful update", async () => {
    mockMutateAsync.mockResolvedValue({ success: true });
    render(<PrivacySettings initialVisibility="PUBLIC_TO_MEMBERS" initialLocationVisible={true} />);

    fireEvent.click(screen.getByDisplayValue("LIMITED"));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Settings.privacy.successMessage");
    });
  });

  it("shows error message after failed update", async () => {
    mockMutateAsync.mockResolvedValue({ success: false });
    render(<PrivacySettings initialVisibility="PUBLIC_TO_MEMBERS" initialLocationVisible={true} />);

    fireEvent.click(screen.getByDisplayValue("PRIVATE"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Settings.privacy.errorMessage");
    });
  });

  it("renders location toggle switch with correct initial state", () => {
    render(<PrivacySettings initialVisibility="PUBLIC_TO_MEMBERS" initialLocationVisible={true} />);

    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("calls mutateAsync when location toggle is clicked", async () => {
    mockMutateAsync.mockResolvedValue({ success: true });
    render(<PrivacySettings initialVisibility="PUBLIC_TO_MEMBERS" initialLocationVisible={true} />);

    fireEvent.click(screen.getByRole("switch"));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ locationVisible: false });
    });
  });

  it("toggles location off then on", async () => {
    mockMutateAsync.mockResolvedValue({ success: true });
    render(
      <PrivacySettings initialVisibility="PUBLIC_TO_MEMBERS" initialLocationVisible={false} />,
    );

    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ locationVisible: true });
    });
  });
});
