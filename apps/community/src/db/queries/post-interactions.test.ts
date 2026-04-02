// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getViewerReaction,
  getReactionCounts,
  toggleReaction,
  insertComment,
  softDeleteComment,
  getComments,
  incrementShareCount,
  getOriginalPostEmbed,
} from "./post-interactions";

// Use vi.hoisted() so these references are available inside vi.mock() factory
const {
  mockDb,
  mockSelect,
  mockFrom,
  mockWhere,
  mockGroupBy,
  mockOrderBy,
  mockLimit,
  mockInnerJoin,
  mockInsert,
  mockValues,
  mockUpdate,
  mockSet,
  mockDelete,
  mockReturning,
} = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockFrom = vi.fn();
  const mockWhere = vi.fn();
  const mockGroupBy = vi.fn();
  const mockOrderBy = vi.fn();
  const mockLimit = vi.fn();
  const mockInnerJoin = vi.fn();
  const mockInsert = vi.fn();
  const mockValues = vi.fn();
  const mockUpdate = vi.fn();
  const mockSet = vi.fn();
  const mockDelete = vi.fn();
  const mockReturning = vi.fn();
  const mockDb = {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    transaction: vi.fn(),
  };
  return {
    mockDb,
    mockSelect,
    mockFrom,
    mockWhere,
    mockGroupBy,
    mockOrderBy,
    mockLimit,
    mockInnerJoin,
    mockInsert,
    mockValues,
    mockUpdate,
    mockSet,
    mockDelete,
    mockReturning,
  };
});

vi.mock("@/db", () => ({ db: mockDb }));
vi.mock("@/db/schema/community-posts", () => ({
  communityPosts: {
    id: "id",
    likeCount: "like_count",
    commentCount: "comment_count",
    shareCount: "share_count",
    deletedAt: "deleted_at",
    authorId: "author_id",
    originalPostId: "original_post_id",
  },
  communityPostMedia: {
    postId: "post_id",
    mediaUrl: "media_url",
    mediaType: "media_type",
    altText: "alt_text",
    sortOrder: "sort_order",
  },
}));
vi.mock("@/db/schema/post-interactions", () => ({
  communityPostReactions: {
    postId: "post_id",
    userId: "user_id",
    reactionType: "reaction_type",
    createdAt: "created_at",
  },
  communityPostComments: {
    id: "id",
    postId: "post_id",
    authorId: "author_id",
    content: "content",
    parentCommentId: "parent_comment_id",
    deletedAt: "deleted_at",
    createdAt: "created_at",
  },
}));
vi.mock("@/db/schema/community-profiles", () => ({
  communityProfiles: {
    userId: "user_id",
    displayName: "display_name",
    photoUrl: "photo_url",
    deletedAt: "deleted_at",
  },
}));

beforeEach(() => {
  vi.resetAllMocks();

  // Default select chain: select().from().innerJoin().where().orderBy().limit()
  // mockWhere returns a chainable object — individual tests override with mockResolvedValue when needed
  mockSelect.mockReturnValue({ from: mockFrom });
  mockFrom.mockReturnValue({ where: mockWhere, innerJoin: mockInnerJoin });
  mockInnerJoin.mockReturnValue({ where: mockWhere });
  mockWhere.mockReturnValue({
    groupBy: mockGroupBy,
    orderBy: mockOrderBy,
    limit: mockLimit,
    returning: mockReturning,
  });
  mockGroupBy.mockResolvedValue([]);
  mockOrderBy.mockReturnValue({ limit: mockLimit });
  mockLimit.mockResolvedValue([]);

  // Insert chain
  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockReturnValue({ returning: mockReturning });
  mockReturning.mockResolvedValue([]);

  // Update chain: update().set().where().returning()
  mockUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: mockWhere });

  // Delete chain
  mockDelete.mockReturnValue({ where: mockWhere });
});

// ─── getViewerReaction ────────────────────────────────────────────────────────

describe("getViewerReaction", () => {
  it("returns null when no reaction exists", async () => {
    mockWhere.mockResolvedValue([]);
    const result = await getViewerReaction("post-1", "user-1");
    expect(result).toBeNull();
  });

  it("returns reaction type when reaction exists", async () => {
    mockWhere.mockResolvedValue([{ reactionType: "like" }]);
    const result = await getViewerReaction("post-1", "user-1");
    expect(result).toBe("like");
  });
});

// ─── getReactionCounts ────────────────────────────────────────────────────────

