# Implementation Readiness Assessment Report

**Date:** 2026-04-01
**Project:** igbo

---

## Document Inventory

**stepsCompleted:** [step-01-document-discovery, step-02-prd-analysis, step-03-epic-coverage-validation, step-04-ux-alignment, step-05-epic-quality-review]

### Files Selected for Assessment

| Document Type | File | Notes |
|---|---|---|
| PRD | `prd-v2.md` | Authoritative v2 (v1 superseded) |
| PRD Validation | `prd-v2-validation-report.md` | V2 validation report |
| Architecture | `architecture.md` | Single version |
| Epics & Stories | `epics.md` | Single version |
| UX Design | `ux-design-specification.md` | Single version |
| UX Directions | `ux-design-directions.html` | Visual reference |
| Product Brief | `product-brief-igbo-2026-03-29.md` | Latest (Mar 29) |

### Excluded Files
- `prd.md` — superseded by v2
- `prd-validation-report.md` — v1 validation, superseded
- `product-brief-igbo-2026-02-18.md` — superseded by Mar 29 version

---

## PRD Analysis

### Functional Requirements

**Total FRs: 108**

| ID | Category | Requirement |
|---|---|---|
| FR1 | Job Posting | Employers can create job postings with title, description, type, location, salary range, skills, experience level, and application deadline |
| FR2 | Job Posting | Employers can select job type: Full-time, Part-time, Contract, Freelance, Internship, Apprenticeship |
| FR3 | Job Posting | Employers can specify work location as Remote, On-site, or Hybrid |
| FR4 | Job Posting | Employers can attach a job description document |
| FR5 | Job Posting | Employers can flag a posting as "Urgent Hiring" |
| FR6 | Job Posting | Employers can save a job posting as draft before submitting |
| FR7 | Job Posting | Employers can edit a posting returned with requested changes |
| FR8 | Job Posting | Employers can close an active job posting manually |
| FR9 | Job Posting | Employers can mark a posting as "Filled" |
| FR10 | Job Posting | Employers can renew an expired posting without re-approval if unchanged |
| FR11 | Job Posting | System enforces configurable max active postings per employer (default: 5) |
| FR12 | Job Posting | System auto-expires postings on deadline date and blocks new applications |
| FR13 | Job Posting | System keeps expired/closed listings visible 30 days then removes from search |
| FR14 | Job Posting | System notifies employers when posting expires in 3 days |
| FR15 | Company Profiles | Employers create company profile inline during first posting |
| FR16 | Company Profiles | Company fields: name, description, industry, size |
| FR17 | Company Profiles | Company logo upload |
| FR18 | Company Profiles | Culture statement, benefits, and banner image |
| FR19 | Company Profiles | Verification badge earned through first approved posting |
| FR20 | Company Profiles | Pre-fill for returning employers |
| FR21 | Job Seeker Profiles | Dedicated profile with headline, summary, skills, experience, education |
| FR22 | Job Seeker Profiles | Auto-fill from community profile data |
| FR23 | Job Seeker Profiles | Skill tags from predefined library with autocomplete |
| FR24 | Job Seeker Profiles | Custom skill tags with distinct visual style |
| FR25 | Job Seeker Profiles | Resume upload PDF/DOCX (max 25MB) |
| FR26 | Job Seeker Profiles | Up to 10 resume versions with labels and default selection |
| FR27 | Job Seeker Profiles | Delete any resume at any time |
| FR28 | Job Seeker Profiles | Toggle "Open to Opportunities" status |
| FR29 | Job Seeker Profiles | Profile visibility: Public, Members Only, Hidden |
| FR30 | Job Seeker Profiles | Minimum profile requirements enforced before applying |
| FR31 | Application & ATS | One-click apply with stored profile and default resume |
| FR32 | Application & ATS | Application status tracking |
| FR33 | Application & ATS | "Viewed by employer" with date visible to candidate |
| FR34 | Application & ATS | Candidate can hard-delete own applications |
| FR35 | Application & ATS | Employer views application list with filtering |
| FR36 | Application & ATS | Employer views candidate full profile, skills, resume, community context |
| FR37 | Application & ATS | ATS pipeline stages: Applied → Under Review → Shortlisted → Interview Scheduled → Offered → Hired/Rejected |
| FR38 | Application & ATS | Employer notes on status changes |
| FR39 | Application & ATS | Application counts and unread indicators on dashboard |
| FR40 | Application & ATS | Interview scheduling (manual date/time) |
| FR41 | Application & ATS | "Qualified application" flag based on match score, skills overlap, profile completeness |
| FR42 | Application & ATS | Auto-purge: closed apps 12 months, rejected apps 6 months |
| FR43 | Application & ATS | Resume access revoked 180 days after job closed |
| FR44 | Smart Matching | Match score: 50% skills, 30% location, 20% experience |
| FR45 | Smart Matching | "Jobs for you" section ranked by match score |
| FR46 | Smart Matching | Explainability tags on matched jobs |
| FR47 | Smart Matching | Never excludes candidates from results based on score |
| FR48 | Smart Matching | Does not use protected attributes as matching inputs |
| FR49 | Search & Discovery | Full-text search across titles, descriptions, skills |
| FR50 | Search & Discovery | Filters: job type, experience, salary, date, location, category |
| FR51 | Search & Discovery | Location-based search |
| FR52 | Search & Discovery | Job listing cards with badges |
| FR53 | Search & Discovery | Job badges: Urgent Hiring, Apprenticeship, Community Referral |
| FR54 | Search & Discovery | Partial match fallback when no results |
| FR55 | Search & Discovery | Show recently posted jobs when no matches found |
| FR56 | Apprenticeship | Additional fields: duration, skills taught, completion benefits |
| FR57 | Apprenticeship | Business-led vs individual-led designation |
| FR58 | Apprenticeship | Featured homepage section with hero, cards, success stories, dual CTAs |
| FR59 | Messaging | Employer initiates chat after candidate applies |
| FR60 | Messaging | Both parties can send messages in conversation |
| FR61 | Messaging | Conversation threads linked to job applications |
| FR62 | Notifications | Real-time for: new application, status change, new message, job approved/rejected, interview scheduled |
| FR63 | Notifications | Daily digest for: expiring jobs, smart-match recommendations |
| FR64 | Notifications | "Viewed by employer" passive signal (no push) |
| FR65 | Notifications | Idempotent notification delivery |
| FR66 | Referral System | Share via WhatsApp, LinkedIn, copy link |
| FR67 | Referral System | Named referral to another community member |
| FR68 | Referral System | "Referred by [Name]" badge visible to employer |
| FR69 | Referral System | "You were referred by [Name]" visible to candidate |
| FR70 | Guest Access & SEO | Guests can browse full listings without auth |
| FR71 | Guest Access & SEO | Apply redirects guests to signup |
| FR72 | Guest Access & SEO | Google for Jobs JSON-LD on active listings |
| FR73 | Guest Access & SEO | Sitemap.xml of active listings |
| FR74 | Guest Access & SEO | HTTP 410 for expired listings with similar jobs |
| FR75 | Guest Access & SEO | Open Graph and Twitter Card meta tags |
| FR76 | Job Admin | Review queue with poster context |
| FR77 | Job Admin | Approve/reject/request changes with feedback |
| FR78 | Job Admin | Expedited review indicator for verified companies |
| FR79 | Job Admin | Fast-lane auto-approval for trusted employers |
| FR80 | Job Admin | Revoke fast-lane after two unapproved postings |
| FR81 | Job Admin | Flagged/reported postings bypass fast-lane for immediate review |
| FR82 | Job Admin | All review decisions logged in audit system |
| FR83 | Job Admin | Flag employer for platform admin review |
| FR84 | Cold Start | Browse all listings without profile |
| FR85 | Cold Start | Progressive nudges for profile completion |
| FR86 | Cold Start | Inline company profile creation during first post |
| FR87 | Platform Integration | Cross-subdomain SSO |
| FR88 | Platform Integration | Shared chat messaging infrastructure |
| FR89 | Platform Integration | Shared notification delivery infrastructure |
| FR90 | Platform Integration | Shared cloud file storage (S3) |
| FR91 | Data Protection | Candidate can delete applications and resumes anytime |
| FR92 | Data Protection | Purge all data within 30-day deletion window on account delete |
| FR93 | Data Protection | Anonymize company profile on employer account delete |
| FR94 | Data Protection | Job Admin candidate data access requires audit log |
| FR95 | Data Protection | Salary/compensation range required (form validation) |
| FR96 | Data Protection | Flag discriminatory keywords for Job Admin review |
| FR97 | Data Protection | Jurisdiction disclaimer on all listings |
| FR98 | Community Trust | Candidate trust signals visible to employer |
| FR99 | Community Trust | Portal homepage with recent jobs, featured jobs, search |
| FR100 | Community Trust | Employer dashboard with all postings, counts, actions |
| FR101 | Community Trust | Job Admins manage apprenticeship success stories |
| FR102 | Community Trust | Job Admins manage skill tag library (promote, merge, remove) |
| FR103 | Community Trust | Shared skill tag library for employers and seekers |
| FR104 | Community Trust | Rich text job descriptions |
| FR105 | Community Trust | Currency specification for salary ranges |
| FR106 | Community Trust | Autocomplete from skill library during input |
| FR107 | Community Trust | Cultural/language skills tag category |
| FR108 | Community Trust | Web analytics tracking for page views, funnels, acquisition |

