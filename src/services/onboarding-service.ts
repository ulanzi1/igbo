import "server-only";
import {
  getProfileByUserId,
  upsertProfile,
  setGuidelinesAcknowledged,
  setTourComplete,
} from "@/db/queries/community-profiles";
import { findUserById } from "@/db/queries/auth-queries";
import { eventBus } from "@/services/event-bus";
import { enqueueEmailJob } from "@/services/email-service";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OnboardingStep = "profile" | "guidelines" | "tour" | "complete";

export interface OnboardingState {
  step: OnboardingStep;
  profile: {
    displayName: string | null;
    bio: string | null;
    photoUrl: string | null;
    locationCity: string | null;
    locationState: string | null;
    locationCountry: string | null;
    interests: string[];
    culturalConnections: string[];
    languages: string[];
  } | null;
  guidelinesAcknowledged: boolean;
  tourCompleted: boolean;
}

export interface SaveProfilePayload {
  displayName: string;
  bio?: string | null;
  photoUrl?: string | null;
  locationCity?: string | null;
  locationState?: string | null;
  locationCountry?: string | null;
  locationLat?: string | null;
  locationLng?: string | null;
  interests?: string[];
  culturalConnections?: string[];
  languages?: string[];
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Determine where a user should resume onboarding.
 * Returns the first incomplete step and partial profile data for prefilling.
 */
export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  const [user, profile] = await Promise.all([findUserById(userId), getProfileByUserId(userId)]);

  // No profile yet → start at profile step
  if (!profile || !profile.profileCompletedAt) {
    return {
      step: "profile",
      profile: profile
        ? {
            displayName: profile.displayName,
            bio: profile.bio,
            photoUrl: profile.photoUrl,
            locationCity: profile.locationCity ?? user?.locationCity ?? null,
            locationState: profile.locationState ?? user?.locationState ?? null,
            locationCountry: profile.locationCountry ?? user?.locationCountry ?? null,
            interests: profile.interests,
            culturalConnections: profile.culturalConnections,
            languages: profile.languages,
          }
        : null,
      guidelinesAcknowledged: false,
      tourCompleted: false,
    };
  }

  // Profile done but guidelines not acknowledged → guidelines step
  if (!profile.guidelinesAcknowledgedAt) {
    return {
      step: "guidelines",
      profile: {
        displayName: profile.displayName,
        bio: profile.bio,
        photoUrl: profile.photoUrl,
        locationCity: profile.locationCity,
        locationState: profile.locationState,
        locationCountry: profile.locationCountry,
        interests: profile.interests,
        culturalConnections: profile.culturalConnections,
        languages: profile.languages,
      },
      guidelinesAcknowledged: false,
      tourCompleted: false,
    };
  }

  // Guidelines done but tour not done → tour step
  if (!profile.tourCompletedAt && !profile.tourSkippedAt) {
    return {
      step: "tour",
      profile: null,
      guidelinesAcknowledged: true,
      tourCompleted: false,
    };
  }

  // All complete
  return {
    step: "complete",
    profile: null,
    guidelinesAcknowledged: true,
    tourCompleted: true,
  };
}

/**
 * Persist profile data and mark profile step complete.
 * Emits member.profile_completed.
 */
export async function saveProfile(userId: string, payload: SaveProfilePayload): Promise<void> {
  const now = new Date();

  await upsertProfile(userId, {
    displayName: payload.displayName,
    bio: payload.bio ?? null,
    photoUrl: payload.photoUrl ?? null,
    locationCity: payload.locationCity ?? null,
    locationState: payload.locationState ?? null,
    locationCountry: payload.locationCountry ?? null,
    locationLat: payload.locationLat ?? null,
    locationLng: payload.locationLng ?? null,
    interests: payload.interests ?? [],
    culturalConnections: payload.culturalConnections ?? [],
    languages: payload.languages ?? [],
    profileCompletedAt: now,
    guidelinesAcknowledgedAt: null,
    tourCompletedAt: null,
    tourSkippedAt: null,
    deletedAt: null,
  });

  eventBus.emit("member.profile_completed", {
    userId,
    timestamp: now.toISOString(),
  });
}

/**
 * Record guidelines acknowledgment.
 * Emits member.guidelines_acknowledged.
 */
export async function acknowledgeGuidelines(userId: string): Promise<void> {
  await setGuidelinesAcknowledged(userId);

  eventBus.emit("member.guidelines_acknowledged", {
    userId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Mark tour as complete or skipped.
 * Emits member.onboarding_completed.
 */
export async function completeTour(userId: string, options: { skipped: boolean }): Promise<void> {
  await setTourComplete(userId, options.skipped);

  eventBus.emit("member.onboarding_completed", {
    userId,
    timestamp: new Date().toISOString(),
  });
}

// ─── Onboarding completion subscriber ────────────────────────────────────────

/**
 * Subscribe to member.onboarding_completed to send the welcome email
 * and trigger an in-app welcome notification.
 * Call this once during server initialisation (e.g., in the job runner startup).
 */
export function registerOnboardingCompletionSubscriber(): void {
  eventBus.on("member.onboarding_completed", async ({ userId }) => {
    // Load user for email
    const user = await findUserById(userId);
    if (!user) return;

    // Welcome email (Story 1.17 will replace stub with real provider)
    enqueueEmailJob(`welcome-${userId}-${Date.now()}`, {
      to: user.email,
      subject: "Welcome to OBIGBO!",
      templateId: "member-welcome",
      data: { name: user.name ?? user.email },
    });

    // TODO: replace with real notification service once Story 1.15/1.17 ships
    // In-platform welcome notification placeholder — stored via notification service
  });
}
