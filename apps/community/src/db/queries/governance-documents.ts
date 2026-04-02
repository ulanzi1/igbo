import "server-only";
import { db } from "@/db";
import { platformGovernanceDocuments } from "@/db/schema/platform-governance-documents";
import { eq, and, sql } from "drizzle-orm";

export type GovernanceDocStatus = "draft" | "published";
export type GovernanceDocVisibility = "public" | "admin_only";

export interface CreateGovernanceDocData {
  title: string;
  slug: string;
  content: string;
  contentIgbo?: string | null;
  status?: GovernanceDocStatus;
  visibility?: GovernanceDocVisibility;
}

export interface UpdateGovernanceDocData {
  title?: string;
  content?: string;
  contentIgbo?: string | null;
  visibility?: GovernanceDocVisibility;
}

export async function listPublishedDocuments(visibility?: GovernanceDocVisibility) {
  const conditions = [eq(platformGovernanceDocuments.status, "published")];
  if (visibility) {
    conditions.push(eq(platformGovernanceDocuments.visibility, visibility));
  }
  return db
    .select()
    .from(platformGovernanceDocuments)
    .where(and(...conditions))
    .orderBy(platformGovernanceDocuments.title);
}

export async function getDocumentBySlug(slug: string) {
  const rows = await db
    .select()
    .from(platformGovernanceDocuments)
    .where(eq(platformGovernanceDocuments.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function getDocumentById(id: string) {
  const rows = await db
    .select()
    .from(platformGovernanceDocuments)
    .where(eq(platformGovernanceDocuments.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listAllDocuments() {
  return db
    .select()
    .from(platformGovernanceDocuments)
    .orderBy(platformGovernanceDocuments.updatedAt);
}

export async function createDocument(data: CreateGovernanceDocData) {
  const rows = await db
    .insert(platformGovernanceDocuments)
    .values({
      title: data.title,
      slug: data.slug,
      content: data.content,
      contentIgbo: data.contentIgbo ?? null,
      status: data.status ?? "draft",
      visibility: data.visibility ?? "public",
      version: 1,
    })
    .returning();
  return rows[0]!;
}

export async function updateDocument(id: string, data: UpdateGovernanceDocData) {
  const rows = await db
    .update(platformGovernanceDocuments)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(platformGovernanceDocuments.id, id))
    .returning();
  return rows[0] ?? null;
}

export async function publishDocument(id: string, publishedBy: string) {
  // Only increment version on re-publish (when already published).
  // First publish keeps version 1 (set at creation).
  const rows = await db
    .update(platformGovernanceDocuments)
    .set({
      status: "published",
      publishedBy,
      publishedAt: new Date(),
      version: sql`CASE WHEN ${platformGovernanceDocuments.status} = 'published' THEN ${platformGovernanceDocuments.version} + 1 ELSE ${platformGovernanceDocuments.version} END`,
      updatedAt: new Date(),
    })
    .where(eq(platformGovernanceDocuments.id, id))
    .returning();
  return rows[0] ?? null;
}