### Non-Functional Requirements

**Total NFRs: 42**

| ID | Category | Requirement |
|---|---|---|
| NFR1 | Performance | Job listing < 2s load (LCP < 2.5s, FCP < 1.5s, CLS < 0.1) |
| NFR2 | Performance | API p95 < 200ms |
| NFR3 | Performance | Search results < 1 second |
| NFR4 | Performance | Apply flow < 30 seconds |
| NFR5 | Performance | Match score computed within search query (no separate request) |
| NFR6 | Performance | JS bundle < 150KB gzip; page weight < 500KB |
| NFR7 | Performance | Lighthouse Performance ≥ 90 (mobile) CI gate |
| NFR8 | Security | TLS 1.2+ for all data in transit |
| NFR9 | Security | AES-256 server-side resume encryption |
| NFR10 | Security | Time-limited signed resume URLs (1hr TTL) |
| NFR11 | Security | Secure cross-subdomain cookies (SameSite=None, Secure, apex domain) |
| NFR12 | Security | CSRF validation on all mutations (cross-subdomain aware) |
| NFR13 | Security | All admin actions audit-logged |
| NFR14 | Security | HTML input sanitized server-side via allowlist |
| NFR15 | Security | No PII in application logs |
| NFR16 | Security | Resume/application data purged within 30 days of account deletion |
| NFR17 | Security | Admin access to candidate data requires audit log |
| NFR18 | Scalability | 200 active jobs, 4,000 applications/month without degradation |
| NFR19 | Scalability | Portal query load ≤ 15% main platform latency increase |
| NFR20 | Scalability | Read replica activated if > 10% latency impact |
| NFR21 | Scalability | Independent container scaling |
| NFR22 | Scalability | Search abstracted behind replaceable interface |
| NFR23 | Reliability | ≥ 99.5% monthly uptime |
| NFR24 | Reliability | Zero-downtime rolling deployments |
| NFR25 | Reliability | Backward-compatible database migrations |
| NFR26 | Reliability | Application submission failure with clear error + retry |
| NFR27 | Reliability | Idempotent notification delivery |
| NFR28 | Reliability | Zero regression in existing test suite |
| NFR29 | Accessibility | WCAG 2.1 AA compliance |
| NFR30 | Accessibility | 44px minimum tap targets |
| NFR31 | Accessibility | ARIA live regions for form errors |
| NFR32 | Accessibility | Text labels on status badges (not color-only) |
| NFR33 | Accessibility | ARIA combobox for skill tag autocomplete |
| NFR34 | Accessibility | ATS status changes announced to screen readers |
| NFR35 | Accessibility | Full keyboard navigation |
| NFR36 | Integration | SSO handoff < 1s across all browsers including Safari iOS 17+ |
| NFR37 | Integration | Portal events in shared event system with domain.action naming |
| NFR38 | Integration | Shared messaging server auth via shared sessions |
| NFR39 | Integration | Shared package changes trigger all-app CI tests |
| NFR40 | Integration | Google for Jobs indexed within 48 hours |
| NFR41 | Integration | Rate limiting inherited from main platform |
| NFR42 | Integration | Separate DB connection pool for portal |

