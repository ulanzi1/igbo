# Story 12.1: CI/CD Pipeline

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer,
I want an automated CI/CD pipeline that lints, type-checks, tests, builds, and deploys the application,
So that code quality is enforced on every change and deployments are safe and repeatable.

## Acceptance Criteria

1. **Given** a pull request is opened or updated, **When** GitHub Actions runs the PR pipeline, **Then** the following checks run in parallel: ESLint + Prettier lint, TypeScript type-check (`tsc --noEmit`), unit tests (Vitest), and build (`next build`), **And** after parallel checks pass, E2E tests (Playwright) run against the build, **And** Lighthouse CI runs with performance budgets (LCP < 2.5s, CLS < 0.1, INP < 200ms), **And** the PR is blocked from merging if any check fails.

2. **Given** code is merged to the `main` branch, **When** the merge pipeline runs, **Then** all PR checks run again, **And** Docker images are built for both Web and Realtime containers, **And** images are pushed to GitHub Container Registry, **And** the staging environment is auto-deployed, **And** production deployment requires a manual approval gate.

3. **Given** a deployment is triggered, **When** the deploy step runs, **Then** the mechanism is SSH + `docker compose pull && docker compose up -d` (launch phase), **And** the deploy is verified by health check endpoint returning `{ status: "healthy" }` with HTTP 200 after rollout, **And** a failed health check triggers automatic rollback to the previous image.

## Tasks / Subtasks

