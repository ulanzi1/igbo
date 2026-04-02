// @igbo/auth — Shared authentication package
// Re-exports the main auth primitives for the "." subpath export.

export { handlers, signIn, signOut, auth } from "./config";
export {
  getChallenge,
  setChallenge,
  consumeChallenge,
  deleteChallenge,
  CHALLENGE_TTL,
  type ChallengeData,
} from "./config";
export { initAuthRedis } from "./redis";
export { ApiError, type ProblemDetails } from "./api-error";
export type {} from "./types"; // Ensure module augmentations are applied

// Derive UserRole from the DB schema enum — single source of truth for role values.
import { userRoleEnum } from "@igbo/db/schema/auth-users";
/** All user roles including portal roles. */
export type UserRole = (typeof userRoleEnum.enumValues)[number];
