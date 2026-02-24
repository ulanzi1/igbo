// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/db/queries/community-profiles", () => ({
  getProfileByUserId: vi.fn(),
  upsertProfile: vi.fn(),
  setGuidelinesAcknowledged: vi.fn(),
  setTourComplete: vi.fn(),
}));

vi.mock("@/db/queries/auth-queries", () => ({
  findUserById: vi.fn(),
}));

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn(), on: vi.fn() },
}));

vi.mock("@/services/email-service", () => ({
  enqueueEmailJob: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema/auth-users", () => ({ authUsers: {} }));
vi.mock("@/db/schema/community-profiles", () => ({ communityProfiles: {} }));

import {
  getOnboardingState,
  saveProfile,
  acknowledgeGuidelines,
  completeTour,
  registerOnboardingCompletionSubscriber,
} from "./onboarding-service";

import {
  getProfileByUserId,
  upsertProfile,
  setGuidelinesAcknowledged,
  setTourComplete,
} from "@/db/queries/community-profiles";

import { findUserById } from "@/db/queries/auth-queries";
import { eventBus } from "@/services/event-bus";
import { enqueueEmailJob } from "@/services/email-service";

const mockGetProfile = vi.mocked(getProfileByUserId);
const mockUpsertProfile = vi.mocked(upsertProfile);
const mockSetGuidelinesAcknowledged = vi.mocked(setGuidelinesAcknowledged);
const mockSetTourComplete = vi.mocked(setTourComplete);
const mockFindUserById = vi.mocked(findUserById);
const mockEventBusEmit = vi.mocked(eventBus.emit);
const mockEventBusOn = vi.mocked(eventBus.on);
const mockEnqueueEmailJob = vi.mocked(enqueueEmailJob);

const USER_ID = "user-123";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── getOnboardingState ──────────────────────────────────────────────────────

describe("getOnboardingState", () => {
  it("returns profile step when no profile exists", async () => {
    mockGetProfile.mockResolvedValue(null);
    mockFindUserById.mockResolvedValue({
      id: USER_ID,
      name: "Test User",
      locationCity: "Lagos",
      locationState: "Lagos State",
      locationCountry: "Nigeria",
    } as never);

    const state = await getOnboardingState(USER_ID);
    expect(state.step).toBe("profile");
    expect(state.profile).toBeNull();
    expect(state.guidelinesAcknowledged).toBe(false);
  });

  it("returns profile step when profile exists but profileCompletedAt is null", async () => {
    mockGetProfile.mockResolvedValue({
      profileCompletedAt: null,
      displayName: "Partial",
      bio: null,
      photoUrl: null,
      locationCity: null,
      locationState: null,
      locationCountry: null,
      interests: [],
      culturalConnections: [],
      languages: [],
      deletedAt: null,
    } as never);
    mockFindUserById.mockResolvedValue({ id: USER_ID } as never);

    const state = await getOnboardingState(USER_ID);
    expect(state.step).toBe("profile");
    expect(state.profile).not.toBeNull();
  });

  it("returns guidelines step when profile is complete but guidelines not acknowledged", async () => {
    mockGetProfile.mockResolvedValue({
      profileCompletedAt: new Date(),
      guidelinesAcknowledgedAt: null,
      tourCompletedAt: null,
      tourSkippedAt: null,
      displayName: "Test",
      bio: null,
      photoUrl: null,
      locationCity: null,
      locationState: null,
      locationCountry: null,
      interests: [],
      culturalConnections: [],
      languages: [],
      deletedAt: null,
    } as never);
    mockFindUserById.mockResolvedValue({ id: USER_ID } as never);

    const state = await getOnboardingState(USER_ID);
    expect(state.step).toBe("guidelines");
    expect(state.guidelinesAcknowledged).toBe(false);
  });

  it("returns tour step when profile and guidelines are complete but tour not done", async () => {
    mockGetProfile.mockResolvedValue({
      profileCompletedAt: new Date(),
      guidelinesAcknowledgedAt: new Date(),
      tourCompletedAt: null,
      tourSkippedAt: null,
      deletedAt: null,
    } as never);
    mockFindUserById.mockResolvedValue({ id: USER_ID } as never);

    const state = await getOnboardingState(USER_ID);
    expect(state.step).toBe("tour");
    expect(state.guidelinesAcknowledged).toBe(true);
    expect(state.tourCompleted).toBe(false);
  });

  it("returns complete step when all steps are done", async () => {
    mockGetProfile.mockResolvedValue({
      profileCompletedAt: new Date(),
      guidelinesAcknowledgedAt: new Date(),
      tourCompletedAt: new Date(),
      tourSkippedAt: null,
      deletedAt: null,
    } as never);
    mockFindUserById.mockResolvedValue({ id: USER_ID } as never);

    const state = await getOnboardingState(USER_ID);
    expect(state.step).toBe("complete");
    expect(state.tourCompleted).toBe(true);
  });

  it("returns complete step when tour is skipped", async () => {
    mockGetProfile.mockResolvedValue({
      profileCompletedAt: new Date(),
      guidelinesAcknowledgedAt: new Date(),
      tourCompletedAt: null,
      tourSkippedAt: new Date(),
      deletedAt: null,
    } as never);
    mockFindUserById.mockResolvedValue({ id: USER_ID } as never);

    const state = await getOnboardingState(USER_ID);
    expect(state.step).toBe("complete");
  });
});

// ─── saveProfile ─────────────────────────────────────────────────────────────

describe("saveProfile", () => {
  it("calls upsertProfile with correct data and emits member.profile_completed", async () => {
    mockUpsertProfile.mockResolvedValue({ id: "profile-1" } as never);

    await saveProfile(USER_ID, {
      displayName: "Chukwuemeka",
      interests: ["culture", "music"],
    });

    expect(mockUpsertProfile).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ displayName: "Chukwuemeka" }),
    );
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "member.profile_completed",
      expect.objectContaining({ userId: USER_ID }),
    );
  });
});