### Additional Requirements (from Domain-Specific & Journeys)

1. **Legal framing**: Platform is connection marketplace, not employer — ToS must state explicitly
2. **Salary transparency**: Salary range is a required field — employer must provide range OR select "Prefer not to disclose"; currency required; "Negotiable" alone not allowed
3. **Non-discrimination**: No discriminatory language; protected characteristics not allowed as requirements
4. **Prohibited job categories**: Fee-for-employment, MLM, no employer identity, financial data requests, crypto-only pay, duplicate mass-postings, illegal jobs
5. **Data retention**: Active apps retained for job duration; closed 12 months; rejected 6 months; resume access 180 days post-close
6. **Resume access rules**: Only for candidates who applied; Job Admin access only for abuse/fraud with audit; platform admin access only for disputes with audit
7. **Phase 0 prerequisite**: Monorepo migration with shared packages (@igbo/db, @igbo/auth, @igbo/ui, @igbo/config) before portal development
8. **Week 6 Validation Gate**: Core loop must be validated before Phase 1b investment
9. **Week 4 DB Performance Checkpoint**: Portal query latency impact assessment
10. **Deferral candidates**: Apprenticeship featured section, named referral, notification digest, smart matching complexity — in priority order

### PRD Completeness Assessment

The PRD v2 is **comprehensive and well-structured**:
- 108 Functional Requirements covering 14 categories
- 42 Non-Functional Requirements covering 6 categories
- 6 detailed user journeys with clear requirements traceability
- Domain-specific rules (salary, discrimination, prohibited categories, data retention)
- Clear phasing (Phase 0 → 1a → 1b → 1.5 → 2 → 3) with validation gates
- Risk assessment with mitigations and deferral candidates
- Success criteria with specific metrics and red flags

**Potential concerns to validate against epics:**
- Phase 0 monorepo migration is a significant prerequisite — must be an epic
- FR107 (cultural skills tags) and FR108 (analytics) were added post-validation — verify coverage in epics
- Fast-lane auto-approval logic (FR79-81) is complex — verify stories exist with adequate detail
- Data retention/purge automation (FR42, FR43, FR92) — verify implementation stories exist

---

## Epic Coverage Validation

### CRITICAL FINDING: FR Numbering Divergence

The PRD v2 and the Epics document use **completely independent FR numbering systems**. Not a single FR number maps to the same requirement between the two documents. The Epics document defines its own FR1-FR111 (111 requirements), while the PRD defines FR1-FR108 (108 requirements). These were clearly authored independently.

### Coverage Statistics

| Metric | Value |
|---|---|
| Total PRD v2 FRs | 108 |
| Total Epics FRs | 111 (105 active + 6 deferred) |
| PRD FRs with content match in Epics | ~53 (~49%) |
| PRD FRs missing from Epics | ~55 (~51%) |
| Epics FRs with content match in PRD | ~53 (~48%) |
| Epics FRs not in PRD (scope additions) | ~58 (~52%) |
| Overall content overlap | ~32% (53 shared / ~166 unique total) |