- [x] Task 1: Expand PR CI workflow — lint, type-check, unit tests, build (AC: #1)
  - [x] 1.1 Rename `.github/workflows/test.yml` → `.github/workflows/ci.yml` (or replace contents)
  - [x] 1.2 Add `lint` job: `bunx eslint .` + `bunx prettier --check .` (parallel with others)
  - [x] 1.3 Keep `typecheck` job: `bunx tsc --noEmit` (already exists, extract to named job)
  - [x] 1.4 Keep `test` job: `bunx vitest run` with Redis service (already exists, extract to named job)
  - [x] 1.5 Add `build` job: `bun run build` (requires SKIP*ENV_VALIDATION=true + NEXT_PUBLIC*\* stubs)
  - [x] 1.6 All 4 jobs run in parallel; ensure proper `bun install --frozen-lockfile` caching on each; also cache `.next/cache` with `actions/cache@v4` keyed on `${{ hashFiles('**/package.json') }}` to speed up incremental builds 40–60%
  - [x] 1.7 Add branch protection note: all 4 jobs must be required status checks

- [x] Task 2: Add E2E tests to PR pipeline (AC: #1)
  - [x] 2.1 Add `e2e` job that `needs: [build]` — runs only after build succeeds
  - [x] 2.2 Use `actions/upload-artifact@v4` / `actions/download-artifact@v4` to pass build output to e2e and lighthouse jobs — upload only the necessary subset: `.next/standalone`, `.next/static`, and `public/` (NOT the full `.next` dir which includes source maps and cache, greatly reducing artifact size)
  - [x] 2.3 Install Playwright browsers via `bunx playwright install --with-deps chromium` (Chromium only in CI for speed)
  - [x] 2.4 Download build artifact, then let Playwright manage the server via its `webServer` config (do NOT start `bun run start &` manually — conflicts with Playwright's own server management; see playwright.config.ts update in Task 2 notes)
  - [x] 2.5 Run `bunx playwright test --reporter=html --passWithNoTests` — `--passWithNoTests` is required because `e2e/` currently has only a `.gitkeep` placeholder; add a basic smoke test (`e2e/smoke.spec.ts`) that asserts `/en` loads and returns HTTP 200, so the flag can eventually be removed
  - [x] 2.6 Upload Playwright HTML report as artifact on failure

- [x] Task 3: Add Lighthouse CI to PR pipeline (AC: #1)
  - [x] 3.1 Add `lighthouse` job that `needs: [build]` — runs after build (parallel with e2e)
  - [x] 3.2 Use `treosh/lighthouse-ci-action@v12` or equivalent
  - [x] 3.3 Create `lighthouserc.js` config at project root — use INP (not FID; FID is deprecated in Lighthouse 10+ and silently ignored): assertions: `largest-contentful-paint < 2500`, `cumulative-layout-shift < 0.1`, `experimental-interaction-to-next-paint < 200`
  - [x] 3.4 Download build artifact, start server, scan `/en` landing page + `/en/login`
  - [x] 3.5 Upload Lighthouse reports as artifacts
  - [x] 3.6 Performance budget: `performance >= 0.75`, `accessibility >= 0.90`, `best-practices >= 0.90`, `seo >= 0.85`

- [x] Task 4: Add merge-to-main pipeline — Docker build + GHCR push (AC: #2)
  - [x] 4.1 Create `.github/workflows/deploy.yml` triggered on `push` to `main`
  - [x] 4.2 Reuse quality checks via `workflow_call`: add `on: workflow_call` trigger to `ci.yml` and call it from `deploy.yml` with `uses: ./.github/workflows/ci.yml` — avoids duplicating all 4 job definitions (DRY pattern)
  - [x] 4.3 Add `docker-build` job: build `Dockerfile.web` and `Dockerfile.realtime` images
  - [x] 4.4 Tag images using GitHub Actions context — web: `ghcr.io/${{ github.repository_owner }}/igbo-web:sha-${{ github.sha }}` + `:latest`; realtime: `ghcr.io/${{ github.repository_owner }}/igbo-realtime:sha-${{ github.sha }}` + `:latest`
  - [x] 4.5 Push to GHCR using `docker/login-action` + `docker/build-push-action` (authenticate with `GITHUB_TOKEN` — no extra registry setup)
  - [x] 4.6 Pass `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_REALTIME_URL` as build args from GitHub secrets

- [x] Task 5: Staging auto-deploy job (AC: #2)
  - [x] 5.1 Add `deploy-staging` job that `needs: [docker-build]`
  - [x] 5.2 Before deploying, SSH to capture current running image tags for rollback: `docker inspect --format='{{index .RepoTags 0}}' igbo-web 2>/dev/null || echo ""` and `igbo-realtime` — store as job outputs `prev_web_tag` and `prev_realtime_tag` to pass to `deploy.sh`
  - [x] 5.3 SSH into staging server using `appleboy/ssh-action@v1` (or `webfactory/ssh-agent`)
  - [x] 5.4 Run: `docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d`
  - [x] 5.5 Wait 30s, then health-check by asserting BOTH HTTP 200 AND response body `status: "healthy"`: `curl -sf https://<staging-url>/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d['status']=='healthy' else 1)"` — this catches degraded states (e.g. realtime down) that still return HTTP 200
  - [x] 5.6 If health check fails → invoke `scripts/deploy.sh` rollback with `$prev_web_tag` and `$prev_realtime_tag`
  - [x] 5.7 Staging secrets/env: stored in GitHub environment `staging`

- [x] Task 6: Production deploy with manual approval gate (AC: #2, #3)
  - [x] 6.1 Add `deploy-production` job that `needs: [deploy-staging]`
  - [x] 6.2 Use GitHub environment `production` with required reviewers for manual approval
  - [x] 6.3 Same SSH + docker compose pull/up pattern as staging; capture current image tags before deploying (same pattern as Task 5.2)
  - [x] 6.4 Health check verification: assert HTTP 200 + `status: "healthy"` in response body (same check as Task 5.5) — degraded state (realtime down) is a failed deploy in production
  - [x] 6.5 Automatic rollback on failed health check using captured prev tags
  - [x] 6.6 Production secrets/env: stored in GitHub environment `production`

- [x] Task 7: Rollback mechanism (AC: #3)
  - [x] 7.1 Create `scripts/deploy.sh` — reusable deploy + health-check + rollback script
  - [x] 7.2 Script accepts: compose file path, health URL, timeout, `PREV_WEB_TAG`, `PREV_REALTIME_TAG` (captured before deploy by the CI job — see Tasks 5.2/6.3)
  - [x] 7.3 Logic: pull → up -d → wait → health check loop (5 attempts, 10s apart, assert `status: "healthy"`) → success or rollback
  - [x] 7.4 Rollback: re-tag previous images, `docker compose pull && docker compose up -d` with previous tags
  - [x] 7.5 Script exits with non-zero on rollback (pipeline shows failure)

- [x] Task 8: Tests for CI configuration (AC: #1, #2, #3)
  - [x] 8.1 Add `lighthouserc.js` validation test (config file is valid JSON/JS and uses INP not FID assertions)
  - [x] 8.2 Validate `deploy.sh` script with shellcheck (if available) or basic syntax check (`bash -n scripts/deploy.sh`)
  - [x] 8.3 Ensure Playwright config works in CI mode (`CI=true` env var); verify `playwright.config.ts` `webServer.command` resolves to `bun run start` in CI
  - [x] 8.4 Verify `/api/health` returns `{ status: "healthy" | "degraded", db, redis, realtime }` format and HTTP 200/503 semantics (already tested; confirm tests cover the `status` field value, not just HTTP code)

## Dev Notes

### Current State Analysis

**Existing `.github/workflows/test.yml`:**

- Triggers on push + pull_request (all branches)
- Single `test` job: checkout → bun setup → bun cache → bun install → tsc → vitest
- Redis service container for integration tests
- Uses `SKIP_ENV_VALIDATION=true` to bypass T3 env checks
- Missing: lint, build, E2E, Lighthouse, Docker builds, deployments

**Existing Dockerfiles (already production-ready):**

- `Dockerfile.web`: 3-stage (deps → builder → runner), node:22-alpine, standalone output, healthcheck on `:3000/api/v1/health`
- `Dockerfile.realtime`: 2-stage (builder → runner), esbuild bundle, healthcheck on `:3001/health`
- Both use non-root users and minimal images
- NOTE: Dockerfiles use `npm install` internally (not bun) — this is intentional; CI uses bun but Docker builds use npm

**Existing `docker-compose.prod.yml`:**

- Web + Realtime containers with all env vars from `.env`
- ClamAV commented out (optional)
- Internal `app-network` bridge
- Missing: backup sidecar (Story 12.4), resource limits

**Existing Playwright config (`playwright.config.ts`):**

- 3 browsers (chromium, firefox, webkit) — CI should use chromium only
- HTML reporter
- `webServer.command: "npm run dev"` — **MUST BE UPDATED**: in CI (`reuseExistingServer: false`), Playwright starts a new server using this command; must use `bun run start` in CI mode or Playwright will launch a dev server instead of the production build
- `reuseExistingServer: !process.env.CI` — works correctly in CI (spawns fresh server)
- `e2e/` directory contains only `.gitkeep` — no tests yet; use `--passWithNoTests` until smoke test is added

**Package manager:** bun (CI uses `oven-sh/setup-bun@v2` with bun.lock)

**Health endpoint behavior:**

- `/api/health` — returns `{ status: "healthy"|"degraded", db, redis, realtime, uptime }` with HTTP 200 when DB+Redis are up (even if realtime is degraded), HTTP 503 when DB or Redis is down
- `/api/v1/health` — Docker HEALTHCHECK endpoint (wrapped with `withApiHandler`) — do NOT use for deploy verification (uses different response envelope)
- Deploy verification must check BOTH HTTP 200 AND `status === "healthy"` in body — a "degraded" response (HTTP 200) means realtime is broken and should fail the deploy

### Architecture Compliance

- **Two-container architecture**: Web (Next.js :3000) + Realtime (Socket.IO :3001) — both Dockerfiles exist
- **Deploy mechanism**: SSH + `docker compose pull && docker compose up -d` per architecture spec
- **GHCR**: Use `docker/login-action` with `GITHUB_TOKEN` (no extra registry setup needed)
- **Environment strategy**: `development` (local), `staging` (auto-deploy), `production` (manual gate) per architecture
- **Standalone output**: `next.config.ts` already has `output: "standalone"` — critical for Docker; only `.next/standalone` + `.next/static` + `public/` are needed at runtime
- **T3 Env**: `SKIP_ENV_VALIDATION=1` at build time, server vars injected at runtime — already in Dockerfile.web

### Key Technical Decisions

1. **Bun in CI, not npm**: Project uses bun (see test.yml). All CI commands use `bun`/`bunx`. Lock file is `bun.lock`.
2. **Chromium-only E2E in CI**: Full 3-browser matrix is too slow for PR checks. Run chromium only. Full matrix can be nightly.
3. **Build artifact sharing**: Upload only `.next/standalone`, `.next/static`, `public/` — not the full `.next` dir. Use `actions/upload-artifact@v4` / `actions/download-artifact@v4`.
4. **Lighthouse on key pages**: Scan `/en` (landing, ISR) and `/en/login` (auth page). These are representative SSR pages.
5. **Deploy script**: Single reusable bash script (`scripts/deploy.sh`) used by both staging and production jobs.
6. **GitHub Environments**: `staging` (no approval) and `production` (required reviewers) for deployment protection.
7. **Image tagging**: `ghcr.io/${{ github.repository_owner }}/igbo-web:sha-<7-char>` + `:latest`; same pattern for `igbo-realtime`. Rollback uses previous SHA tag captured before deploy.
8. **Health check assertion**: Deploy verification checks `status: "healthy"` in response body (not just HTTP 200), since `/api/health` returns HTTP 200 for both "healthy" and "degraded" states.
9. **INP not FID in Lighthouse**: FID is deprecated in Lighthouse 10+. `lighthouserc.js` uses `experimental-interaction-to-next-paint < 200` (INP).
10. **`workflow_call` for DRY deploy pipeline**: `ci.yml` declares `on: workflow_call`; `deploy.yml` calls it instead of duplicating the 4 parallel check jobs.

### Critical Guardrails

- **NEVER commit secrets** — all sensitive values in GitHub secrets/environments
- **SKIP_ENV_VALIDATION=true** must be set during `next build` in CI (no DB/Redis available)
- **NEXT*PUBLIC*\* stubs** needed at build time — use empty strings or placeholder values
- **bun.lock not package-lock.json** — always use `bun install --frozen-lockfile`
- **Standalone output** — upload only `.next/standalone` + `.next/static` + `public/` as CI artifact
- **Redis service** — required for Vitest (integration tests hit Redis). Already configured in test.yml.
- **Node 22** — Dockerfiles use `node:22-alpine`; add `node-version: '22'` to any `actions/setup-node` steps in CI to match
- **Webhook secret for deploy** — SSH key stored in GitHub secrets for deploy jobs
- **playwright.config.ts webServer.command** — must be updated to `process.env.CI ? "bun run start" : "npm run dev"` or E2E job starts a dev server instead of the production build
- **Rollback requires pre-deploy image capture** — SSH to server before deploying to record current image tags; pass as args to `deploy.sh`

### File Structure

Files to create/modify:

```
.github/workflows/ci.yml          # NEW — replaces test.yml (PR checks); add `on: workflow_call`
.github/workflows/deploy.yml      # NEW — merge-to-main pipeline
lighthouserc.js                    # NEW — Lighthouse CI config (INP assertions)
scripts/deploy.sh                  # NEW — deploy + health check + rollback
e2e/smoke.spec.ts                  # NEW — basic smoke test (GET /en returns 200)
playwright.config.ts               # MODIFY — webServer.command: process.env.CI ? "bun run start" : "npm run dev"
```

Files that already exist (reference only, no changes):

```
.github/workflows/test.yml        # DELETE (replaced by ci.yml)
Dockerfile.web                     # NO CHANGES needed
Dockerfile.realtime                # NO CHANGES needed
docker-compose.prod.yml            # NO CHANGES needed (Story 12.2 adds resource limits)
vitest.config.ts                   # NO CHANGES needed
next.config.ts                     # NO CHANGES needed
```

### Testing Requirements

- **lighthouserc.js** must be a valid config (import and validate structure in a test; confirm INP assertion key present)
- **deploy.sh** must be executable and pass basic syntax validation (`bash -n scripts/deploy.sh`)
- **Health endpoint** already tested (`src/app/api/health/route.test.ts`, `src/app/api/v1/health/route.test.ts`); confirm existing tests assert `status` field value
- **CI workflow** validated by running it — no unit tests for YAML, but ensure all referenced scripts/commands exist
- **Playwright in CI**: `CI=true` triggers `forbidOnly`, retries=2, workers=1; `webServer.command` resolves to `bun run start`; `--passWithNoTests` until `e2e/smoke.spec.ts` is in place

### Previous Story Intelligence

Epic 11 stabilization was the last completed work. Key learnings:

- All 4243 tests passing with 0 pre-existing failures — clean baseline
- Bun is the package manager (bun.lock, oven-sh/setup-bun)
- Health endpoints exist at `/api/health` (unwrapped, deploy verification target) and `/api/v1/health` (wrapped with withApiHandler, Docker HEALTHCHECK target)
- Docker builds use `npm` internally (Dockerfiles have `npm install`), but CI uses `bun`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 12, Story 12.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#CI/CD Pipeline]
- [Source: _bmad-output/planning-artifacts/architecture.md#Container Strategy]
- [Source: _bmad-output/planning-artifacts/architecture.md#Environment Configuration]
- [Source: _bmad-output/project-context.md#Development Workflow Rules]
- [Source: .github/workflows/test.yml — current CI baseline]
- [Source: Dockerfile.web — existing production Dockerfile]
- [Source: Dockerfile.realtime — existing production Dockerfile]
- [Source: docker-compose.prod.yml — existing production compose]
- [Source: playwright.config.ts — existing E2E config (requires update)]
- [Source: next.config.ts — standalone output + security headers]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- **webServer.command deviation**: Story spec says `bun run start` but `next start` requires the full `.next/` build directory, not just the standalone subset. Used `node .next/standalone/server.js` instead — this is the correct production approach for Next.js standalone output, and works with the `.next/standalone` + `.next/static` + `public/` artifact subset. The E2E and Lighthouse jobs copy static files into the standalone dir before starting the server.
- **ci.yml trigger**: Using `pull_request + workflow_call` (not `push + pull_request`) to avoid duplicate runs when deploy.yml calls ci.yml on main merges.

### Completion Notes List

- ✅ **Task 1**: Created `.github/workflows/ci.yml` with 4 parallel jobs (lint/typecheck/test/build). Deleted `test.yml`. Each job has bun cache; build job adds `.next/cache` for incremental speed-up. Build job uploads standalone artifact subset.
- ✅ **Task 2**: Added `e2e` job needing `[build]`. Downloads artifact, sets up standalone server assets, runs `bunx playwright test --reporter=html --passWithNoTests`. Created `e2e/smoke.spec.ts` basic smoke test. Updated `playwright.config.ts` webServer.command to use `node .next/standalone/server.js` in CI mode.
- ✅ **Task 3**: Added `lighthouse` job needing `[build]`, parallel with e2e. Downloads artifact, starts standalone server, waits for readiness, runs treosh/lighthouse-ci-action@v12. Created `lighthouserc.js` with INP/LCP/CLS assertions + performance budgets.
- ✅ **Task 4**: Created `.github/workflows/deploy.yml` on push to main. Uses `uses: ./.github/workflows/ci.yml` (workflow*call DRY pattern). Docker builds both Dockerfile.web + Dockerfile.realtime, pushed to GHCR with SHA + :latest tags. NEXT_PUBLIC*\* passed as build args.
- ✅ **Task 5**: `deploy-staging` job using `webfactory/ssh-agent`. Captures previous image tags as GitHub step outputs before deploying. SCPs deploy.sh to server and runs it.
- ✅ **Task 6**: `deploy-production` job needing `[deploy-staging]`, using GitHub environment `production` (manual approval gate). Same SSH + capture + deploy pattern as staging.
- ✅ **Task 7**: Created `scripts/deploy.sh` — `set -euo pipefail`, 5 health check attempts @ 10s intervals, asserts `status=="healthy"`, rollback via retag + docker compose up, exits 1 on failure.
- ✅ **Task 8**: Created `ci-infra.test.ts` (root-level, 19 tests): 7 lighthouserc.js tests (valid module, INP not FID, LCP/CLS/INP thresholds, scan targets), 4 deploy.sh tests (exists, bash -n, executable, set -euo pipefail, healthy check), 5 playwright.config.ts tests. Health endpoint tests confirmed: `src/app/api/health/route.test.ts` already asserts `body.status` = "healthy"/"degraded".
- ✅ **Test results**: 4323 passing + 10 skipped (baseline 4243 + 10) — +80 total, 19 new ci-infra tests, 0 regressions.

### File List

- `.github/workflows/ci.yml` — NEW: PR pipeline (lint, typecheck, test, build, e2e, lighthouse) + workflow_call trigger
- `.github/workflows/deploy.yml` — NEW: main branch pipeline (ci reuse, docker-build, deploy-staging, deploy-production)
- `.github/workflows/test.yml` — DELETED: replaced by ci.yml
- `lighthouserc.js` — NEW: Lighthouse CI config with INP/LCP/CLS assertions and performance budgets
- `scripts/deploy.sh` — NEW: reusable deploy + health check + rollback bash script
- `e2e/smoke.spec.ts` — NEW: basic smoke test asserting /en returns HTTP 200
- `playwright.config.ts` — MODIFIED: webServer.command updated for CI standalone server
- `ci-infra.test.ts` — NEW: 22 vitest tests for CI infrastructure files (19 original + 3 review fixes)
- `docker-compose.prod.yml` — MODIFIED: added `image:` fields with env var defaults for GHCR deploy support

## Senior Developer Review (AI)

### Review Date: 2026-03-24

### Reviewer: Adversarial Code Review (claude-opus-4-6)

### Findings (7 total: 1 Critical, 3 High, 3 Medium — all fixed)

**F1 (CRITICAL) — FIXED: `docker-compose.prod.yml` uses `build:` only — deploy pipeline broken**

- `docker compose pull` is a no-op when services define `build:` without `image:`. The GHCR images pushed by CI were never consumed by deploys.
- Fix: Added `image: ${WEB_IMAGE:-igbo-web:local}` and `image: ${REALTIME_IMAGE:-igbo-realtime:local}` to compose file. Rewrote `deploy.sh` to accept new image refs as args 3-4, export as `WEB_IMAGE`/`REALTIME_IMAGE` for compose resolution. Updated `deploy.yml` to pass GHCR image refs.

**F2 (HIGH) — FIXED: Lighthouse assertions used `warn` — wouldn't block PRs**

- AC #1 requires PR blocking on failure, but LHCI `warn` level exits 0. Changed all assertions to `error` in `lighthouserc.js`.

**F3 (HIGH) — FIXED: Lighthouse server wait loop exits 0 on timeout**

- `for` loop in `ci.yml` exited successfully even if server never started. Added post-loop `curl` check with `exit 1` on failure.

**F4 (HIGH) — FIXED: PORT not set in Playwright webServer CI command**

- Lighthouse job set `PORT=3000` but Playwright didn't — inconsistent. Updated `playwright.config.ts` to `PORT=3000 node .next/standalone/server.js`.

**F5 (MEDIUM) — FIXED: `deploy.yml` had no concurrency control**

- Two rapid merges could trigger simultaneous deploys. Added `concurrency: { group: deploy-production, cancel-in-progress: false }`.

**F6 (MEDIUM) — FIXED: `--passWithNoTests` still present**

- `e2e/smoke.spec.ts` exists — flag is unnecessary and masks zero-test risk. Removed from `ci.yml`.

**F7 (MEDIUM) — FIXED: Rollback didn't verify health after restore**

- `deploy.sh` now runs `check_health` after rollback (3 attempts) and logs whether rollback was successful or also failed.

### New Tests Added (3)

- `ci-infra.test.ts`: "exports WEB_IMAGE and REALTIME_IMAGE for docker compose" (F1)
- `ci-infra.test.ts`: "verifies health after rollback" — asserts check_health called >= 2 times (F7)
- `ci-infra.test.ts`: "uses error level (not warn) for CWV assertions to block PRs on failure" (F2)

### Test Results Post-Review

- 4326/4326 passing + 10 skipped (baseline 4243 + 10) — +3 review fix tests, 0 regressions

## Change Log

- 2026-03-24: Story 12.1 implemented — CI/CD pipeline created. 8 tasks complete. +19 ci-infra tests. 4323/4323 passing.
- 2026-03-24: Code review — 7 findings (1C/3H/3M) all fixed. +3 review tests. docker-compose.prod.yml + deploy.sh + deploy.yml + lighthouserc.js + ci.yml + playwright.config.ts updated. 4326/4326 passing.
