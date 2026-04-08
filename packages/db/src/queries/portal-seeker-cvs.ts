import "server-only";
import { db } from "../index";
import { portalSeekerCvs } from "../schema/portal-seeker-cvs";
import { platformFileUploads } from "../schema/file-uploads";
import type { NewPortalSeekerCv, PortalSeekerCv } from "../schema/portal-seeker-cvs";
import type { PlatformFileUpload } from "../schema/file-uploads";
import { eq, and, desc, count } from "drizzle-orm";

export type CvWithFile = PortalSeekerCv & {
  file: Pick<
    PlatformFileUpload,
    "originalFilename" | "fileType" | "fileSize" | "objectKey" | "status"
  >;
};

export async function listSeekerCvs(profileId: string): Promise<CvWithFile[]> {
  const rows = await db
    .select({
      id: portalSeekerCvs.id,
      seekerProfileId: portalSeekerCvs.seekerProfileId,
      fileUploadId: portalSeekerCvs.fileUploadId,
      label: portalSeekerCvs.label,
      isDefault: portalSeekerCvs.isDefault,
      createdAt: portalSeekerCvs.createdAt,
      file: {
        originalFilename: platformFileUploads.originalFilename,
        fileType: platformFileUploads.fileType,
        fileSize: platformFileUploads.fileSize,
        objectKey: platformFileUploads.objectKey,
        status: platformFileUploads.status,
      },
    })
    .from(portalSeekerCvs)
    .innerJoin(platformFileUploads, eq(portalSeekerCvs.fileUploadId, platformFileUploads.id))
    .where(eq(portalSeekerCvs.seekerProfileId, profileId))
    .orderBy(desc(portalSeekerCvs.isDefault), desc(portalSeekerCvs.createdAt));
  return rows;
}

export async function getSeekerCvById(cvId: string): Promise<CvWithFile | null> {
  const [row] = await db
    .select({
      id: portalSeekerCvs.id,
      seekerProfileId: portalSeekerCvs.seekerProfileId,
      fileUploadId: portalSeekerCvs.fileUploadId,
      label: portalSeekerCvs.label,
      isDefault: portalSeekerCvs.isDefault,
      createdAt: portalSeekerCvs.createdAt,
      file: {
        originalFilename: platformFileUploads.originalFilename,
        fileType: platformFileUploads.fileType,
        fileSize: platformFileUploads.fileSize,
        objectKey: platformFileUploads.objectKey,
        status: platformFileUploads.status,
      },
    })
    .from(portalSeekerCvs)
    .innerJoin(platformFileUploads, eq(portalSeekerCvs.fileUploadId, platformFileUploads.id))
    .where(eq(portalSeekerCvs.id, cvId))
    .limit(1);
  return row ?? null;
}

export async function countSeekerCvs(profileId: string): Promise<number> {
  const [result] = await db
    .select({ value: count() })
    .from(portalSeekerCvs)
    .where(eq(portalSeekerCvs.seekerProfileId, profileId));
  return result?.value ?? 0;
}

export async function createSeekerCv(data: NewPortalSeekerCv): Promise<PortalSeekerCv> {
  const [row] = await db.insert(portalSeekerCvs).values(data).returning();
  if (!row) throw new Error("Failed to create seeker CV");
  return row;
}

export async function updateSeekerCv(
  cvId: string,
  patch: Partial<Pick<NewPortalSeekerCv, "label">>,
): Promise<PortalSeekerCv | null> {
  const [row] = await db
    .update(portalSeekerCvs)
    .set(patch)
    .where(eq(portalSeekerCvs.id, cvId))
    .returning();
  return row ?? null;
}

export async function setDefaultCv(
  profileId: string,
  cvId: string,
): Promise<PortalSeekerCv | null> {
  return await db.transaction(async (tx) => {
    // Clear all defaults for this profile
    await tx
      .update(portalSeekerCvs)
      .set({ isDefault: false })
      .where(eq(portalSeekerCvs.seekerProfileId, profileId));
    // Set the target as default
    const [row] = await tx
      .update(portalSeekerCvs)
      .set({ isDefault: true })
      .where(and(eq(portalSeekerCvs.id, cvId), eq(portalSeekerCvs.seekerProfileId, profileId)))
      .returning();
    return row ?? null;
  });
}

export async function deleteSeekerCvWithFile(
  cvId: string,
): Promise<{ deletedDefaultPromoted: PortalSeekerCv | null }> {
  return await db.transaction(async (tx) => {
    // Load the CV
    const [cv] = await tx
      .select()
      .from(portalSeekerCvs)
      .where(eq(portalSeekerCvs.id, cvId))
      .limit(1);
    if (!cv) return { deletedDefaultPromoted: null };

    const { seekerProfileId, fileUploadId, isDefault } = cv;

    // Delete the CV row
    await tx.delete(portalSeekerCvs).where(eq(portalSeekerCvs.id, cvId));

    // Soft-delete the file_upload — do NOT use updateFileUpload() here (uses global db, breaks tx)
    await tx
      .update(platformFileUploads)
      .set({ status: "deleted" })
      .where(eq(platformFileUploads.id, fileUploadId));

    let promoted: PortalSeekerCv | null = null;

    // If was default, promote the most recently uploaded remaining CV
    if (isDefault) {
      const [candidate] = await tx
        .select()
        .from(portalSeekerCvs)
        .where(eq(portalSeekerCvs.seekerProfileId, seekerProfileId))
        .orderBy(desc(portalSeekerCvs.createdAt))
        .limit(1);
      if (candidate) {
        const [updated] = await tx
          .update(portalSeekerCvs)
          .set({ isDefault: true })
          .where(eq(portalSeekerCvs.id, candidate.id))
          .returning();
        promoted = updated ?? null;
      }
    }

    return { deletedDefaultPromoted: promoted };
  });
}
