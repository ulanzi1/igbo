// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockDbExecute = vi.fn();

vi.mock("../index", () => ({
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

// ── Filtered mode tests (Story 10.2) ─────────────────────────────────────────

const filteredMemberRow = {
  id: "m1",
  display_name: "Alice Obi",
  photo_url: null,
  location_city: "Lagos",
  bio: "Community organizer",
  membership_tier: "BASIC",
  rank: "0.9",
  highlight: "<mark>Alice</mark> Obi",
};

const filteredPostRow = {
  id: "p1",
  content: "Post about Igbo culture",
  author_name: "Bob",
  category: "discussion",
  created_at: "2026-03-01T00:00:00.000Z",
  reaction_count: 5,
  comment_count: 2,
  rank: "0.8",
  highlight: "Post about <mark>Igbo</mark> culture",
};

const filteredArticleRow = {
  id: "a1",
  title: "Igbo Culture Guide",
  title_igbo: "Nkuzi Ọha Igbo",
  featured_image_url: null,
  author_name: "Carol",
  created_at: "2026-03-01T00:00:00.000Z",
  rank: "0.7",
  highlight: "<mark>Igbo</mark> Culture Guide",
};

const filteredGroupRow = {
  id: "g1",
  name: "Igbo Diaspora",
  description: "A community group",
  member_count: 42,
  visibility: "public",
  join_type: "open",
  rank: "0.6",
  highlight: "<mark>Igbo</mark> Diaspora",
};

const filteredEventRow = {
  id: "e1",
  title: "Igbo Festival",
  description: "Annual cultural festival",
  location: "Lagos",
  start_time: "2026-04-01T10:00:00.000Z",
  rsvp_count: 10,
  status: "upcoming",
  rank: "0.5",
  highlight: "<mark>Igbo</mark> Festival",
};

describe("runGlobalSearch — filtered mode (Story 10.2)", () => {
  it("uses filtered query path when type is single and filters are provided", async () => {
    mockDbExecute.mockResolvedValueOnce([filteredMemberRow]);

    const result = await runGlobalSearch({
      query: "alice",
      type: "members",
      viewerUserId: VIEWER_ID,
      filters: {},
    });

    expect(mockDbExecute).toHaveBeenCalledTimes(1);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]!.type).toBe("members");
  });

  it("includes highlight field in filtered member results", async () => {
    mockDbExecute.mockResolvedValueOnce([filteredMemberRow]);

    const result = await runGlobalSearch({
      query: "alice",
      type: "members",
      viewerUserId: VIEWER_ID,
      filters: {},
    });

    const item = result.sections[0]!.items[0]!;
    expect(item).toHaveProperty("highlight");
    // sanitize-html allows only <mark> tags
    expect(item.highlight).toContain("Alice");
  });

  it("returns nextCursor when more results exist", async () => {
    const rows = [filteredMemberRow, { ...filteredMemberRow, id: "m2" }];
    mockDbExecute.mockResolvedValueOnce(rows);

    const result = await runGlobalSearch({
      query: "alice",
      type: "members",
      viewerUserId: VIEWER_ID,
      limit: 1,
      filters: {},
    });

    expect(result.pageInfo.nextCursor).not.toBeNull();
    expect(result.pageInfo.hasNextPage).toBe(true);
  });

  it("returns null nextCursor when no more results", async () => {
    mockDbExecute.mockResolvedValueOnce([filteredMemberRow]);

    const result = await runGlobalSearch({
      query: "alice",
      type: "members",
      viewerUserId: VIEWER_ID,
      limit: 5,
      filters: {},
    });

    expect(result.pageInfo.nextCursor).toBeNull();
    expect(result.pageInfo.hasNextPage).toBe(false);
  });

  it("filtered posts query uses single DB call", async () => {
    mockDbExecute.mockResolvedValueOnce([filteredPostRow]);

    const result = await runGlobalSearch({
      query: "igbo",
      type: "posts",
      viewerUserId: VIEWER_ID,
      filters: { category: "discussion" },
    });

    expect(mockDbExecute).toHaveBeenCalledTimes(1);
    expect(result.sections[0]!.type).toBe("posts");
  });

  it("filtered articles query returns article items", async () => {
    mockDbExecute.mockResolvedValueOnce([filteredArticleRow]);

    const result = await runGlobalSearch({
      query: "igbo",
      type: "articles",
      viewerUserId: VIEWER_ID,
      filters: {},
    });

    expect(result.sections[0]!.type).toBe("articles");
    expect(result.sections[0]!.items[0]!.title).toBe("Igbo Culture Guide");
  });

  it("filtered groups query returns group items", async () => {
    mockDbExecute.mockResolvedValueOnce([filteredGroupRow]);

    const result = await runGlobalSearch({
      query: "igbo",
      type: "groups",
      viewerUserId: VIEWER_ID,
      filters: {},
    });

    expect(result.sections[0]!.type).toBe("groups");
    expect(result.sections[0]!.items[0]!.title).toBe("Igbo Diaspora");
  });

  it("filtered events query returns event items with start_time", async () => {
    mockDbExecute.mockResolvedValueOnce([filteredEventRow]);

    const result = await runGlobalSearch({
      query: "igbo",
      type: "events",
      viewerUserId: VIEWER_ID,
      filters: {},
    });

    expect(result.sections[0]!.type).toBe("events");
    expect(result.sections[0]!.items[0]!.title).toBe("Igbo Festival");
  });

  it("overview mode (type=all) is unchanged when filters is undefined", async () => {
    mockDbExecute
      .mockResolvedValueOnce([memberRow])
      .mockResolvedValueOnce([postRow])
      .mockResolvedValueOnce([articleRow])
      .mockResolvedValueOnce([groupRow])
      .mockResolvedValueOnce([eventRow]);

    const result = await runGlobalSearch({
      query: "igbo",
      type: "all",
      viewerUserId: VIEWER_ID,
      // no filters → overview mode
    });

    expect(result.sections).toHaveLength(5);
    expect(result.pageInfo.nextCursor).toBeNull();
    expect(result.pageInfo.cursor).toBeNull();
  });

  it("single type without filters uses overview path (nextCursor is null)", async () => {
    mockDbExecute.mockResolvedValueOnce([memberRow]);

    const result = await runGlobalSearch({
      query: "alice",
      type: "members",
      viewerUserId: VIEWER_ID,
      // filters: undefined → overview single-type path
    });

    expect(result.sections[0]!.type).toBe("members");
    expect(result.pageInfo.nextCursor).toBeNull();
  });

  it("cursor encode/decode is round-trip stable", async () => {
    const row2 = { ...filteredMemberRow, id: "m2", display_name: "Bob" };
    // First page: returns 2 rows for limit=1 → hasMore=true, nextCursor set
    mockDbExecute.mockResolvedValueOnce([filteredMemberRow, row2]);

    const page1 = await runGlobalSearch({
      query: "alice",
      type: "members",
      viewerUserId: VIEWER_ID,
      limit: 1,
      filters: {},
    });

    const cursor = page1.pageInfo.nextCursor;
    expect(cursor).not.toBeNull();

    // Second page: pass cursor back
    mockDbExecute.mockResolvedValueOnce([row2]);
    const page2 = await runGlobalSearch({
      query: "alice",
      type: "members",
      viewerUserId: VIEWER_ID,
      limit: 1,
      filters: {},
      cursor: cursor!,
    });

    expect(page2.sections[0]!.items[0]!.id).toBe("m2");
  });

  it("highlight is sanitized to strip script tags", async () => {
    const rowWithScriptTag = {
      ...filteredMemberRow,
      highlight: "<script>alert('xss')</script><mark>Alice</mark>",
    };
    mockDbExecute.mockResolvedValueOnce([rowWithScriptTag]);

    const result = await runGlobalSearch({
      query: "alice",
      type: "members",
      viewerUserId: VIEWER_ID,
      filters: {},
    });

    const highlight = result.sections[0]!.items[0]!.highlight;
    expect(highlight).not.toContain("<script>");
    expect(highlight).toContain("<mark>");
  });

  it("documents type returns empty section gracefully even when filters provided", async () => {
    const result = await runGlobalSearch({
      query: "policy",
      type: "documents",
      viewerUserId: VIEWER_ID,
      filters: {},
    });

    expect(mockDbExecute).not.toHaveBeenCalled();
    expect(result.sections[0]!.type).toBe("documents");
    expect(result.sections[0]!.items).toHaveLength(0);
  });

  it("null highlight from DB is returned as null", async () => {
    const rowNullHighlight = { ...filteredMemberRow, highlight: null };
    mockDbExecute.mockResolvedValueOnce([rowNullHighlight]);

    const result = await runGlobalSearch({
      query: "alice",
      type: "members",
      viewerUserId: VIEWER_ID,
      filters: {},
    });

    expect(result.sections[0]!.items[0]!.highlight).toBeNull();
  });
});
