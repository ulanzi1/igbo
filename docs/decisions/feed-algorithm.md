# Decision Record: Feed Algorithm Scope for Story 4.1

**Date:** 2026-03-01
**Status:** Decided
**Deciders:** Alice (PO), Winston (Architect)
**Relevant story:** Story 4.1 — News Feed & Post Display

---

## Context

The Epic 3 retrospective flagged "algorithmic feed" as ambiguous before Story 4.1 was drafted. Without a clear definition, the story could be interpreted anywhere from a simple `ORDER BY created_at DESC` to an ML-based ranking system, leading to mid-story scope explosions.

This record captures the exact algorithm so Story 4.1 ACs are unambiguous.

---

## Decision

Story 4.1 implements **two feed modes** selectable via a sort toggle:

### Mode 1 — Chronological (default)

Posts from the member's followed users, groups, and admin announcements ordered by `created_at DESC`. No scoring.

- Simple: `ORDER BY created_at DESC`
- Personalization scope: followed members + joined groups + platform announcements
- Cold-start (zero follows, zero groups): falls back to engagement-ranked platform-wide posts from the last 7 days + admin announcements + a "Follow members" prompt

### Mode 2 — Algorithmic

Two-factor engagement score:

```
score = (recency_decay × 0.6) + (engagement_normalized × 0.4)
```

Where:

- `recency_decay` = exponential decay from `1.0` (just posted) toward `0.0` over 7 days, half-life 12 hours
- `engagement_normalized` = `(likes + 2×comments + 3×shares) / max_engagement_in_window`, capped at `1.0`
- Weights (`0.6`, `0.4`) are constants in `src/config/feed.ts` — adjustable without code changes

**Cold-start (< 50 total platform posts):** rank by recency only (chronological). Engagement scoring activates once the platform exceeds 50 total posts.

**Member cold-start (zero follows + zero groups):** same fallback as chronological mode.

### Scope boundary

This story does NOT implement:

- Social graph signals (connection strength, interaction recency with author) — Phase 2, when > 1,000 active members
- Group relevance weighting — Phase 2

---

## Why this scope

The platform is pre-launch with < 500 active members anticipated at launch. Complex social signals produce statistical noise at this scale. The two-factor model delivers meaningful personalization at the actual launch scale without over-engineering.

The interface is designed to accommodate additional factors in Phase 2 without structural changes (`src/config/feed.ts` weights, configurable score function).

---

## Acceptance Criteria Requirement

Story 4.1 ACs must explicitly state:

> **Given** algorithmic sorting is selected
> **Then** posts are ranked by `score = (recency_decay × 0.6) + (engagement_normalized × 0.4)` where `recency_decay` uses 12-hour half-life exponential decay and `engagement_normalized` uses `(likes + 2×comments + 3×shares) / max_engagement_in_window` capped at 1.0; constants defined in `src/config/feed.ts`

No room for interpretation. The weights and formula are fixed for Story 4.1.