describe("getReactionCounts", () => {
  it("returns zeros when no reactions", async () => {
    mockGroupBy.mockResolvedValue([]);
    const result = await getReactionCounts("post-1");
    expect(result).toEqual({ like: 0, love: 0, celebrate: 0, insightful: 0, funny: 0 });
  });

  it("returns correct counts by type", async () => {
    mockGroupBy.mockResolvedValue([
      { reactionType: "like", count: 5 },
      { reactionType: "love", count: 2 },
    ]);
    const result = await getReactionCounts("post-1");
    expect(result).toEqual({ like: 5, love: 2, celebrate: 0, insightful: 0, funny: 0 });
  });
});

// ─── toggleReaction ───────────────────────────────────────────────────────────

// Helper: create a toggleReaction tx mock with the given existing reaction query result
function makeTxForToggle(existingResult: unknown[]) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          for: vi.fn().mockResolvedValue(existingResult),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
  };
}

describe("toggleReaction", () => {
  beforeEach(() => {
    mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb(makeTxForToggle([]));
    });
  });

  it("inserts new reaction and returns { newReactionType: 'like', countDelta: 1 } when no existing", async () => {
    mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb(makeTxForToggle([]));
    });

    const result = await toggleReaction("post-1", "user-1", "like");
    expect(result).toEqual({ newReactionType: "like", countDelta: 1 });
  });

  it("deletes reaction and returns { newReactionType: null, countDelta: -1 } when toggling same type", async () => {
    mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb(makeTxForToggle([{ reactionType: "like" }]));
    });

    const result = await toggleReaction("post-1", "user-1", "like");
    expect(result).toEqual({ newReactionType: null, countDelta: -1 });
  });

  it("updates reaction type and returns { newReactionType: 'love', countDelta: 0 } when changing type", async () => {
    mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb(makeTxForToggle([{ reactionType: "like" }]));
    });

    const result = await toggleReaction("post-1", "user-1", "love");
    expect(result).toEqual({ newReactionType: "love", countDelta: 0 });
  });
});

// ─── insertComment ────────────────────────────────────────────────────────────

describe("insertComment", () => {
  it("inserts comment and increments commentCount (no parent)", async () => {
    const newComment = {
      id: "comment-1",
      postId: "post-1",
      authorId: "user-1",
      content: "Hello",
      parentCommentId: null,
      deletedAt: null,
      createdAt: new Date(),
    };

    mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([newComment]) }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
        }),
      };
      return cb(tx);
    });

    const result = await insertComment({ postId: "post-1", authorId: "user-1", content: "Hello" });
    expect(result).toEqual(newComment);
  });

  it("validates parentCommentId belongs to same post — throws if not found", async () => {
    mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }), // parent not found
        }),
        insert: vi.fn(),
        update: vi.fn(),
      };
      return cb(tx);
    });

    await expect(
      insertComment({
        postId: "post-1",
        authorId: "user-1",
        content: "Hello",
        parentCommentId: "parent-1",
      }),
    ).rejects.toThrow("Parent comment not found");
  });

  it("rejects reply to a reply — only one level of nesting allowed", async () => {
    mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { postId: "post-1", parentCommentId: "grandparent-1" }, // parent is itself a reply
            ]),
          }),
        }),
        insert: vi.fn(),
        update: vi.fn(),
      };
      return cb(tx);
    });

    await expect(
      insertComment({
        postId: "post-1",
        authorId: "user-1",
        content: "Hello",
        parentCommentId: "parent-1",
      }),
    ).rejects.toThrow("Cannot reply to a reply");
  });
});

// ─── softDeleteComment ────────────────────────────────────────────────────────

describe("softDeleteComment", () => {
  it("returns true when own comment is deleted", async () => {
    // softDeleteComment: db.update().set().where().returning() — terminal is returning()
    mockReturning.mockResolvedValue([{ id: "comment-1" }]);

    const result = await softDeleteComment("comment-1", "user-1");
    expect(result).toBe(true);
  });

  it("returns false when comment not found or not authorized", async () => {
    // Default mockReturning resolves to [] from beforeEach
    const result = await softDeleteComment("comment-1", "other-user");
    expect(result).toBe(false);
  });
});

// ─── getComments ──────────────────────────────────────────────────────────────

// Helper: build a per-call select chain that resolves to a specific value.
// The top-level query uses .orderBy().limit() → terminal at limit().
// The replies query uses .orderBy() → terminal at orderBy() (no .limit()).
function makeSelectChain(resolveWith: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(resolveWith),
          }),
          groupBy: vi.fn().mockResolvedValue(resolveWith),
          limit: vi.fn().mockResolvedValue(resolveWith),
        }),
      }),
      where: vi.fn().mockResolvedValue(resolveWith),
    }),
  };
}