// ─── acknowledgeGuidelines ───────────────────────────────────────────────────

describe("acknowledgeGuidelines", () => {
  it("calls setGuidelinesAcknowledged and emits member.guidelines_acknowledged", async () => {
    mockSetGuidelinesAcknowledged.mockResolvedValue(undefined);

    await acknowledgeGuidelines(USER_ID);

    expect(mockSetGuidelinesAcknowledged).toHaveBeenCalledWith(USER_ID);
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "member.guidelines_acknowledged",
      expect.objectContaining({ userId: USER_ID }),
    );
  });
});

// ─── completeTour ─────────────────────────────────────────────────────────────

describe("completeTour", () => {
  it("calls setTourComplete with skipped: false and emits member.onboarding_completed", async () => {
    mockSetTourComplete.mockResolvedValue(undefined);

    await completeTour(USER_ID, { skipped: false });

    expect(mockSetTourComplete).toHaveBeenCalledWith(USER_ID, false);
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "member.onboarding_completed",
      expect.objectContaining({ userId: USER_ID }),
    );
  });

  it("calls setTourComplete with skipped: true when skipped", async () => {
    mockSetTourComplete.mockResolvedValue(undefined);

    await completeTour(USER_ID, { skipped: true });

    expect(mockSetTourComplete).toHaveBeenCalledWith(USER_ID, true);
    expect(mockEventBusEmit).toHaveBeenCalledWith(
      "member.onboarding_completed",
      expect.objectContaining({ userId: USER_ID }),
    );
  });
});

// ─── registerOnboardingCompletionSubscriber ───────────────────────────────────

describe("registerOnboardingCompletionSubscriber", () => {
  it("registers a listener on member.onboarding_completed", () => {
    registerOnboardingCompletionSubscriber();
    expect(mockEventBusOn).toHaveBeenCalledWith(
      "member.onboarding_completed",
      expect.any(Function),
    );
  });

  it("sends welcome email when onboarding is completed", async () => {
    mockFindUserById.mockResolvedValue({
      id: USER_ID,
      email: "test@example.com",
      name: "Test",
    } as never);

    // Capture the listener registered on eventBus.on
    let listener: ((payload: { userId: string; timestamp: string }) => Promise<void>) | undefined;
    mockEventBusOn.mockImplementation((_event, handler) => {
      listener = handler as (payload: { userId: string; timestamp: string }) => Promise<void>;
      return eventBus;
    });

    registerOnboardingCompletionSubscriber();

    await listener!({ userId: USER_ID, timestamp: new Date().toISOString() });

    expect(mockFindUserById).toHaveBeenCalledWith(USER_ID);
    expect(mockEnqueueEmailJob).toHaveBeenCalledWith(
      expect.stringContaining(`welcome-${USER_ID}`),
      expect.objectContaining({ templateId: "member-welcome" }),
    );
  });

  it("does not send email when user not found", async () => {
    mockFindUserById.mockResolvedValue(null);

    let listener: ((payload: { userId: string; timestamp: string }) => Promise<void>) | undefined;
    mockEventBusOn.mockImplementation((_event, handler) => {
      listener = handler as (payload: { userId: string; timestamp: string }) => Promise<void>;
      return eventBus;
    });

    registerOnboardingCompletionSubscriber();
    await listener!({ userId: USER_ID, timestamp: new Date().toISOString() });

    expect(mockEnqueueEmailJob).not.toHaveBeenCalled();
  });
});
