/**
 * Reserved UUID for system-initiated actions (e.g. fast-lane auto-approvals).
 * This is NOT a real user. It references a seeded row in auth_users so the FK
 * from portal_admin_reviews.reviewer_user_id remains satisfied.
 * Migration 0058 inserts this seed row via ON CONFLICT DO NOTHING.
 */
export const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";