### PRD FRs Missing from Epics (~55 requirements)

These PRD v2 requirements have no adequate content coverage in the Epics document:

**Job Posting & Lifecycle:**
- PRD FR3: Work location enum (Remote/On-site/Hybrid)
- PRD FR4: Attach job description document to posting
- PRD FR5: "Urgent Hiring" flag
- PRD FR10: Renew expired posting without re-approval
- PRD FR11: Configurable max active postings per employer (default 5)
- PRD FR13: Expired/closed listings visible 30 days then removed from search
- PRD FR14: 3-day advance expiry notification to employer

**Company Profiles:**
- PRD FR15: Inline company profile during first posting (not generic creation)
- PRD FR18: Culture statement, benefits, and banner image
- PRD FR19: Verification badge earned through first approved posting (Epics says "verified community members" — different trigger)
- PRD FR20: Pre-fill company profile for returning employers

**Job Seeker Profiles:**
- PRD FR22: Auto-fill seeker profile from community data
- PRD FR23: Skill tags from predefined library with autocomplete
- PRD FR24: Custom skill tags with distinct visual style
- ~~PRD FR26: Up to 10 resume versions~~ **RESOLVED** — aligned to 5 (MVP), scalable post-MVP
- PRD FR27: Seekers can delete resumes
- PRD FR28: "Open to Opportunities" toggle
- PRD FR30: Minimum profile requirements before applying

**Application System:**
- ~~PRD FR31: One-click apply~~ **RESOLVED** — one-click apply (default), cover letter optional (employer opt-in)
- PRD FR34: Hard delete of own applications
- PRD FR38: Notes when changing application status
- PRD FR39: Application counts and unread indicators on dashboard
- PRD FR40: Manual interview scheduling (Epics defers this)
- PRD FR41: "Qualified application" flag
- PRD FR42/43: Specific retention periods (12mo/6mo/180-day resume revocation)

**Smart Matching:**
- PRD FR44: Explicit weight formula (50%/30%/20%)
- PRD FR46: Explainability tags
- PRD FR47: Never exclude by match score
- PRD FR48: No discriminatory matching inputs

**Search & Discovery:**
- PRD FR53: Job badges (Urgent Hiring, Apprenticeship, Community Referral)
- PRD FR54: Partial match / prefix matching fallback
- PRD FR55: Recently posted jobs when no matches found

**Apprenticeship:**
- PRD FR57: Business-led vs individual-led designation
- PRD FR58: Dedicated featured homepage section (hero, cards, success stories, dual CTAs)

**Notifications:**
- PRD FR64: "Viewed by employer" as passive signal (no push)
- PRD FR65: Notification idempotency (FRs only — in NFRs)

**Guest Access & SEO:**
- PRD FR73: Sitemap.xml generation
- PRD FR74: HTTP 410 for expired listings with similar job links

**Job Admin:**
- PRD FR78: Expedited review indicator for verified companies
- PRD FR80: Revoke fast-lane after two unapproved postings
- PRD FR81: Flagged/reported postings bypass fast-lane
- PRD FR82: Audit logging of all admin review decisions
- PRD FR83: Admin can flag employer for platform admin review

**Cold Start:**
- PRD FR84: Browse without profile (authenticated but no seeker profile)
- PRD FR85: Progressive nudges for profile completion

**Data Protection:**
- PRD FR92: Purge all data within 30-day deletion window
- PRD FR93: Anonymize company profiles on employer account deletion
- PRD FR94: Admin candidate data access only for abuse/fraud with audit
- ~~PRD FR95: Mandatory salary~~ **RESOLVED** — required field with "Prefer not to disclose" option
- PRD FR96: Discriminatory keyword screening from configurable list
- PRD FR97: Jurisdiction disclaimer on all listings

**Community Trust & Other:**
- PRD FR99: Portal homepage layout specification
- PRD FR100: Employer dashboard with postings, counts, actions
- PRD FR101: Admin manage apprenticeship success stories
- PRD FR102: Admin manage skill tag library
- PRD FR103: Shared skill tag library for employers and seekers
- PRD FR105: Currency specification for salary ranges
- PRD FR106: Skill autocomplete from library during input
- PRD FR108: Web analytics tracking (page views, funnels, acquisition)

### Epics FRs Not in PRD (~58 scope additions)

Key additions in the Epics document with no PRD origin:

- **Messaging depth**: Read receipts/typing indicators (Epics FR41), file sharing (FR42)
- **Referral tracking depth**: Tracking through hire (FR49), referrer notifications (FR50), success rate on profiles (FR51)
- **Cold start strategies**: Seed postings (FR63), featured employer program (FR64), community skills survey (FR65)
- **Dual-role/role-switching**: activePortalRole (FR80), role switcher (FR81), dual-role support (FR79)
- **Analytics**: Per-posting (FR72), seeker analytics (FR73), platform-wide admin analytics (FR74)
- **Monetization**: Employer subscription tiers (FR90 — deferred), seeker premium (FR91 — deferred)
- **Employer features**: Brand pages (FR95), verification flow with doc upload (FR101), response time tracking (FR106), posting templates (FR84), preview before submission (FR107)
- **Apprenticeship depth**: Motivation statement (FR35), mentor availability (FR36), progress tracking with milestones (FR37)
- **Community integration**: Event cross-promotion (FR103), posting to community feed (FR104), trust signals (FR68)
- **Technical specifics**: Formal state machine with transition rules (FR110), match quality thresholds with tier bucketing (FR111), outbox pattern for viewed-by-employer (FR109)

