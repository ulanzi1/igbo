// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/test-utils";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
}));

// Mock FileUpload so tests are isolated from upload internals
vi.mock("@/components/shared/FileUpload", () => ({
  FileUpload: ({
    onUploadComplete,
    triggerLabel,
    disabled,
    accept,
  }: {
    onUploadComplete: (id: string, key: string, url: string) => void;
    triggerLabel?: string;
    disabled?: boolean;
    accept?: string;
  }) => (
    <button
      data-testid="file-upload-trigger"
      disabled={disabled}
      data-accept={accept}
      onClick={() => onUploadComplete("id1", "key1", "https://cdn.test/photo.jpg")}
    >
      {triggerLabel ?? "Select file"}
    </button>
  ),
}));

import { ProfilePhotoUpload } from "./ProfilePhotoUpload";

describe("ProfilePhotoUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders label", () => {
    render(<ProfilePhotoUpload photoUrl={null} onPhotoUrl={vi.fn()} />);
    expect(screen.getByText("Onboarding.profile.photoLabel")).toBeInTheDocument();
  });

  it("renders avatar placeholder with accessible label when no photo", () => {
    render(<ProfilePhotoUpload photoUrl={null} onPhotoUrl={vi.fn()} />);
    expect(
      screen.getByRole("img", { name: "Onboarding.profile.photoPlaceholderAlt" }),
    ).toBeInTheDocument();
  });

  it("renders photo img when photoUrl is provided", () => {
    render(<ProfilePhotoUpload photoUrl="https://img.test/photo.jpg" onPhotoUrl={vi.fn()} />);
    const img = screen.getByRole("img", { name: "Onboarding.profile.photoAlt" });
    expect(img).toHaveAttribute("src", "https://img.test/photo.jpg");
  });

  it("passes correct accept types to FileUpload", () => {
    render(<ProfilePhotoUpload photoUrl={null} onPhotoUrl={vi.fn()} />);
    expect(screen.getByTestId("file-upload-trigger")).toHaveAttribute(
      "data-accept",
      "image/jpeg,image/png,image/webp,image/avif",
    );
  });

  it("disables FileUpload when disabled prop is true", () => {
    render(<ProfilePhotoUpload photoUrl={null} onPhotoUrl={vi.fn()} disabled />);
    expect(screen.getByTestId("file-upload-trigger")).toBeDisabled();
  });

  it("renders FileUpload with photoUploadButton label", () => {
    render(<ProfilePhotoUpload photoUrl={null} onPhotoUrl={vi.fn()} />);
    expect(screen.getByText("Onboarding.profile.photoUploadButton")).toBeInTheDocument();
  });

  it("calls onPhotoUrl with publicUrl when upload completes", async () => {
    const onPhotoUrl = vi.fn();
    render(<ProfilePhotoUpload photoUrl={null} onPhotoUrl={onPhotoUrl} />);

    fireEvent.click(screen.getByTestId("file-upload-trigger"));

    await waitFor(() => {
      expect(onPhotoUrl).toHaveBeenCalledWith("https://cdn.test/photo.jpg");
    });
  });

  it("does NOT show skip button by default", () => {
    render(<ProfilePhotoUpload photoUrl={null} onPhotoUrl={vi.fn()} />);
    expect(screen.queryByText("Onboarding.profile.photoSkip")).not.toBeInTheDocument();
  });

  it("shows skip button when showSkip=true", () => {
    render(<ProfilePhotoUpload photoUrl={null} onPhotoUrl={vi.fn()} showSkip />);
    expect(screen.getByText("Onboarding.profile.photoSkip")).toBeInTheDocument();
  });

  it("calls onPhotoUrl(null) when skip button is clicked", () => {
    const onPhotoUrl = vi.fn();
    render(
      <ProfilePhotoUpload photoUrl="https://img.test/photo.jpg" onPhotoUrl={onPhotoUrl} showSkip />,
    );

    fireEvent.click(screen.getByText("Onboarding.profile.photoSkip"));

    expect(onPhotoUrl).toHaveBeenCalledWith(null);
  });
});
