// ─── NextAuth module augmentations ───────────────────────────────────────────
// These augmentations extend the NextAuth types to include igbo-specific fields.
// Consuming apps must have @igbo/auth in their TS project references/types for
// these to apply globally.
//
// SYNC POINT: Role union literals below must match userRoleEnum in @igbo/db/schema/auth-users.
// Module augmentations use literal types because `declare module` cannot reference
// runtime imports without breaking augmentation propagation.
//
// NOTE: Do NOT import PortalRole from ./portal-role here — that creates a circular dep:
// config.ts → types.ts → portal-role.ts → config.ts. Use inline literal union instead.

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
      activePortalRole?: "JOB_SEEKER" | "EMPLOYER" | "JOB_ADMIN" | null;
      portalRoles?: ("JOB_SEEKER" | "EMPLOYER" | "JOB_ADMIN")[];
    };
  }
}

export {};