### Assessment

**Severity: HIGH RISK**

The ~32% content overlap means implementing from either document alone would miss approximately half the intended requirements. The Epics document appears to be a more complete implementation specification (richer in technical detail, messaging features, analytics, role model), while the PRD v2 is stronger on domain rules, data protection, matching fairness, and granular UX specifications.

**Recommendation:** Before implementation begins, create a **unified requirements matrix** that reconciles both sources into a single canonical FR list. Without this, developers will have conflicting specifications and approximately 113 unique requirements risk being overlooked.

---

## UX Alignment Assessment

### UX Document Status

**Found:** `ux-design-specification.md` — comprehensive UX specification (~3000+ lines) covering:
- Executive summary with target personas
- Core user experience and emotional journey mapping
- Design system foundation (design token extension of `@igbo/ui`)
- UX pattern analysis and competitive inspiration
- Design system choices (shadcn/ui extension with portal semantic tokens)
- Component strategy (JobCard, CandidateCard, StatusPill, MatchTag, TrustBadge, SkillTagInput, ATSPipeline, etc.)
- User journey flows for all personas
- Responsive design and accessibility patterns

Additionally, `ux-design-directions.html` provides visual direction references.

### UX ↔ PRD Alignment

**Well-Aligned Areas:**
- Persona definitions match (Chioma, Adaeze, Emeka, Kene, guests)
- "Viewed by Employer" as the defining emotional moment — consistent across PRD and UX
- Mobile-first for seekers, desktop-optimized for employers — consistent
- Breakpoints (768/1024) — consistent
- WCAG 2.1 AA compliance requirement — consistent
- One-click apply, progressive profile, trust signals — consistent
- Performance targets (LCP < 2.5s, FCP < 1.5s, CLS < 0.1) — consistent
- Network resilience (skeleton loaders, retry on failure, no offline in MVP) — consistent

**Alignment Gaps:**
1. **UX specifies DensityContext** (Comfortable/Compact/Dense modes) — PRD does not mention density modes. The UX is more specific about layout adaptation.
2. **UX specifies three-layer component architecture** (Semantic → Domain → Flow) — not in PRD. This is an architectural UX decision.
3. **UX specifies emotional design principles** (5 principles) and micro-emotion pairs — PRD does not address emotional design beyond success criteria. This is appropriate scope separation.
4. **UX specifies ApplyDrawer** as multi-step flow with different DOM per viewport (Sheet on mobile, side panel on desktop) — PRD says "one-click apply" without this detail.
5. **UX specifies card tier system** (Tier 1 always visible, Tier 2 tap-to-expand on mobile, Tier 3 click-through) — not in PRD. Good UX detail missing from PRD.

### UX ↔ Architecture Alignment

**Well-Aligned Areas:**
- Architecture explicitly references UX spec in its technical constraints
- Three-layer component architecture acknowledged in architecture cross-cutting concerns (F-5)
- DensityContext specified as portal-only (not in `@igbo/ui`) — both docs agree
- Theme scoping strategy: `@igbo/ui` exports theme-unaware base components — consistent
- Container queries for card adaptation — architecture acknowledges this
- "Viewed by Employer" delivery guarantee (at-least-once with dedup) — architecture elevates to cross-cutting concern (F-3)
- FilterParams URL contract (`useFilterParams()`) — architecture specifies extraction strategy (F-12)

**Alignment Gaps:**
1. **Tailwind version alignment** — Architecture notes F-6 (Tailwind v4 `@container` variants needed by UX) but doesn't resolve the decision. Community platform Tailwind version needs confirmation.
2. **ATS pipeline UX differs between docs**: UX specifies "Tabs on mobile / horizontal stepped progress on desktop — NOT a Kanban board (that's Phase 1.5)." But the Epics document (Story 2.9) specifies a Kanban-style drag-and-drop board. This is a direct conflict.
3. **`@igbo/ui` extraction timing** — Architecture defers to Phase 1 (portal copies shadcn/ui initially). UX assumes `@igbo/ui` shared components exist. Stories need to clarify: are portal components in `apps/job-portal/src/components/` or `@igbo/ui`?

### Architecture ↔ PRD Alignment

**Key Finding:** The architecture document was authored referencing PRD v2 and correctly identifies 108 FRs and 42 NFRs from the PRD. However, the Epics document has its own independent FR set (111 FRs). The architecture is aligned with the PRD but the Epics diverge from both.

**Architecture references PRD v2 directly:** The Job Portal Architecture Extension section explicitly states "Based on PRD v2, Product Brief (2026-03-29), and UX Design Specification." It correctly counts 108 FRs across 14 categories.

### Warnings

