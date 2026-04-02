// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockCreateDocument = vi.fn();
const mockUpdateDocument = vi.fn();
const mockPublishDocument = vi.fn();
const mockListPublishedDocuments = vi.fn();
const mockListAllDocuments = vi.fn();
const mockGetDocumentBySlug = vi.fn();
const mockGetDocumentById = vi.fn();
const mockLogAdminAction = vi.fn();

vi.mock("@igbo/db/queries/governance-documents", () => ({
  createDocument: (...a: unknown[]) => mockCreateDocument(...a),
  updateDocument: (...a: unknown[]) => mockUpdateDocument(...a),
  publishDocument: (...a: unknown[]) => mockPublishDocument(...a),
  listPublishedDocuments: (...a: unknown[]) => mockListPublishedDocuments(...a),
  listAllDocuments: (...a: unknown[]) => mockListAllDocuments(...a),
  getDocumentBySlug: (...a: unknown[]) => mockGetDocumentBySlug(...a),
  getDocumentById: (...a: unknown[]) => mockGetDocumentById(...a),
}));

vi.mock("@/services/audit-logger", () => ({
  logAdminAction: (...a: unknown[]) => mockLogAdminAction(...a),
}));

import {
  createGovernanceDocument,
  updateGovernanceDocument,
  publishGovernanceDocument,
  getPublicGovernanceDocuments,
} from "./governance-document-service";

const sampleDoc = {
  id: "doc-1",
  title: "About Us",
  slug: "about-us",
  content: "<p>Hello</p>",
  contentIgbo: null,
  version: 1,
  status: "published",
  visibility: "public",
  publishedBy: null,
  publishedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => vi.clearAllMocks());

describe("createGovernanceDocument", () => {
  it("creates and returns a document and logs GOVERNANCE_CREATED", async () => {
    mockCreateDocument.mockResolvedValue(sampleDoc);
    mockLogAdminAction.mockResolvedValue(undefined);
    const result = await createGovernanceDocument("admin-1", {
      title: "About Us",
      slug: "about-us",
      content: "<p>Hello</p>",
    });
    expect(result.slug).toBe("about-us");
    expect(mockCreateDocument).toHaveBeenCalledOnce();
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "GOVERNANCE_CREATED",
        targetId: "doc-1",
        targetType: "governance_document",
      }),
    );
  });
});

describe("updateGovernanceDocument", () => {
  it("updates document and logs audit action", async () => {
    const updated = { ...sampleDoc, title: "Updated" };
    mockUpdateDocument.mockResolvedValue(updated);
    mockLogAdminAction.mockResolvedValue(undefined);

    const result = await updateGovernanceDocument("admin-1", "doc-1", { title: "Updated" });
    expect(result?.title).toBe("Updated");
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "GOVERNANCE_UPDATED", targetId: "doc-1" }),
    );
  });

  it("does not log audit when document not found", async () => {
    mockUpdateDocument.mockResolvedValue(null);
    const result = await updateGovernanceDocument("admin-1", "missing", { title: "X" });
    expect(result).toBeNull();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });
});

describe("publishGovernanceDocument", () => {
  it("publishes document and logs GOVERNANCE_PUBLISHED", async () => {
    const published = { ...sampleDoc, status: "published", version: 2 };
    mockPublishDocument.mockResolvedValue(published);
    mockLogAdminAction.mockResolvedValue(undefined);

    const result = await publishGovernanceDocument("admin-1", "doc-1");
    expect(result?.version).toBe(2);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "GOVERNANCE_PUBLISHED", targetId: "doc-1" }),
    );
  });

  it("does not log audit when document not found", async () => {
    mockPublishDocument.mockResolvedValue(null);
    const result = await publishGovernanceDocument("admin-1", "missing");
    expect(result).toBeNull();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });
});

describe("getPublicGovernanceDocuments", () => {
  it("delegates to listPublishedDocuments", async () => {
    mockListPublishedDocuments.mockResolvedValue([sampleDoc]);
    const result = await getPublicGovernanceDocuments("public");
    expect(result).toHaveLength(1);
    expect(mockListPublishedDocuments).toHaveBeenCalledWith("public");
  });
});
