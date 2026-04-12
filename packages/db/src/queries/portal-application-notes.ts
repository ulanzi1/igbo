import "server-only";
import { db } from "../index";
import { portalApplicationNotes } from "../schema/portal-application-notes";
import { authUsers } from "../schema/auth-users";
import type {
  NewPortalApplicationNote,
  PortalApplicationNote,
} from "../schema/portal-application-notes";
import { eq, asc } from "drizzle-orm";

export type { NewPortalApplicationNote, PortalApplicationNote };

/**
 * Enriched note row returned to employer UI. `authorName` is LEFT-JOINed
 * from `auth_users.name` and may be null for deleted/anonymized authors.
 * Origin: P-2.10
 */
export interface ApplicationNote {
  id: string;
  applicationId: string;
  authorUserId: string;
  authorName: string | null;
  content: string;
  createdAt: Date;
}

/**
 * Append a new note. Notes are immutable (no update/delete queries) —
 * append-only for audit integrity per Story P-2.10 AC-4.
 */
export async function createApplicationNote(data: {
  applicationId: string;
  authorUserId: string;
  content: string;
}): Promise<ApplicationNote> {
  const insertData: NewPortalApplicationNote = {
    applicationId: data.applicationId,
    authorUserId: data.authorUserId,
    content: data.content,
  };
  const [inserted] = await db.insert(portalApplicationNotes).values(insertData).returning();
  if (!inserted) throw new Error("createApplicationNote: no row returned");

  // Fetch author name for immediate display. Done as a small follow-up query
  // to keep the insert path simple; callers can also return the insert row
  // and resolve author name client-side from session.
  const [author] = await db
    .select({ name: authUsers.name })
    .from(authUsers)
    .where(eq(authUsers.id, inserted.authorUserId))
    .limit(1);

  return {
    id: inserted.id,
    applicationId: inserted.applicationId,
    authorUserId: inserted.authorUserId,
    authorName: author?.name ?? null,
    content: inserted.content,
    createdAt: inserted.createdAt,
  };
}

/**
 * Return all notes for an application with author name joined from
 * `auth_users`. Ordered by `createdAt ASC` so oldest appears first —
 * the UI appends newest at the bottom of the chronological list.
 */
export async function getNotesByApplicationId(applicationId: string): Promise<ApplicationNote[]> {
  const rows = await db
    .select({
      id: portalApplicationNotes.id,
      applicationId: portalApplicationNotes.applicationId,
      authorUserId: portalApplicationNotes.authorUserId,
      authorName: authUsers.name,
      content: portalApplicationNotes.content,
      createdAt: portalApplicationNotes.createdAt,
    })
    .from(portalApplicationNotes)
    .leftJoin(authUsers, eq(portalApplicationNotes.authorUserId, authUsers.id))
    .where(eq(portalApplicationNotes.applicationId, applicationId))
    .orderBy(asc(portalApplicationNotes.createdAt));

  return rows.map((row) => ({
    id: row.id,
    applicationId: row.applicationId,
    authorUserId: row.authorUserId,
    authorName: row.authorName ?? null,
    content: row.content,
    createdAt: row.createdAt,
  }));
}