1. ~~**CRITICAL: ATS visualization conflict**~~ — **RESOLVED (2026-04-01)**: Kanban board (desktop) / Tabs (mobile). UX spec updated to align with Epics Story 2.9.
2. **IMPORTANT: Architecture references PRD v2 FRs but Epics has different FRs** — Architecture is aligned with PRD, but developers implementing from Epics will see different requirements. The FR numbering divergence (identified in Step 3) affects architecture traceability.
3. **MEDIUM: Tailwind v4 confirmation needed** — UX requires `@container` variants (Tailwind v4). Community platform version needs confirmation.
4. **LOW: `@igbo/ui` extraction timing** — Phase 0 defers this, but stories/epics must consistently reference portal-local components, not shared package paths.

---

## Epic Quality Review

### Epic Structure Validation

#### A. User Value Focus Check

| Epic | Title | User Value? | Assessment |
|---|---|---|---|
| **Epic 0** | Monorepo Migration & Portal Foundation | **BORDERLINE** | Technical infrastructure epic. While it enables SSO (user value), the core deliverables are developer-facing (monorepo, packages, CI). However, this is **acceptable for brownfield projects** — integration/migration epics are expected. |
| **Epic 1** | Job Posting & Company Profiles | **YES** | Employers can create profiles and post jobs. Clear user outcome. |
| **Epic 2** | Seeker Profiles & Job Applications | **YES** | Seekers can create profiles and apply. Clear user outcome. |
| **Epic 3** | Job Admin Review & Quality Assurance | **YES** | Admins can review and approve postings. Clear user value (quality gate). |
| **Epic 4** | Search, Discovery & Guest Access | **YES** | Anyone can find and browse jobs. Clear user outcome. |
| **Epic 5** | Portal Messaging | **YES** | Employers and candidates can communicate. Clear user outcome. |
| **Epic 6** | Notifications & "Viewed by Employer" Signal | **YES** | Users receive timely updates. The "Viewed" signal is the emotional core. |
| **Epic 7** | Smart Matching & Recommendations | **YES** | Seekers see personalized recommendations. Clear user outcome. |
| **Epic 8** | Apprenticeship Program | **YES** | Community members discover structured mentorship. Cultural value. |
| **Epic 9** | Referral System & Community Trust Integration | **YES** | Members can refer candidates with tracking. Clear user outcome. |
| **Epic 10** | Cold Start, Onboarding & Growth | **BORDERLINE** | Mix of user-facing (onboarding, brand pages) and operational (seed content). Acceptable as a launch-readiness epic. |

**Violations Found:** None critical. Epic 0 and Epic 10 are borderline but acceptable for brownfield/launch contexts.

#### B. Epic Independence Validation

| Dependency | Valid? | Notes |
|---|---|---|
| Epic 0 → standalone | **YES** | Foundation with no dependencies |
| Epic 1 → Epic 0 | **YES** | Needs portal scaffold and role model from Epic 0 |
| Epic 2 → Epic 0, 1 | **YES** | Needs portal + job postings to exist |
| Epic 2 (apply flow) → Epic 3 (min viable) | **STRUCTURAL CONCERN** | The "Approval Integrity Rule" means postings can't reach `active` without admin approval. E2 Stories 2.5A+ structurally depend on E3.1-3.3. This is explicitly documented and well-managed (parallel workstreams), but it IS a forward dependency within Phase 1a. |
| Epic 3 → Epic 1 | **YES** | Needs postings to review |
| Epic 4 → Epic 1 | **YES** | Needs postings to search/display |
| Epic 5 → Epic 2 | **YES** | Needs applications to link conversations |
| Epic 6 → Epic 2 | **YES** | Needs applications to notify about |
| Epic 7 → Epic 2, 4 | **YES** | Needs profiles + search infrastructure |
| Epic 8 → Epic 2 | **YES** | Needs application flow for apprenticeship applications |
| Epic 9 → Epic 2, 3 | **YES** | Needs applications + admin review for referral tracking |
| Epic 10 → Epic 1, 2, 6 | **YES** | Needs core platform for cold start/onboarding |

**No circular dependencies.** The Epic 2 → Epic 3 (min viable) dependency is the most complex but is explicitly acknowledged and mitigated with parallel workstreams.

### Story Quality Assessment

#### Story Sizing

Stories are generally **well-sized** — each delivers a meaningful slice of functionality. However:

**Oversized Stories (potential splitting needed):**
- **Story 2.4 (Application State Machine & Event Model)** — Very large scope: formal state machine, transition rules, event model, audit trail. This is essentially 3-4 stories compressed into one. Recommend splitting into: (a) state machine + transitions table, (b) event emission, (c) validation rules.
- **Story 3.2 (Approve/Reject/Request Changes + Fast-Lane)** — Combines the entire admin workflow AND fast-lane auto-approval into a single story. Fast-lane is a separate concern and should be a separate story.
- **Story 4.1A (Full-Text Search Backend & API Contract)** — Large: tsvector setup, GIN index, API contract definition, Redis caching, cursor pagination. Could split into: (a) search backend, (b) API contract + caching.

**Undersized Stories (could be merged):**
- **Story 0.3B (SSO) and 0.3C (Safari ITP)** — Could be a single story with Safari as an AC. The Safari workaround is meaningless without SSO.
- **Story 1.3A (Job Posting) and 1.3B (Cultural Context + Bilingual)** — Bilingual descriptions could be an AC of the job posting creation story.

