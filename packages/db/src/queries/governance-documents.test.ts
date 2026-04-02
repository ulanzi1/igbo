// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockSelect = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

vi.mock("../index", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
}));

vi.mock("../schema/platform-governance-documents", () => ({
  platformGovernanceDocuments: {
    id: "id",
    title: "title",
    slug: "slug",
    content: "content",
    contentIgbo: "content_igbo",
    version: "version",
    status: "status",
    visibility: "visibility",
    publishedBy: "published_by",
    publishedAt: "published_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  sql: Object.assign((strings: TemplateStringsArray) => ({ sql: strings.join("") }), {
    join: vi.fn(),
  }),
}));

const sampleDoc = {
  id: "doc-1",
  title: "About Us",
  slug: "about-us",
  content: "<p>Hello</p>",
  contentIgbo: "<p>Nno</p>",
  version: 1,
  status: "published",
  visibility: "public",
  publishedBy: "admin-1",
  publishedAt: new Date("2026-01-01"),
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mockSelect.mockReturnValue(chain);
  return chain;
}

import {
  listPublishedDocuments,
  getDocumentBySlug,
  getDocumentById,
  createDocument,
  updateDocument,
  publishDocument,
  listAllDocuments,
} from "./governance-documents";

describe("listPublishedDocuments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns published docs", async () => {
    const chain = makeSelectChain([sampleDoc]);
    // listPublishedDocuments resolves after orderBy
    chain.orderBy.mockResolvedValue([sampleDoc]);
    const result = await listPublishedDocuments();
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("about-us");
  });
});

describe("getDocumentBySlug", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns document when found", async () => {
    makeSelectChain([sampleDoc]);
    const result = await getDocumentBySlug("about-us");
    expect(result).toEqual(sampleDoc);
  });

  it("returns null when not found", async () => {
    makeSelectChain([]);
    const result = await getDocumentBySlug("missing");
    expect(result).toBeNull();
  });
});

describe("getDocumentById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns document when found", async () => {
    makeSelectChain([sampleDoc]);
    const result = await getDocumentById("doc-1");
    expect(result?.id).toBe("doc-1");
  });

  it("returns null when not found", async () => {
    makeSelectChain([]);
    const result = await getDocumentById("missing");
    expect(result).toBeNull();
  });
});

describe("listAllDocuments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns all documents", async () => {
    const chain = makeSelectChain([sampleDoc]);
    chain.orderBy.mockResolvedValue([sampleDoc]);
    const result = await listAllDocuments();
    expect(result).toHaveLength(1);
  });
});

describe("createDocument", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts and returns a document", async () => {
    const chain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([sampleDoc]),
    };
    mockInsert.mockReturnValue(chain);
    const result = await createDocument({
      title: "About Us",
      slug: "about-us",
      content: "<p>Hello</p>",
    });
    expect(result.slug).toBe("about-us");
  });
});

describe("updateDocument", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates and returns document", async () => {
    const updated = { ...sampleDoc, title: "Updated" };
    const chain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([updated]),
    };
    mockUpdate.mockReturnValue(chain);
    const result = await updateDocument("doc-1", { title: "Updated" });
    expect(result?.title).toBe("Updated");
  });

  it("returns null when document not found", async () => {
    const chain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
    };
    mockUpdate.mockReturnValue(chain);
    const result = await updateDocument("missing", { title: "X" });
    expect(result).toBeNull();
  });
});

describe("publishDocument", () => {
  beforeEach(() => vi.clearAllMocks());

  it("publishes document and returns it", async () => {
    const published = { ...sampleDoc, status: "published", version: 2 };
    const chain = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([published]),
    };
    mockUpdate.mockReturnValue(chain);
    const result = await publishDocument("doc-1", "admin-1");
    expect(result?.status).toBe("published");
    expect(result?.version).toBe(2);
  });
});
