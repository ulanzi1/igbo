// ─── next-auth/jwt module augmentation ───────────────────────────────────────
// Augmenting next-auth/jwt here (in the consuming app) rather than in
// @igbo/auth because next-auth/jwt re-exports from @auth/core/jwt, and
// @auth/core is not a direct dependency of the package — causing TS2664 in
// standalone package typecheck.
//
// The `export {}` below is REQUIRED: it makes this a module file so that
// `declare module` is treated as an augmentation (merge) rather than an
// ambient module declaration (replacement). Without it, all original exports
// from next-auth/jwt (e.g. `decode`) would be hidden.
//
// SYNC POINT: must match the JWT fields written in @igbo/auth/src/config.ts.

import type {} from "next-auth/jwt";

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