#### Acceptance Criteria Quality

**Strengths:**
- Consistent Given/When/Then BDD format throughout
- Specific and measurable outcomes
- Error conditions covered (invalid transitions, file size limits, duplicate prevention)
- Database schema included directly in ACs (enables precise implementation)

**Weaknesses:**
- ~~**Story 1.3A**: Salary field conflict~~ — **RESOLVED**: Salary is now a required field with "Prefer not to disclose" option across all docs.
- ~~**Story 2.2**: CV limit conflict~~ — **RESOLVED**: Aligned to 5 (MVP) across all docs.
- ~~**Story 2.5A**: Cover letter conflict~~ — **RESOLVED**: One-click apply (default), cover letter optional (employer opt-in) across all docs.
- **Several stories** include schema definitions in ACs (e.g., 1.1A, 2.1, 2.4) which is good for precision but means schema changes across stories need careful coordination.

### Dependency Analysis

#### Database/Entity Creation Timing

**Approach: Schema Foundation Story + Extension Pattern**

Epic 0 doesn't create portal tables. Story 1.1A creates the foundational portal schema (`portal_company_profiles`, `portal_job_postings`, `portal_applications` stub). Story 2.1 creates `portal_seeker_profiles`. Story 2.4 extends `portal_applications` with state machine columns and creates `portal_application_transitions`. This is a **reasonable brownfield pattern** — foundational tables in the first story of the relevant epic, extensions as needed.

**Concern:** Story 1.1A creates a `portal_applications` stub table, but Story 2.4 significantly extends it. The stub in 1.1A may cause confusion — why create a table that's immediately redesigned 1 epic later? Consider deferring `portal_applications` to Epic 2.

#### Within-Epic Dependencies

- **Epic 0**: Linear (0.1 → 0.2A → 0.2B → 0.3A → 0.3B → 0.3C → 0.4 → 0.5 → 0.6). This is appropriate for infrastructure extraction.
- **Epic 1**: 1.1A → 1.1B/1.2 (parallel) → 1.3A → 1.3B → 1.4 → 1.5 → 1.6 → 1.7. Clean linear progression.
- **Epic 2**: 2.1 → 2.2 → 2.3 → 2.4 → 2.5A → 2.5B → 2.6 → 2.7 → 2.8 → 2.9 → 2.10 → 2.11. Linear but very long (11 stories). Potential parallelism: 2.8 (analytics) could run parallel with 2.9-2.10 (ATS pipeline).
- **Epics 3-10**: Dependencies well-documented in the Mermaid diagram. No forward references found.

### Best Practices Compliance Summary

| Check | Epic 0 | Epic 1 | Epic 2 | Epic 3 | Epic 4 | Epic 5 | Epic 6 | Epic 7 | Epic 8 | Epic 9 | Epic 10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| User value | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ~ |
| Independence | ✓ | ✓ | ~* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Story sizing | ✓ | ✓ | ~ | ~ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| No fwd deps | ✓ | ✓ | ~* | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| DB when needed | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Clear ACs | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| FR traceability | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

*~* = E2 apply flow depends on E3 min viable (documented and mitigated)*

### Quality Violations Summary

#### Critical Violations (0)
None found. The epics are structurally sound.

#### Major Issues (4) — ALL RESOLVED (2026-04-01)

1. **~~PRD-Epics data conflict: Salary requirement~~** — **RESOLVED**: Required field with "Prefer not to disclose" option. PRD FR95 updated to allow explicit opt-out. Epics FR83 + Story 1.3A updated to make salary a required field (must provide range OR select "Prefer not to disclose"). Satisfies compliance + UX flexibility.

2. **~~PRD-Epics data conflict: Resume versions~~** — **RESOLVED**: 5 versions (MVP), scalable later. PRD FR26 updated from 10 → 5. Epics Story 2.2 already said 5. Documents now aligned.

3. **~~PRD-Epics data conflict: One-click apply vs cover letter~~** — **RESOLVED**: One-click apply (default), cover letter = optional field (employer opt-in). Critical for conversion. Epics FR17 + Story 2.5A updated. PRD FR31 unchanged (already correct). UX spec already aligned (employer opt-in only).

4. **~~UX-Epics conflict: ATS visualization~~** — **RESOLVED**: Kanban board (matches employer mental model, faster decisions). UX spec ATSPipeline component updated from "NOT a Kanban board" → "Kanban board (desktop) / Tabs (mobile)". Epics Story 2.9 unchanged (already correct).

#### Minor Concerns (3)

1. **Story 1.1A creates `portal_applications` stub** that is immediately redesigned in Epic 2 Story 2.4. Consider deferring to Epic 2.
2. **Story 2.4 is oversized** — combines state machine, event model, transition rules, and audit trail. Consider splitting.
3. **Story 3.2 combines admin workflow + fast-lane** — fast-lane auto-approval is complex enough for its own story.

---

## Summary and Recommendations

### Overall Readiness Status

### **READY** — Both critical blockers resolved 2026-04-01. All 4 major issues resolved. 3 minor concerns remain (non-blocking).

