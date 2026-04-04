---
title: Migration Runbook
description: Step-by-step procedure for creating, applying, and verifying database migrations in the igbo monorepo
author: Charlie (Senior Dev)
date: 2026-04-04
---

# Migration Runbook

This runbook covers the complete lifecycle of a database migration in the igbo monorepo — from writing SQL to verifying it applies correctly.

## Prerequisites

- `@igbo/db` package at `packages/db/`
- PostgreSQL running locally (or `DATABASE_URL` set)
- pnpm installed

## Step 1: Write the SQL File

Create a new file in `packages/db/src/migrations/` using timestamp format:

```bash
# Generate a timestamp prefix
date -u +"%Y%m%d%H%M%S"
# Example output: 20260404120000
```

Name the file: `<timestamp>_<description>.sql`

```bash
touch packages/db/src/migrations/20260404120000_add_job_listings.sql
```

Write your SQL:

```sql
-- Add job_listings table for portal job board
CREATE TABLE IF NOT EXISTS portal_job_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  location VARCHAR(200),
  salary_range VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_listings_employer ON portal_job_listings(employer_id);
CREATE INDEX idx_job_listings_status ON portal_job_listings(status);
```

### SQL Conventions

- Use `IF NOT EXISTS` / `IF EXISTS` for safety
- Include `ON DELETE CASCADE` on foreign keys to `auth_users`
- Add indexes for columns used in WHERE clauses and JOINs
- Use `TIMESTAMPTZ` (not `TIMESTAMP`) for all date columns
- Default `now()` for `created_at` / `updated_at`
- Use `gen_random_uuid()` for UUID primary keys (PostgreSQL built-in)

### Why Not `drizzle-kit generate`?

The Drizzle schema files import `server-only`, which causes drizzle-kit to fail at code generation time. Hand-written SQL is the standard approach. Write the schema TypeScript file separately (Step 4).

## Step 2: Sync the Journal

Run the journal sync script to auto-generate the `_journal.json` entry:

```bash
pnpm --filter @igbo/db db:journal-sync
```

This script:

1. Scans `src/migrations/` for all `.sql` files
2. Sorts numbered migrations (`0000_*`) first, then timestamp migrations chronologically
3. Rebuilds `src/migrations/meta/_journal.json` with correct `idx`, `when`, and `tag` fields
4. Reports any unrecognized filename formats as errors

### Verify the Journal Entry

```bash
# Check the last entry was added
tail -10 packages/db/src/migrations/meta/_journal.json
```

You should see your new migration with the correct tag (filename without `.sql`).

### CI Check Mode

CI runs `pnpm --filter @igbo/db db:journal-check` — this verifies the journal matches the SQL files without modifying anything. If you forget to sync, CI fails.

## Step 3: Apply the Migration

```bash
# Apply pending migrations to local database
pnpm --filter @igbo/db db:migrate
```

`drizzle-kit migrate` reads `_journal.json` to determine which migrations are pending. It compares journal entries against the `drizzle.__drizzle_migrations` table in your database. This is why syncing the journal (Step 2) is required before applying.

If the migration fails:

1. Fix the SQL syntax error
2. If the migration partially applied, check what succeeded:
   ```bash
   psql $DATABASE_URL -c "SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 5;"
   ```
3. Manually reverse any partially-applied statements (DROP tables/indexes that were created)
4. Re-run `pnpm --filter @igbo/db db:migrate`

## Step 4: Update the Drizzle Schema

Create or update the TypeScript schema file in `packages/db/src/schema/`:

```typescript
// packages/db/src/schema/portal-job-listings.ts
import "server-only";

import { pgTable, uuid, varchar, text, timestamptz, index } from "drizzle-orm/pg-core";
import { authUsers } from "./auth-users";

export const portalJobListings = pgTable(
  "portal_job_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employerId: uuid("employer_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    location: varchar("location", { length: 200 }),
    salaryRange: varchar("salary_range", { length: 100 }),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_job_listings_employer").on(table.employerId),
    index("idx_job_listings_status").on(table.status),
  ],
);
```

Register the schema in `packages/db/src/index.ts`:

```typescript
import * as portalJobListingsSchema from "./schema/portal-job-listings";
// Add to the schema spread in the drizzle() call
```

## Step 5: Verify

Run the package tests to confirm nothing broke:

```bash
pnpm --filter @igbo/db test
```

Then run the full app test suite:

```bash
pnpm --filter community test
pnpm --filter portal test
```

## Step 6: Rollback Test

Before merging, verify the migration can be rolled back if needed.

### Manual Rollback

Write a corresponding rollback SQL (not committed — just for local verification):

```sql
-- Rollback: 20260404120000_add_job_listings.sql
DROP INDEX IF EXISTS idx_job_listings_status;
DROP INDEX IF EXISTS idx_job_listings_employer;
DROP TABLE IF EXISTS portal_job_listings;
```

Apply it locally, then re-run the forward migration to confirm idempotency:

```bash
psql $DATABASE_URL -f /tmp/rollback.sql
pnpm --filter @igbo/db db:migrate
```

## Quick Reference Checklist

- [ ] SQL file created with timestamp prefix in `packages/db/src/migrations/`
- [ ] `pnpm --filter @igbo/db db:journal-sync` run successfully
- [ ] Journal entry verified in `_journal.json`
- [ ] Migration applied locally: `pnpm --filter @igbo/db db:migrate`
- [ ] Drizzle schema TypeScript file created/updated
- [ ] Schema registered in `packages/db/src/index.ts`
- [ ] `@igbo/db` tests pass
- [ ] App tests pass (community + portal)
- [ ] Rollback tested locally
