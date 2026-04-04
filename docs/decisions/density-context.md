---
title: DensityContext Definition
description: UI density system for portal — three levels with role-based defaults
author: Winston (Architect)
date: 2026-04-04
---

# DensityContext

DensityContext controls how tightly UI elements are packed in the portal. It provides three density levels with role-based defaults, allowing users to override via portal settings (persisted in `localStorage` under key `portal-density`).

## Density Levels

| Level           | Row Height | Padding | Use Case                                                                    |
| --------------- | ---------- | ------- | --------------------------------------------------------------------------- |
| **Comfortable** | 48px       | 16px    | Default for Job Seekers — browsing-focused, generous whitespace             |
| **Compact**     | 40px       | 12px    | Default for Employers — balanced for scanning job applications              |
| **Dense**       | 32px       | 8px     | Default for Job Admins — data-heavy dashboards, maximum information density |

## Role Defaults

| Portal Role  | Default Density |
| ------------ | --------------- |
| `JOB_SEEKER` | Comfortable     |
| `EMPLOYER`   | Compact         |
| `JOB_ADMIN`  | Dense           |

## React API

Create `apps/portal/src/providers/density-context.tsx` as a Client Component (`"use client"`). Export:

- **`DensityLevel`** type — `"comfortable" | "compact" | "dense"`
- **`DensityProvider`** — accepts `defaultDensity` prop; initializes from `localStorage` with SSR guard (`typeof window === "undefined"` fallback prevents hydration mismatch); exposes `density` and `setDensity` via React context
- **`useDensity()`** hook — reads current density; throws if used outside provider

## How UI Consumes It

Components call `useDensity()` and map the level to Tailwind classes:

```typescript
"use client";

const DENSITY_STYLES = {
  comfortable: "py-4 px-4 text-base",
  compact: "py-3 px-3 text-sm",
  dense: "py-2 px-2 text-sm",
} as const;
```

## Layout Wiring

Wrap the portal layout (`apps/portal/src/app/[locale]/layout.tsx`) with `DensityProvider`, initialized from `session.user.activePortalRole`:

```typescript
const ROLE_DENSITY_DEFAULTS: Record<string, DensityLevel> = {
  JOB_SEEKER: "comfortable",
  EMPLOYER: "compact",
  JOB_ADMIN: "dense",
};

const defaultDensity = ROLE_DENSITY_DEFAULTS[session.user.activePortalRole] ?? "comfortable";
```