// Helper: replies query terminates at orderBy() (no limit).
function makeSelectChainWithOrderByTerminal(resolveWith: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(resolveWith),
        }),
      }),
    }),
  };
}

describe("getComments", () => {
  it("returns empty array when no comments", async () => {
    // Top-level query returns [] → early return, no replies query
    mockSelect.mockReturnValueOnce(makeSelectChain([]));

    const result = await getComments("post-1");
    expect(result).toEqual({ comments: [], nextCursor: null });
  });

  it("returns top-level comments with embedded replies", async () => {
    const now = new Date();
    const topComment = {
      id: "c1",
      postId: "post-1",
      authorId: "user-1",
      authorDisplayName: "Ada",
      authorPhotoUrl: null,
      content: "Top comment",
      parentCommentId: null,
      deletedAt: null,
      createdAt: now,
    };
    const replyComment = {
      id: "c2",
      postId: "post-1",
      authorId: "user-2",
      authorDisplayName: "Bob",
      authorPhotoUrl: null,
      content: "Reply",
      parentCommentId: "c1",
      deletedAt: null,
      createdAt: now,
    };

    // 1st db.select() call: top-level query ending at .limit()
    // 2nd db.select() call: replies query ending at .orderBy()
    mockSelect
      .mockReturnValueOnce(makeSelectChain([topComment]))
      .mockReturnValueOnce(makeSelectChainWithOrderByTerminal([replyComment]));

    const result = await getComments("post-1");
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0]!.id).toBe("c1");
    expect(result.comments[0]!.replies).toHaveLength(1);
    expect(result.comments[0]!.replies[0]!.id).toBe("c2");
  });

  it("blanks content for deleted comments", async () => {
    const deletedComment = {
      id: "c1",
      postId: "post-1",
      authorId: "user-1",
      authorDisplayName: "Ada",
      authorPhotoUrl: null,
      content: "Secret",
      parentCommentId: null,
      deletedAt: new Date(),
      createdAt: new Date(),
    };

    // 1st call: top-level with deleted comment; 2nd call: replies (empty)
    mockSelect
      .mockReturnValueOnce(makeSelectChain([deletedComment]))
      .mockReturnValueOnce(makeSelectChainWithOrderByTerminal([]));

    const result = await getComments("post-1");
    expect(result.comments[0]!.content).toBe("");
    expect(result.comments[0]!.deletedAt).not.toBeNull();
  });
});

// ─── incrementShareCount ──────────────────────────────────────────────────────

describe("incrementShareCount", () => {
  it("calls db.update with share_count + 1", async () => {
    mockWhere.mockResolvedValue([]);
    await incrementShareCount("post-1");
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalled();
  });
});

// ─── getOriginalPostEmbed ─────────────────────────────────────────────────────

describe("getOriginalPostEmbed", () => {
  // Helper: post query chain terminates at .where() (no orderBy/limit)
  // select().from().innerJoin().where() → resolves to array
  function makePostEmbedChain(resolveWith: unknown[]) {
    return {
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(resolveWith),
        }),
      }),
    };
  }

  // Helper: media query chain terminates at .orderBy()
  // select().from().where().orderBy() → resolves to array
  function makeMediaChain(resolveWith: unknown[]) {
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(resolveWith),
        }),
      }),
    };
  }

  it("returns null when post not found", async () => {
    mockSelect.mockReturnValueOnce(makePostEmbedChain([]));
    const result = await getOriginalPostEmbed("post-1");
    expect(result).toBeNull();
  });

  it("returns post data with media when found", async () => {
    const postData = {
      id: "post-1",
      content: "Hello world",
      contentType: "text",
      authorDisplayName: "Ada",
      authorPhotoUrl: null,
    };
    const mediaRows = [
      { mediaUrl: "https://example.com/img.jpg", mediaType: "image", altText: "Photo" },
    ];

    // 1st select: post row; 2nd select: media rows
    mockSelect
      .mockReturnValueOnce(makePostEmbedChain([postData]))
      .mockReturnValueOnce(makeMediaChain(mediaRows));

    const result = await getOriginalPostEmbed("post-1");
    expect(result).toEqual({ ...postData, media: mediaRows });
  });

  it("returns empty media array when post has no attachments", async () => {
    const postData = {
      id: "post-1",
      content: "Text only",
      contentType: "text",
      authorDisplayName: "Ada",
      authorPhotoUrl: null,
    };

    mockSelect
      .mockReturnValueOnce(makePostEmbedChain([postData]))
      .mockReturnValueOnce(makeMediaChain([]));

    const result = await getOriginalPostEmbed("post-1");
    expect(result).toEqual({ ...postData, media: [] });
  });
});
