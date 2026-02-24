export type SocialProvider = "FACEBOOK" | "LINKEDIN" | "TWITTER" | "INSTAGRAM";

export interface UpdateProfileData {
  displayName?: string;
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

export interface PrivacySettings {
  profileVisibility?: "PUBLIC_TO_MEMBERS" | "LIMITED" | "PRIVATE";
  locationVisible?: boolean;
}
