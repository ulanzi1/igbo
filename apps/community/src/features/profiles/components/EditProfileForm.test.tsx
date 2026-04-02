// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/test-utils";

const mockMutateAsync = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (key: string) => `${ns}.${key}`,
}));

vi.mock("@/features/profiles", () => ({
  ProfilePhotoUpload: ({ photoUrl }: { photoUrl: string | null }) => (
    <div data-testid="photo-upload">{photoUrl}</div>
  ),
  TagInput: ({
    id,
    label,
    values,
    onChange,
  }: {
    id: string;
    label: string;
    values: string[];
    onChange: (v: string[]) => void;
    maxItems?: number;
  }) => (
    <div data-testid={`tag-input-${id}`}>
      <span>{label}</span>
      <span>{values.join(",")}</span>
      <button onClick={() => onChange([...values, "new-tag"])}>add</button>
    </div>
  ),
  useUpdateProfile: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

import { EditProfileForm } from "./EditProfileForm";
import type { CommunityProfile } from "@igbo/db/schema/community-profiles";

const baseProfile: CommunityProfile = {
  userId: "u1",
  displayName: "Ada Okafor",
  bio: "A bio",
  photoUrl: null,
  locationCity: "Lagos",
  locationState: "Lagos State",
  locationCountry: "Nigeria",
  locationLat: null,
  locationLng: null,
  interests: ["Culture"],
  culturalConnections: ["Igbo"],
  languages: ["English", "Igbo"],
  profileVisibility: "public_to_members",
  locationVisible: true,
  onboardingDisplayNameAt: new Date(),
  onboardingBioAt: null,
  onboardingPhotoAt: null,
  onboardingInterestsAt: null,
  onboardingGuidelinesAt: null,
  onboardingTourAt: null,
  profileCompletedAt: null,
  followerCount: 0,
  followingCount: 0,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EditProfileForm", () => {
  it("renders form fields with initial values", () => {
    render(<EditProfileForm initialProfile={baseProfile} />);

    expect(screen.getByLabelText("Settings.profile.displayName")).toHaveValue("Ada Okafor");
    expect(screen.getByLabelText("Settings.profile.bio")).toHaveValue("A bio");
    expect(screen.getByLabelText("Settings.profile.locationCity")).toHaveValue("Lagos");
    expect(screen.getByLabelText("Settings.profile.locationState")).toHaveValue("Lagos State");
    expect(screen.getByLabelText("Settings.profile.locationCountry")).toHaveValue("Nigeria");
  });

  it("renders tag inputs for interests, cultural connections, and languages", () => {
    render(<EditProfileForm initialProfile={baseProfile} />);

    expect(screen.getByTestId("tag-input-interests")).toBeInTheDocument();
    expect(screen.getByTestId("tag-input-culturalConnections")).toBeInTheDocument();
    expect(screen.getByTestId("tag-input-languages")).toBeInTheDocument();
  });

  it("renders photo upload component", () => {
    render(<EditProfileForm initialProfile={baseProfile} />);
    expect(screen.getByTestId("photo-upload")).toBeInTheDocument();
  });

  it("shows success message on successful submit", async () => {
    mockMutateAsync.mockResolvedValue({ success: true });
    render(<EditProfileForm initialProfile={baseProfile} />);

    fireEvent.change(screen.getByLabelText("Settings.profile.displayName"), {
      target: { value: "New Name" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: /Settings.profile.submitButton/i }).closest("form")!,
    );

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Settings.profile.successMessage");
    });

    expect(mockMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "New Name" }),
    );
  });

  it("shows error message on failed submit", async () => {
    mockMutateAsync.mockResolvedValue({ success: false, error: "Validation failed" });
    render(<EditProfileForm initialProfile={baseProfile} />);

    fireEvent.submit(
      screen.getByRole("button", { name: /Settings.profile.submitButton/i }).closest("form")!,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Validation failed");
    });
  });

  it("shows generic error when no error message in response", async () => {
    mockMutateAsync.mockResolvedValue({ success: false });
    render(<EditProfileForm initialProfile={baseProfile} />);

    fireEvent.submit(
      screen.getByRole("button", { name: /Settings.profile.submitButton/i }).closest("form")!,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Settings.profile.errorMessage");
    });
  });

  it("sends empty strings as null for optional fields", async () => {
    mockMutateAsync.mockResolvedValue({ success: true });
    const profile = {
      ...baseProfile,
      bio: "",
      locationCity: "",
      locationState: "",
      locationCountry: "",
    };
    render(<EditProfileForm initialProfile={profile} />);

    fireEvent.submit(
      screen.getByRole("button", { name: /Settings.profile.submitButton/i }).closest("form")!,
    );

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          bio: null,
          locationCity: null,
          locationState: null,
          locationCountry: null,
        }),
      );
    });
  });
});
