import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/test-utils";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockSaveProfileAction = vi.fn();
vi.mock("@/features/profiles", () => ({
  saveProfileAction: (...args: unknown[]) => mockSaveProfileAction(...args),
  ProfilePhotoUpload: ({
    onPhotoUrl,
  }: {
    photoUrl: string | null;
    onPhotoUrl: (url: string | null) => void;
  }) => (
    <div data-testid="photo-upload" onClick={() => onPhotoUrl(null)}>
      photo
    </div>
  ),
  TagInput: ({
    id,
    label,
  }: {
    id: string;
    label: string;
    values: string[];
    onChange: (v: string[]) => void;
  }) => <div data-testid={`tag-${id}`}>{label}</div>,
}));

import { ProfileStep } from "./ProfileStep";

const DEFAULT_PROPS = {
  defaultDisplayName: "Chukwuemeka",
  defaultLocationCity: "Lagos",
  defaultLocationState: "Lagos State",
  defaultLocationCountry: "Nigeria",
  onComplete: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProfileStep", () => {
  it("renders display name field pre-filled with defaultDisplayName", () => {
    render(<ProfileStep {...DEFAULT_PROPS} />);
    const input = screen.getByLabelText("displayNameLabel") as HTMLInputElement;
    expect(input.value).toBe("Chukwuemeka");
  });

  it("renders location fields pre-filled with defaults", () => {
    render(<ProfileStep {...DEFAULT_PROPS} />);
    const city = screen.getByLabelText("locationCityLabel") as HTMLInputElement;
    expect(city.value).toBe("Lagos");
    // Country uses shadcn Select (renders as <button>, not <input>) — check trigger text content
    const countryTrigger = screen.getByLabelText("locationCountryLabel");
    expect(countryTrigger).toHaveTextContent("Nigeria");
  });

  it("shows error when display name is empty on submit", async () => {
    render(<ProfileStep {...DEFAULT_PROPS} defaultDisplayName="" />);
    const submitBtn = screen.getByRole("button", { name: "continueButton" });
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("errors.displayNameRequired");
    });
  });

  it("calls saveProfileAction with trimmed displayName on submit", async () => {
    mockSaveProfileAction.mockResolvedValue({ success: true });
    render(<ProfileStep {...DEFAULT_PROPS} />);
    const submitBtn = screen.getByRole("button", { name: "continueButton" });
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(mockSaveProfileAction).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: "Chukwuemeka" }),
      );
    });
  });

  it("calls onComplete when save succeeds", async () => {
    const onComplete = vi.fn();
    mockSaveProfileAction.mockResolvedValue({ success: true });
    render(<ProfileStep {...DEFAULT_PROPS} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: "continueButton" }));
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it("shows server error when saveProfileAction returns failure", async () => {
    mockSaveProfileAction.mockResolvedValue({ success: false, error: "Save failed" });
    render(<ProfileStep {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "continueButton" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Save failed");
    });
    expect(DEFAULT_PROPS.onComplete).not.toHaveBeenCalled();
  });
});
