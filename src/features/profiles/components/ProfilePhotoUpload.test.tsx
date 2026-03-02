// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
}));

import { ProfilePhotoUpload } from "./ProfilePhotoUpload";

describe("ProfilePhotoUpload", () => {
  it("renders label and placeholder when no photo", () => {
    render(<ProfilePhotoUpload photoUrl={null} onPhotoUrl={vi.fn()} />);

    expect(screen.getByText("Onboarding.profile.photoLabel")).toBeInTheDocument();
    expect(screen.getByText("👤")).toBeInTheDocument();
  });

  it("renders photo when photoUrl is provided", () => {
    render(<ProfilePhotoUpload photoUrl="https://img.test/photo.jpg" onPhotoUrl={vi.fn()} />);

    const img = screen.getByAltText("Profile");
    expect(img).toHaveAttribute("src", "https://img.test/photo.jpg");
  });

  it("calls onPhotoUrl with null when skip button is clicked", () => {
    const onPhotoUrl = vi.fn();
    render(<ProfilePhotoUpload photoUrl="https://img.test/photo.jpg" onPhotoUrl={onPhotoUrl} />);

    fireEvent.click(screen.getByText("Onboarding.profile.photoSkip"));

    expect(onPhotoUrl).toHaveBeenCalledWith(null);
  });

  it("shows upload hint text", () => {
    render(<ProfilePhotoUpload photoUrl={null} onPhotoUrl={vi.fn()} />);

    expect(screen.getByText("Onboarding.profile.photoUploadHint")).toBeInTheDocument();
  });
});
