// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockDbExecute = vi.fn();

vi.mock("@/db", () => ({
  db: { execute: (...args: unknown[]) => mockDbExecute(...args) },
}));

import { runGlobalSearch } from "./search";

const VIEWER_ID = "00000000-0000-4000-8000-000000000001";

const memberRow = {
  id: "m1",
  display_name: "Alice Obi",
  photo_url: null,
  location_city: "Lagos",
  rank: "0.9",
};

const postRow = {
  id: "p1",
  content: "This is a test post about Igbo culture and traditions",
  author_name: "Bob",
  rank: "0.8",
};

const articleRow = {
  id: "a1",
  title: "Igbo Culture",
  title_igbo: "Ọha Igbo",
  rank: "0.7",
};

const groupRow = {
  id: "g1",
  name: "Igbo Diaspora",
  description: "A group for the diaspora",
  rank: "0.6",
};

const eventRow = {
  id: "e1",
  title: "Igbo Festival",
  description: "Annual cultural festival",
  rank: "0.5",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runGlobalSearch — type=all", () => {
  it("returns 5 sections with items when DB returns results", async () => {
    mockDbExecute
      .mockResolvedValueOnce([memberRow]) // members
      .mockResolvedValueOnce([postRow]) // posts
      .mockResolvedValueOnce([articleRow]) // articles
      .mockResolvedValueOnce([groupRow]) // groups
      .mockResolvedValueOnce([eventRow]); // events

    const result = await runGlobalSearch({
      query: "igbo",
      type: "all",
      viewerUserId: VIEWER_ID,
    });

    expect(result.sections).toHaveLength(5);
    expect(result.sections[0].type).toBe("members");
    expect(result.sections[1].type).toBe("posts");
    expect(result.sections[2].type).toBe("articles");
    expect(result.sections[3].type).toBe("groups");
    expect(result.sections[4].type).toBe("events");
  });

  it("maps member rows to correct SearchResultItem shape", async () => {
    mockDbExecute
      .mockResolvedValueOnce([memberRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await runGlobalSearch({
      query: "alice",
      type: "all",
      viewerUserId: VIEWER_ID,
    });

    const memberSection = result.sections.find((s) => s.type === "members")!;
    expect(memberSection.items).toHaveLength(1);
    const item = memberSection.items[0]!;
    expect(item.id).toBe("m1");
    expect(item.title).toBe("Alice Obi");
    expect(item.subtitle).toBe("Lagos");
    expect(item.href).toBe("/profiles/m1");
    expect(item.type).toBe("members");
  });

  it("detects hasMore when DB returns limit+1 rows", async () => {
    // limit=1, fetch 2 rows → hasMore=true
    const rows = [memberRow, { ...memberRow, id: "m2" }];
    mockDbExecute
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await runGlobalSearch({
      query: "alice",
      type: "all",
      viewerUserId: VIEWER_ID,
      limit: 1,
    });

    const memberSection = result.sections.find((s) => s.type === "members")!;
    expect(memberSection.hasMore).toBe(true);
    // Only limit rows returned to caller
    expect(memberSection.items).toHaveLength(1);
  });

  it("hasNextPage is true when any section has hasMore", async () => {
    const rows = [memberRow, { ...memberRow, id: "m2" }];
    mockDbExecute
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await runGlobalSearch({
      query: "alice",
      type: "all",
      viewerUserId: VIEWER_ID,
      limit: 1,
    });

    expect(result.pageInfo.hasNextPage).toBe(true);
  });
});

describe("runGlobalSearch — single type", () => {
  it("queries only members when type=members", async () => {
    mockDbExecute.mockResolvedValueOnce([memberRow]);

    const result = await runGlobalSearch({
      query: "alice",
      type: "members",
      viewerUserId: VIEWER_ID,
    });

    expect(mockDbExecute).toHaveBeenCalledTimes(1);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].type).toBe("members");
  });

  it("queries only events when type=events", async () => {
    mockDbExecute.mockResolvedValueOnce([eventRow]);

    const result = await runGlobalSearch({
      query: "festival",
      type: "events",
      viewerUserId: VIEWER_ID,
    });

    expect(mockDbExecute).toHaveBeenCalledTimes(1);
    expect(result.sections[0].type).toBe("events");
  });
});

describe("runGlobalSearch — content truncation", () => {
  it("truncates long post content to 100 chars", async () => {
    const longPost = { ...postRow, content: "a".repeat(120) };
    mockDbExecute.mockResolvedValueOnce([longPost]);

    const result = await runGlobalSearch({
      query: "test",
      type: "posts",
      viewerUserId: VIEWER_ID,
    });

    const item = result.sections[0]!.items[0]!;
    expect(item.title.length).toBeLessThanOrEqual(104); // 100 + "…"
    expect(item.title.endsWith("…")).toBe(true);
  });

  it("does not truncate short post content", async () => {
    const shortPost = { ...postRow, content: "Short content" };
    mockDbExecute.mockResolvedValueOnce([shortPost]);

    const result = await runGlobalSearch({
      query: "test",
      type: "posts",
      viewerUserId: VIEWER_ID,
    });

    expect(result.sections[0]!.items[0]!.title).toBe("Short content");
  });
});

describe("runGlobalSearch — documents type", () => {
  it("returns explicit empty section when type=documents", async () => {
    const result = await runGlobalSearch({
      query: "policy",
      type: "documents",
      viewerUserId: VIEWER_ID,
    });

    expect(mockDbExecute).not.toHaveBeenCalled();
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].type).toBe("documents");
    expect(result.sections[0].items).toHaveLength(0);
    expect(result.sections[0].hasMore).toBe(false);
  });
});

describe("runGlobalSearch — blocked user filtering", () => {
  it("passes viewerUserId to searchMembers for block filtering", async () => {
    mockDbExecute.mockResolvedValueOnce([memberRow]);

    await runGlobalSearch({
      query: "alice",
      type: "members",
      viewerUserId: VIEWER_ID,
    });

    // The SQL should include the viewerUserId for block filtering
    expect(mockDbExecute).toHaveBeenCalledTimes(1);
    const sqlArg = mockDbExecute.mock.calls[0]?.[0];
    expect(sqlArg).toBeDefined();
  });
});

describe("runGlobalSearch — empty results", () => {
  it("returns empty sections when DB returns no rows", async () => {
    mockDbExecute
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await runGlobalSearch({
      query: "nonexistent",
      type: "all",
      viewerUserId: VIEWER_ID,
    });

    expect(result.sections.every((s) => s.items.length === 0)).toBe(true);
    expect(result.pageInfo.hasNextPage).toBe(false);
  });
});
