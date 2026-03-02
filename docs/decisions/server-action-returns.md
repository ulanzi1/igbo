# Decision: Server Action Return Type Convention

**Date:** 2026-03-02
**Status:** Accepted
**Context:** Epic 4 Retrospective AI-2

---

## Problem

Epic 4 introduced two asymmetric server action return shapes that caused confusion and
inconsistent error-detection logic in the UI layer:

- `createPostAction` returns `{ success: true, postId }` on success, errors are detected
  via `!result.success`.
- `reactToPostAction` and `toggleBookmarkAction` return `{ data }` directly on success,
  errors are detected via `"errorCode" in result`.

Without a documented convention, each new action risks introducing a third pattern.

---

## Decision

Two canonical return shapes are supported. Choose based on the action's mutation type:

### Shape A — Mutation with confirmation (`{ success: true, ...data }`)

Use when the caller needs a boolean gate before accessing data, or when the action has
no meaningful return payload.

```typescript
// ✅ Shape A
type ActionResultA<T = Record<string, never>> =
  | ({ success: true } & T)
  | { success: false; errorCode: string; message?: string };

// Example:
async function createPostAction(
  input: CreatePostInput,
): Promise<ActionResultA<{ postId: string }>> {
  // ...
  return { success: true, postId: post.id };
}

// Caller:
const result = await createPostAction(input);
if (!result.success) {
  showError(result.errorCode);
  return;
}
console.log(result.postId); // ✅ type-safe
```

### Shape B — Optimistic-update compatible (`{ ...data }` vs `{ errorCode }`)

Use when the action is paired with an optimistic UI update that must distinguish
"success payload" from "error payload" without a `success` boolean. Keeps the happy
path flat, which works well with `useOptimistic` and rollback patterns.

```typescript
// ✅ Shape B
type ActionResultB<T> = T | { errorCode: string; message?: string };

// Example:
async function reactToPostAction(
  input: ReactInput,
): Promise<ActionResultB<{ reactionType: string | null }>> {
  // ...
  return { reactionType: "like" };
}

// Caller (error detection via type narrowing):
const result = await reactToPostAction(input);
if ("errorCode" in result) {
  rollbackOptimisticUpdate();
  return;
}
applyResult(result.reactionType); // ✅ type-safe
```

---

## When to Use Each Shape

| Criterion                                         | Shape A (`success: boolean`) | Shape B (`errorCode` guard) |
| ------------------------------------------------- | ---------------------------- | --------------------------- |
| Action drives an optimistic UI update             | No                           | **Yes**                     |
| Action has no meaningful return data              | **Yes**                      | No                          |
| Caller needs to gate on boolean before using data | **Yes**                      | No                          |
| Multiple callers with different handling needs    | **Yes** (explicit gate)      | No                          |

---

## Rules

1. **Never mix shapes in the same action** — pick one and be consistent.
2. **Error payload always includes `errorCode`** — a string constant like `"RATE_LIMITED"`,
   `"UNAUTHORIZED"`, `"NOT_FOUND"`. Include an optional human-readable `message`.
3. **Shape B error detection uses `"errorCode" in result`** — NOT `result.errorCode !== undefined`
   (TypeScript discriminated union narrowing requires the `in` guard).
4. **All new Epic 5 server actions must reference this document** in their story spec's
   "Technical Notes" section.

---

## Existing Actions

| Action                    | Shape | Notes                                         |
| ------------------------- | ----- | --------------------------------------------- |
| `createPostAction`        | A     | Returns `{ success: true, postId }`           |
| `reactToPostAction`       | B     | Returns `{ reactionType }` or `{ errorCode }` |
| `toggleBookmarkAction`    | B     | Returns `{ bookmarked }` or `{ errorCode }`   |
| `createGroupConversation` | A     | Returns `{ success: true, conversationId }`   |
| `searchMembers`           | A     | Returns `{ success: true, members }`          |