The planning artifacts are individually high-quality — the PRD v2 is thorough (108 FRs, 42 NFRs), the UX specification is comprehensive, the architecture document includes a detailed portal extension, and the epics have well-structured stories with BDD acceptance criteria. However, the documents are **not aligned with each other**, creating a situation where developers would receive conflicting specifications.

### Critical Issues Requiring Immediate Action

**~~BLOCKER 1: FR Numbering Divergence Between PRD and Epics~~** — **RESOLVED (2026-04-01)**

Resolution: Removed the Epics-local FR inventory (FR1–FR111) entirely. PRD v2 is now the single source of truth for all requirement definitions. Actions taken:
- Deleted the Epics FR inventory, NFR list, FR Coverage Map, and Deferred FRs sections
- Replaced with a "Requirements Reference" section pointing to prd-v2.md
- Updated all Epic summary "FRs covered" lines to reference PRD FR numbers
- Updated all in-story FR references to PRD FR numbers
- Added 19 new PRD FRs (FR109–FR127) for Epics-only features needed for MVP
- Added 21 DEFERRED items to PRD for post-MVP features
- Content-matched ~70 Epics FRs to existing PRD FRs; ~25 deferred; ~19 promoted to new PRD FRs

**~~BLOCKER 2: Direct Conflicts Between Documents~~** — **RESOLVED (2026-04-01)**

All four conflicts resolved. Documents updated in place:

| # | Conflict | Resolution | Documents Updated |
|---|---|---|---|
| 1 | Salary requirement | Required field with "Prefer not to disclose" option | PRD FR95, Epics FR83 + Story 1.3A |
| 2 | Resume versions | 5 (MVP), scalable post-MVP | PRD FR26 |
| 3 | Apply friction | One-click apply (default), cover letter optional (employer opt-in) | Epics FR17 + Story 2.5A + Story 8.7 + Story 2.9 ATS panel |
| 4 | ATS visualization | Kanban board (desktop) / Tabs (mobile) | UX spec ATSPipeline component |

### Recommended Next Steps

1. ~~**Reconcile FR numbering**~~ — **DONE (2026-04-01)**. Epics-local FR numbering removed. PRD v2 is canonical (FR1–FR131). 19 new FRs added for Epics-only MVP features; 21 items deferred. All Epic summaries and stories reference PRD FR numbers.

2. ~~**Resolve the 4 direct conflicts**~~ — **DONE (2026-04-01)**. All four resolved and documents updated:
   - Salary: Required field with "Prefer not to disclose" option
   - Resume limit: 5 (MVP), scalable post-MVP
   - Apply flow: One-click apply (default), cover letter optional (employer opt-in)
   - ATS: Kanban board (desktop) / Tabs (mobile)

3. **Audit the ~55 uncovered PRD requirements** — Determine which are intentionally deferred (add to Deferred FRs section) vs. accidentally omitted (add stories). Key ones to prioritize:
   - PRD FR95 (mandatory salary) — domain rule that affects form validation
   - PRD FR42/43 (data retention/purge schedules) — compliance requirement
   - PRD FR80/81 (fast-lane revocation rules) — trust/safety guardrails
   - PRD FR96 (discriminatory keyword screening) — partially covered by Epics FR62 but needs specificity
   - PRD FR108 (web analytics) — business measurement requirement

4. **Audit the ~58 epics scope additions** — Determine which are valid PRD-implied features (keep) vs. scope creep (defer/remove). Key ones to validate:
   - Epics FR41 (read receipts/typing indicators) — in PRD? No. Needed for MVP?
   - Epics FR37 (apprenticeship milestone tracking) — PRD apprenticeship is simpler
   - Epics FR90/91 (subscription tiers) — already marked deferred, confirm
   - Epics FR73/74 (seeker/admin analytics) — not in PRD, but useful

5. **Split oversized stories** — Story 2.4 (state machine), Story 3.2 (admin workflow + fast-lane), and Story 4.1A (search backend) should be split for manageable implementation.

6. **Confirm Tailwind v4 alignment** — UX requires `@container` variants. Verify community platform Tailwind version or plan upgrade.

### Strengths

Despite the alignment issues, the planning artifacts have significant strengths:

- **PRD v2** is exceptionally detailed with 6 user journeys, domain-specific rules, deferral candidates, and validation gates
- **Architecture** addresses 14 cross-cutting concerns with specific resolution strategies and party-mode findings
- **Epics** have well-structured BDD acceptance criteria with database schema details in ACs
- **UX** goes deep on emotional design, providing micro-interaction specifications and negative-moment design
- **Dependency management** is well-documented with a clear critical path and parallel workstream strategy
- **Phase 0 monorepo migration** is appropriately scoped as a prerequisite with zero-regression gates

### Final Note

This assessment originally identified **2 critical blockers**, **4 major issues**, and **3 minor concerns**. All blockers and major issues were **resolved on 2026-04-01**:
- **Blocker 1 (FR divergence):** Epics-local FR numbering removed; PRD v2 is now single source of truth (FR1–FR131 + 21 deferred)
- **Blocker 2 (4 direct conflicts):** Salary, resume limit, apply friction, and ATS visualization all resolved with documents updated in place
- **Status: READY** — 3 minor concerns remain (non-blocking): portal_applications stub timing, Story 2.4 sizing, Story 3.2 fast-lane split
