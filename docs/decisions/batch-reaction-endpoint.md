# Decision: Batch Reaction Endpoint

**Date:** 2026-03-02
**Status:** Accepted — Build in Epic 5
**Context:** Epic 4 Retrospective AI-6

---

## Problem

Story 4.3 added viewer reaction state to each feed post. The current implementation fires
one `GET /api/v1/posts/[postId]/reactions/me` request per post when a feed page loads.
With a default page size of 20 posts, this produces 20 parallel HTTP requests per page
load — a known N+1 problem at the API boundary.

At MVP scale (< 500 members, sparse reactions) this is acceptable. However, the same
pattern will compound in Epic 5 where group feeds may contain denser activity, and in
Epic 9 where notification counts are needed per-feed-item.

---

## Decision

**Build the batch endpoint.** The implementation is analogous to the batch follow-status
endpoint (`GET /api/v1/members/follow-status?userIds=...`) that was proven effective in
Epic 3 (AI-5).

---

## API Specification

### Request

```
GET /api/v1/posts/reactions/me?postIds=<id1>,<id2>,...
Authorization: session cookie (requireAuthenticatedSession)
```

- `postIds`: comma-separated list of post UUIDs, max 50 per request.
- Returns viewer's own reaction type for each post (or `null` if none).

### Response

```json
{
  "reactions": {
    "post-uuid-1": "like",
    "post-uuid-2": null,
    "post-uuid-3": "heart"
  }
}
```

### Query Design

Single query against `community_post_reactions`:

```sql
SELECT post_id, reaction_type
FROM community_post_reactions
WHERE user_id = :viewerId
  AND post_id = ANY(:postIds)
```

Returns at most one row per `post_id` (composite PK on `(post_id, user_id)`).
Missing post IDs default to `null` reaction in the response object.

---

## Client Integration

Replace per-post `useViewerReaction(postId)` queries with a single batch hook:

```typescript
// src/features/feed/hooks/use-viewer-reactions.ts
function useViewerReactions(postIds: string[]): Record<string, string | null> {
  const { data } = useQuery({
    queryKey: ["viewer-reactions", postIds],
    queryFn: () => fetchViewerReactions(postIds),
    enabled: postIds.length > 0,
    staleTime: 30_000,
  });
  return data?.reactions ?? {};
}
```

`FeedList` collects all `postId`s from the current page and passes the map down to each
`ReactionBar` — one network request per page load instead of 20.

---

## Implementation Scope (Epic 5)

| Task                                                        | Owner  |
| ----------------------------------------------------------- | ------ |
| `GET /api/v1/posts/reactions/me` route + service method     | Amelia |
| `useViewerReactions` hook                                   | Amelia |
| Refactor `ReactionBar` to accept `initialReactionType` prop | Amelia |
| Refactor `FeedList` to batch-fetch and distribute           | Amelia |
| Tests: route, service, hook, FeedList integration           | Amelia |

---

## Trade-offs

| Factor                     | Individual requests | Batch endpoint                |
| -------------------------- | ------------------- | ----------------------------- |
| Network requests per page  | 20                  | 1                             |
| Server DB queries per page | 20                  | 1                             |
| Cache granularity          | Per-post (fine)     | Per-page batch (coarser)      |
| Implementation complexity  | Low (already done)  | Medium                        |
| Client invalidation        | Per-post mutation   | Invalidate batch key on react |

Cache invalidation: after `reactToPostAction` succeeds, invalidate the batch query key
`["viewer-reactions", pagePostIds]`. Since React Query matches by key prefix, this is
straightforward with `queryClient.invalidateQueries({ queryKey: ["viewer-reactions"] })`.
