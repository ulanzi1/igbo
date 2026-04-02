import "server-only";
import {
  listPublishedDocuments,
  listAllDocuments,
  getDocumentBySlug,
  getDocumentById,
  createDocument,
  updateDocument,
  publishDocument,
  type CreateGovernanceDocData,
  type UpdateGovernanceDocData,
  type GovernanceDocVisibility,
} from "@/db/queries/governance-documents";
import { logAdminAction } from "@/services/audit-logger";

export { getDocumentBySlug, getDocumentById, listPublishedDocuments, listAllDocuments };

export async function createGovernanceDocument(actorId: string, data: CreateGovernanceDocData) {
  const doc = await createDocument(data);
  await logAdminAction({
    actorId,
    action: "GOVERNANCE_CREATED",
    targetId: doc.id,
    targetType: "governance_document",
    details: { slug: doc.slug },
  });
  return doc;
}

export async function updateGovernanceDocument(
  actorId: string,
  documentId: string,
  data: UpdateGovernanceDocData,
) {
  const doc = await updateDocument(documentId, data);
  if (doc) {
    await logAdminAction({
      actorId,
      action: "GOVERNANCE_UPDATED",
      targetId: documentId,
      targetType: "governance_document",
      details: { slug: doc.slug },
    });
  }
  return doc;
}

export async function publishGovernanceDocument(actorId: string, documentId: string) {
  const doc = await publishDocument(documentId, actorId);
  if (doc) {
    await logAdminAction({
      actorId,
      action: "GOVERNANCE_PUBLISHED",
      targetId: documentId,
      targetType: "governance_document",
      details: { slug: doc.slug, version: doc.version },
    });
  }
  return doc;
}

export async function getPublicGovernanceDocuments(visibility?: GovernanceDocVisibility) {
  return listPublishedDocuments(visibility);
}
