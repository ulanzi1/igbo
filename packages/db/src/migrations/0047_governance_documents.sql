-- Migration 0047: Create platform_governance_documents table
CREATE TABLE "platform_governance_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" varchar(200) NOT NULL,
  "slug" varchar(200) UNIQUE NOT NULL,
  "content" text NOT NULL,
  "content_igbo" text,
  "version" integer NOT NULL DEFAULT 1,
  "status" varchar(20) NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft', 'published')),
  "visibility" varchar(20) NOT NULL DEFAULT 'public' CHECK ("visibility" IN ('public', 'admin_only')),
  "published_by" uuid REFERENCES "auth_users"("id"),
  "published_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
