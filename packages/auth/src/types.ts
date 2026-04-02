// ─── NextAuth module augmentations ───────────────────────────────────────────
// These augmentations extend the NextAuth types to include igbo-specific fields.
// Consuming apps must have @igbo/auth in their TS project references/types for
// these to apply globally.
//
// SYNC POINT: Role union literals below must match userRoleEnum in @igbo/db/schema/auth-users.
// Module augmentations use literal types because `declare module` cannot reference
// runtime imports without breaking augmentation propagation.

declare module "next-auth" {
  interface User {
    role: "MEMBER" | "ADMIN" | "MODERATOR" | "JOB_SEEKER" | "EMPLOYER" | "JOB_ADMIN";
    accountStatus: string;
    profileCompleted: boolean;
    membershipTier: "BASIC" | "PROFESSIONAL" | "TOP_TIER";
  }
  interface Session {
    sessionToken?: string;
    user: {
      id: string;
      role: "MEMBER" | "ADMIN" | "MODERATOR" | "JOB_SEEKER" | "EMPLOYER" | "JOB_ADMIN";
      accountStatus: string;
      profileCompleted: boolean;
      membershipTier: "BASIC" | "PROFESSIONAL" | "TOP_TIER";
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "MEMBER" | "ADMIN" | "MODERATOR" | "JOB_SEEKER" | "EMPLOYER" | "JOB_ADMIN";
    accountStatus: string;
    profileCompleted: boolean;
    membershipTier: "BASIC" | "PROFESSIONAL" | "TOP_TIER";
  }
}

export {};
