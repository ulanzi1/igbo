-- Seed portal role rows in auth_roles table.
-- Migration 0049 added JOB_SEEKER/EMPLOYER/JOB_ADMIN to the user_role enum on auth_users.role.
-- This migration seeds the corresponding rows in auth_roles so the RBAC system can assign
-- portal roles to users via auth_user_roles (used by getUserPortalRoles() in @igbo/db).

INSERT INTO auth_roles (id, name, description) VALUES
  (gen_random_uuid(), 'JOB_SEEKER', 'Portal job seeker role'),
  (gen_random_uuid(), 'EMPLOYER',   'Portal employer role'),
  (gen_random_uuid(), 'JOB_ADMIN',  'Portal administrator role')
ON CONFLICT (name) DO NOTHING;
