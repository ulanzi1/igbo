---
stepsCompleted: [1, 2, 3, 4, 5, 6]
status: complete
inputDocuments:
  - Job_Portal_PRD_v1.1_FINAL.md
  - product-brief-igbo-2026-02-18.md
  - project-context.md
date: 2026-03-29
author: Dev
---

# Product Brief: igbo — Job Portal

## Executive Summary

The igbo Job Portal is a dedicated, community-exclusive employment platform hosted at `job.[domain]`, deeply integrated with the igbo community ecosystem. It connects community business owners with job seekers from within the community — keeping economic opportunity where it belongs: among our own people.

Today, community members who own businesses have no structured way to find qualified candidates from within their community. Hiring happens through scattered WhatsApp messages and word-of-mouth, meaning business owners don't know who among their own people would be a perfect fit for their openings. Meanwhile, talented community members — especially young professionals back home — have no visibility into opportunities created by their own diaspora network.

The Job Portal solves this by providing a fully featured employment platform with job posting and discovery, a complete Applicant Tracking System (ATS), company profiles, a resume upload and profile system, rule-based smart job matching, interview scheduling, and a modern apprenticeship program inspired by the cultural tradition of skill-transfer between generations — now expanded across all industries. All of this is powered by shared authentication, messaging, and member profiles from the core igbo platform.

The portal is designed as a trust-first platform: every job posting is admin-reviewed by dedicated Job Admins with business judgment, candidates carry community verification badges and endorsements that signal trust no external platform can replicate, and the matching system is transparent — showing candidates exactly why a job is recommended. Guest visitors can browse full job listings and salary ranges, with a clear path to join the community when they're ready to apply.

---

## Core Vision

### Problem Statement

Community business owners want to hire from within their own community but have no way to discover who among their members has the right skills, experience, and availability. Job seekers within the community — particularly young professionals in Nigeria and across the diaspora — have no visibility into opportunities created by community-owned businesses. The result: economic value that should circulate within the community leaks outward to external hiring channels.

### Problem Impact

- **Economic leakage**: Community-owned businesses hire externally because they simply cannot find qualified community members, sending wages and opportunity outside the network
- **Invisible talent**: Skilled community members are invisible to business owners who would prefer to hire them — there is no directory, no searchable profiles, no way to match skills to openings
- **Dying apprenticeship tradition**: The cultural practice of skill transfer from experienced members to youth — once one of the most successful wealth-creation engines in the community — is fading without a structured platform to facilitate it across modern industries
- **Fragmented hiring**: Job opportunities shared via WhatsApp and word-of-mouth reach only a fraction of the community, and there is no way to track applications, manage candidates, or measure outcomes
- **Youth disconnection**: Young professionals in Nigeria and the diaspora miss opportunities they don't even know exist, widening the gap between generations
- **Application black holes**: Even when connections are made informally, candidates have no visibility into whether their interest was seen, reviewed, or acted upon

### Why Existing Solutions Fall Short

- **LinkedIn and Indeed** are generic platforms — they don't surface community membership as a hiring signal, offer no cultural context, and provide no connection to the igbo ecosystem
- **WhatsApp and word-of-mouth** are unstructured — business owners post in one group and miss candidates in another; there is no application tracking, no candidate comparison, and no way to know who applied
- **No community-specific job platform exists** — nobody has built an employment platform designed specifically for a dispersed cultural community with shared identity, trust, and values
- **Generic job boards lack trust signals** — no community verification badges, no member endorsements, no shared cultural context that builds confidence between employer and candidate
- **No apprenticeship platform exists at the community level** — government-run apprenticeship programs are bureaucratic and disconnected; LinkedIn has no structured mentorship-to-employment pipeline; no platform enables community-powered apprenticeships across all industries

### Proposed Solution

A fully featured job portal at `job.[domain]` that is community-exclusive and deeply integrated with the igbo platform:

- **Job posting with dedicated Job Admin approval** — business owners post opportunities, dedicated Job Admins with business judgment verify quality, legitimacy, and salary fairness before listings go live
- **Complete ATS** — employer dashboard with full candidate pipeline (Applied → Under Review → Shortlisted → Interview → Offered → Hired/Rejected), "viewed by employer" transparency signal, and basic candidate filtering
- **Job seeker profiles and resume uploads** — dedicated professional profiles with headline, summary, skills, experience, and education; PDF/DOCX resume uploads with multiple versions and default selection; one-click apply using stored profile data
- **Smart job matching** — rule-based matching using weighted formula (50% skills overlap, 30% location match, 20% experience fit) with transparent explainability tags ("Matches 4 of your skills", "Same city", "Experience fits")
- **Modern apprenticeship program** — inspired by the cultural tradition of Igba Odibo but expanded across all industries; dedicated featured section on the portal homepage with success stories; a software engineer in Houston mentoring a junior in Lagos, a restaurateur in London teaching a young chef in Enugu
- **Messaging via community chat** — employer-candidate communication opens after application (not just shortlisting), using the existing igbo chat system; employer-initiated, both sides can reply
- **Company profiles** — verified business pages with branding, culture statements, and all active listings
- **Search and discovery** — PostgreSQL full-text search with filters by job type, location, experience level, and cultural skills; Elasticsearch deferred to phase two
- **Tiered notifications** — real-time email + in-app for critical events (new application, status change, messages); daily digest for low-priority updates; smart empty-state handling
- **Open guest access** — full job descriptions, salary ranges, and company profiles visible to non-members; Apply button redirects to community signup; Google for Jobs SEO markup for organic discovery
- **Google Analytics** — visitor tracking across all portal pages for data-driven decisions
- **Shared infrastructure** — SSO authentication, chat messaging, notification system, and member profiles from the core igbo platform

### Key Differentiators

- **Community-exclusive trust layer** — not a generic job board with a community filter, but a platform where every candidate carries community verification badges, endorsements, and engagement history that no external platform can replicate
- **"Hire your own people" mission** — the platform makes it easier for community business owners to find and hire from within than to go external, reversing the current default of economic leakage
- **Universal apprenticeship program** — the only employment platform that facilitates structured skill-transfer across all industries, inspired by cultural tradition but modernized for the global economy; our ancestors built prosperity by teaching the next generation, and this portal brings that into the 21st century
- **Transparent matching** — candidates see exactly why a job is recommended (skills, location, experience tags), building trust without black-box AI
- **Application transparency** — "viewed by employer" signals eliminate the black hole experience; candidates always know where they stand
- **Admin-verified quality** — every job posting reviewed by dedicated Job Admins with business judgment, ensuring trust and legitimacy that open platforms cannot guarantee
- **Deep ecosystem integration** — shared auth, chat, profiles, and notification infrastructure from the core igbo platform; the job portal isn't bolted on, it's woven in
- **Google-discoverable** — full job listings visible to guests with structured data markup, turning every posted job into a community acquisition channel

---

## Target Users

### Primary Users

#### Employers

##### 1. Emeka — The Diaspora Business Owner (High Strategic Value) [Tier 2]

**Profile:** 42-year-old IT consulting firm owner in Toronto, Canada. Runs a 15-person company and wants to build a remote team with people he can trust — people from his own community.

**Needs & Motivations:**
- Trusted hires back home for remote or hybrid roles
- Wants to offer apprenticeships to young community members — sees it as giving back
- Needs confidence that candidates are legitimate, vetted by the community
- Lower volume hiring (2-3 roles per quarter) but high trust sensitivity

**Current Frustrations:**
- Posts in WhatsApp groups and gets 50 messages but no structured way to compare candidates
- Can't verify skills or background of people he doesn't personally know
- Has tried LinkedIn but the community signal is invisible — he can't tell who's Igbo and who isn't
- Wants to hire from within but defaults to external recruiters because it's easier

**Success Moment:** Emeka posts a Remote DevOps Engineer role, receives 12 applications from community members with verification badges and skill endorsements, shortlists 3 in one afternoon using the ATS, and hires someone referred by a community elder he trusts — all without leaving the platform.

##### 2. Chioma — The Local Business Owner (High Volume) [Tier 1]

**Profile:** 38-year-old restaurant chain owner in Lagos with 4 locations and 60+ employees. Constantly hiring for operational roles — cooks, servers, managers, delivery staff.

**Needs & Motivations:**
- Fast, frequent hiring for operational positions
- Less formal process — needs to fill roles quickly
- Wants candidates who share cultural values and work ethic
- Posts 3-5 jobs per month across different locations

**Current Frustrations:**
- Relies on word-of-mouth and walk-ins — unpredictable quality
- No way to track who applied, who was interviewed, who was rejected
- Loses good candidates because her informal process is too slow
- Wants community members but has no structured way to reach them at scale

**Success Moment:** Chioma posts a Head Chef role on Monday morning, receives 8 applications by Wednesday, uses the ATS to shortlist 3, messages them through the platform chat, and schedules interviews — all tracked in one dashboard instead of scattered across WhatsApp threads and paper notes.

#### Job Seekers

##### 3. Adaeze — The Early Career Job Seeker [Tier 1]

**Profile:** 22-year-old recent university graduate in Lagos, Nigeria. BSc in Computer Science, hungry for her first real opportunity. Less than 2 years of experience.

**Needs & Motivations:**
- Entry-level jobs and apprenticeship opportunities
- Mentorship and guidance from experienced community professionals
- Visibility into diaspora opportunities she didn't know existed
- A professional profile that showcases her potential, not just her (limited) experience

**Current Frustrations:**
- Applies on generic job boards and never hears back — the black hole experience
- Doesn't know about remote opportunities from diaspora business owners
- Has no professional network beyond university classmates
- Feels disconnected from the global Igbo community despite living in Nigeria

**Success Moment:** Adaeze finds a 6-month software apprenticeship posted by Emeka's firm in Toronto, applies with one click using her auto-filled profile, sees "Viewed by employer" within 2 days, gets shortlisted, and starts her first professional role — all because the platform made her visible to an employer who wanted to hire from within.

##### 4. Obinna — The Experienced Professional Switcher [Tier 2]

**Profile:** 34-year-old accountant in Abuja with 8 years of experience at a Big Four firm. Ready for a change — wants better compensation, growth, and to work for a company that shares his values.

**Needs & Motivations:**
- Better roles with trusted employers — not just any job, the right job
- Salary transparency — won't waste time on roles that don't meet his expectations
- Wants to see company culture and values before applying
- Cares about growth trajectory, not just the immediate role

**Current Frustrations:**
- LinkedIn is noisy — hundreds of irrelevant recruiter messages
- Can't tell which employers genuinely value community connection vs. those just posting everywhere
- Doesn't trust salary ranges on generic platforms — too often misleading
- Wants to work for a community-owned business but can't find them

**Success Moment:** Obinna's smart matching recommends a Finance Director role at a community member's growing fintech in Lagos — "Matches 5 of your skills, Same city, Experience fits." He sees the company profile, reads the culture statement, checks the salary range (visible and fair), and applies. The transparency at every step makes him feel respected, not processed.

##### 5. Amara — The Diaspora Remote Seeker [Tier 3]

**Profile:** 29-year-old marketing specialist in London, UK. Wants flexible remote work that lets her contribute to community-driven businesses while maintaining her life abroad.

**Needs & Motivations:**
- Remote and flexible job opportunities from community businesses
- Cross-border applications without the usual complexity
- Connection to home through meaningful work, not just nostalgia
- Portfolio of freelance/contract work alongside her current role

**Current Frustrations:**
- Generic remote job boards have no community context
- Can't filter for "community-owned businesses" on any existing platform
- Wants to work with Nigerian businesses remotely but doesn't know where to start
- Misses the sense of purpose that comes from contributing to her community

**Success Moment:** Amara filters jobs by "Remote" and finds 3 marketing roles from community businesses in Nigeria, applies to all three with one-click apply, and lands a part-time contract that lets her use her London agency experience to help a community startup grow — bridging the diaspora gap through work.

### Secondary Users

#### 6. Job Admin — Trust & Safety Gatekeeper [Tier 1]

**Profile:** Dedicated staff member trained in trust and safety with business judgment. Not a community content moderator — an economic gatekeeper responsible for the integrity of every job listing on the portal.

**Responsibilities:**
- Review and approve/reject/request-changes on all job postings before they go live
- Verify company legitimacy — is this a real business? Is the salary plausible?
- Flag and block scam patterns (fee-for-employment schemes, too-good-to-be-true offers, duplicate mass-postings)
- Expedite review for previously verified companies
- Periodically review custom skill tags and promote quality entries to the official skill library

**Why Separate from Content Moderation:** Evaluating whether a "Remote Marketing Manager — $200K" posting from an unverified company is legitimate requires business judgment — not the same skillset as reviewing forum posts for community guidelines compliance. This is a trust and safety decision at the economic layer. Implemented as a new `JOB_ADMIN` role, separate from `MODERATOR` and `ADMIN`.

#### 7. Passive Community Members — Browsers, Sharers, Referrers [Tier 3]

**Profile:** Community members who don't actively post jobs or apply, but contribute to the job portal ecosystem through browsing, sharing, and referring.

**Behaviors:**
- Browse job listings out of curiosity or to stay informed about community economic activity
- Share job listings externally (WhatsApp, LinkedIn, social media) — driving acquisition of new community members
- Refer other community members to specific job postings — adding a trust signal visible to both employer ("Referred by Nkem" badge) and candidate ("Nkem referred you for this role")
- Represent a significant portion of portal traffic and are the primary driver of organic growth

**Referral System:**
- **Link Sharing (Primary):** Share button on every job listing to WhatsApp, LinkedIn, copy link. Drives guest traffic and community acquisition. Zero complexity.
- **Named Referral (Light):** "Refer a Member" button → select community member → they get notified → "Referred by [Name]" badge visible to employer on application, "You were referred by [Name]" visible to candidate. Two-sided visibility reinforces community connection. No points rewards (on hold).

#### 8. Guest Visitors — Acquisition Channel [Tier 3, but strategically important]

**Profile:** Non-members who discover the portal through Google search (Google for Jobs SEO markup), shared WhatsApp/LinkedIn links, or social media posts. They can browse full job listings, salary ranges, and company profiles but must join the community to apply.

**Conversion Path:** See a compelling job listing → Click Apply → Redirected to community signup with the specific job as motivation → Join igbo → Complete minimum profile → Apply for the job that brought them in → Become an active community member.

### Persona Priority Tiers

| Tier | Personas | Rationale |
|------|----------|-----------|
| **Tier 1 — Must be Excellent** | Chioma (Local Employer), Adaeze (Early Career Seeker), Job Admin | Chioma drives supply (jobs), Adaeze drives demand + emotional story, Job Admin enables platform trust |
| **Tier 2 — Must Work Well** | Emeka (Diaspora Employer), Obinna (Experienced Switcher) | Strategic value but lower volume; can tolerate a rougher initial experience |
| **Tier 3 — Minimal Support** | Amara (Remote Seeker), Guest Visitors, Passive Members | Served by core features (search/filter, open access, share buttons); Guest Visitors are strategically important as acquisition channel but not a product complexity driver |

### Cold Start Experience

#### First-Time Job Seeker (Day-One Must-Have)

**Immediate access (no blocking):**
- Full job listings browsable with all filters (location, type, experience, etc.)
- Full job descriptions, salary ranges, company profiles — all visible

**Progressive nudges:**
- Persistent banner: *"You're browsing without a profile — complete it to get personalized matches"*
- When user clicks Apply without a profile → inline prompt to complete minimum profile
- When user scrolls past 5+ listings → "Get better matches" CTA
- After first application → nudge to complete full profile: *"Employers with complete profiles shortlist 3x more often"*

**Minimum profile required to apply:**
- Display name (auto-filled from igbo community profile)
- Location / city (auto-filled from community profile)
- At least 1 skill tag (hard requirement — Apply button disabled until added)
- Apply blocked with inline message if no skill: *"Add at least one skill so employers can understand your profile"*

**Skill tag quality control:**
- Predefined skill library with autocomplete suggestions
- Custom skills allowed but visually distinct (different badge style)
- Job Admin periodically curates custom entries → promotes quality ones to official library
- Prevents low-quality entries ("good worker", "hardworking") through structured selection

**Progressive profile completion:**
- Skills (3+ recommended — progress bar: "Add more skills to improve your match score")
- Headline (one-line professional summary)
- Resume upload (PDF/DOCX, multiple versions)
- Full experience and education history

**Auto-fill from community profile:** Display name, location, and interests from the existing `communityProfiles` table are pre-populated into the job seeker profile on first visit, reducing onboarding to near-zero friction.

#### First-Time Employer

**Flow:** Start posting job → inline company profile creation (not a separate step) → submit both together for Job Admin review.

**Minimum company profile required to post:**
- Company name (required)
- Company description (required, with guiding placeholder: *"What does your company do? What kind of candidates are you looking for?"*)
- Industry (required — dropdown)
- Company size (required — dropdown: 1-10, 11-50, 51-200, 200+)
- Logo (optional but encouraged)

**Deferred (can complete later):**
- Culture and values statement
- Benefits and perks listing
- Banner image

### User Journey

#### Discovery Paths

| Path | Entry Point | User Experience |
|------|-------------|-----------------|
| **From within igbo** | Existing community member clicks "Jobs" from main platform | Lands on `job.[domain]` authenticated via SSO; if profile exists, sees smart matches; if first visit, sees full listings with cold-start nudges |
| **From Google** | Non-member finds a job listing via Google for Jobs search | Sees full listing with description and salary; clicks Apply; redirected to community signup with the specific job as motivation |
| **From a referral/share** | Receives a WhatsApp or LinkedIn link from a community member | Lands on specific job listing; browses freely; clicks Apply; redirected to signup if not a member; if referred by name, sees "You were referred by [Name]" |

#### Journey by Persona

| Phase | Employers (Chioma/Emeka) | Job Seekers (Adaeze/Obinna/Amara) | Passive Members |
|-------|--------------------------|-------------------------------------|-----------------|
| **Onboarding** | Create company profile inline during first job post; submit together for Job Admin review | Auto-filled profile from community data; add 1+ skill tag to apply; progressive completion over time | Browse portal, discover listings |
| **Core Usage** | Post jobs, review applications in ATS, message candidates after application, manage pipeline, see "viewed" status on applications | Browse jobs, receive smart matches with explainability tags, apply with one-click, track application status, see "viewed by employer" signal | Browse, share links externally (WhatsApp/LinkedIn), refer community members with named referral |
| **Success Moment** | First successful hire from within the community — "I found the right person without going external" | First application that progresses — "They actually saw my application and responded" | A referred candidate gets hired — "I helped someone in my community get a job" |
| **Long-term** | Portal becomes default hiring channel; repeat postings; faster review for verified company; apprenticeship offerings | Profile builds with endorsements and history; smart matches improve; career grows within community | Regular sharing drives new member signups; referral reputation grows |

---

## Success Metrics

> **Measurement Standard:** All metrics are measured on a rolling 30-day window unless otherwise specified.

> **Active Definitions:**
> - **Active employer** = employer with ≥1 job posted in the last 30 days
> - **Active seeker** = user with ≥1 application submitted in the last 30 days

### North Star Metric

**Applications per Job (with quality threshold):** 8–20 applications per job posting, where >70% of applications are viewed by the employer within 3 days.

**Supporting Metric:** % of jobs with at least 1 successful hire — Target: 25–40% at launch, 40–60% at maturity.

### User Success Metrics

#### Employer Success

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| **Applications per job** | 8–20 | Below 5 = not enough demand; above 30 = noise problem |
| **Time to first value** | < 24–48 hours (first qualified application) | The employer's "aha moment" — proof the portal delivers real candidates fast |
| **Time to first view** | < 24–48 hours (employer opens any application) | Distinguishes system delivery (are applications arriving?) from employer engagement (are they reviewing?) |
| **Time to first hire** | 7–21 days | Too long = friction in system; too short = low-quality filtering |
| **Employer return rate** | 40–60% post again within 30–60 days | True product-market fit signal — if employers come back, the portal works |
| **Application review rate** | >70% viewed or status-changed | Proves employers are engaged, not just posting and forgetting |
| **Job fill rate** | 25–40% (launch), 40–60% (mature) | % of jobs with at least 1 successful hire — ultimate outcome metric |

**Application Review Rate — Internal Breakdown:**
- **Viewed rate:** % of applications where employer opened the application detail (tracked via `viewed_at` timestamp). High viewed + low status change = employer browsing but not acting (may indicate decision paralysis or poor candidate quality).
- **Status change rate:** % of applications that moved beyond "Applied" (to Under Review, Shortlisted, Rejected, etc.). Both low = employer disengagement.

**Qualified Application Definition:** An application is "qualified" when it meets all three criteria:
- Smart match score ≥ minimum threshold (computed from skills overlap, location, experience weights)
- Candidate has valid skill tags that overlap with job requirements
- Candidate profile is non-empty (not spam — has display name, location, 1+ skill minimum enforced by system)

**Qualified Application Rate:** % of total applications that meet the qualified threshold — Target: 50–70%. Too low = spam or poor matching. Too high = system is overly strict and may be filtering out viable candidates.

#### Job Seeker Success

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| **% of applications viewed** | >70% within 3 days | Solves the "black hole" problem — candidates feel seen |
| **% of applications with status change** | >50% | Movement = system is alive; stagnation = dead portal |
| **Time to first response** | < 72 hours (view or status change) | Speed of feedback determines whether seekers trust the platform |
| **Applications per active seeker** | 3–10 per month | Too low = no engagement; too high = desperation or poor matching |
| **Interview / shortlist rate** | 10–25% of applications | Proves the matching and filtering are working — quality over volume |
| **Seeker cohort retention** | 30–40% (launch), 40–60% (mature) | % of seekers who apply again within 30 days — stickiness signal |

### Business Objectives

#### Launch Ramp (First 3 Months)

| Month | Jobs Posted | Applications | Notes |
|-------|------------|--------------|-------|
| **Month 1** | 30–50 | 300–600 | Seed with community business owners; validate core flows |
| **Month 2** | 60–100 | 1,000–2,000 | Word-of-mouth growth; first hires happening |
| **Month 3** | 100–150 | 2,000–3,000 | Approaching steady state; employer return rate measurable |

#### Steady State (12 Months)

- ~200 jobs posted per month
- ~4,000 applications per month
- 10+ successful hires per month
- 40%+ employer return rate

#### Strategic Goals

**Primary Goal:** Enable hiring within the community — close the economic loop where community business owners hire community members, keeping wages and opportunity inside the network.

**Secondary Goals:**

1. **Acquisition Engine** — Every job listing is a guest-to-member conversion opportunity. Jobs = growth channel. Guest → sees job on Google → clicks Apply → signs up → becomes active community member.
2. **Engagement Driver** — Job applications, notifications, status updates, and messaging create recurring reasons for members to return to the platform daily.
3. **Trust Layer Expansion** — Moves the igbo platform from a social community to an economic community. When real money and real jobs flow through the platform, the trust layer deepens significantly.

### Key Performance Indicators

#### Engagement KPIs

| KPI | Measurement | Target |
|-----|-------------|--------|
| **Active employers** | Unique employers with ≥1 active posting in last 30 days | 20+ by month 3, 50+ by month 6 |
| **Active job seekers** | Unique seekers with ≥1 application in last 30 days | 100+ by month 3, 500+ by month 12 |
| **Job seeker profile completion** | % of seekers with 3+ skills, headline, and resume | 60%+ within 3 months of first visit |
| **Smart match click-through** | % of recommended jobs that get clicked | 15%+ (proves matching is relevant) |
| **Chat engagement** | % of shortlisted candidates with active employer-candidate conversation | 50%+ |

#### Growth KPIs

| KPI | Measurement | Target |
|-----|-------------|--------|
| **Guest-to-member conversion** | % of guest visitors who sign up for igbo after viewing a job listing | 10%+ |
| **Job-driven signups** | New community members whose first action is on the job portal | Track from launch |
| **Referral-driven applications** | % of applications with "Referred by [Name]" badge | 10%+ (proves community trust layer) |
| **External share rate** | % of job listings shared to WhatsApp/LinkedIn/copy link | Track from launch |

#### Platform Health KPIs

| KPI | Measurement | Target |
|-----|-------------|--------|
| **Job Admin approval time** | Time from job submission to approve/reject decision | < 24 hours |
| **Job posting quality rate** | % of submitted jobs that pass Job Admin review (not rejected for scam/quality) | 85%+ (lower = acquisition problem; higher = review too lenient) |
| **Search-to-apply conversion** | % of job views that result in an application | 5–15% |
| **Portal uptime** | Availability of `job.[domain]` | 99.5%+ |
| **Page load time** | Average page load across portal | < 2 seconds |

### Marketplace Liquidity Metrics

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| **Applications per job** | 8–20 | Demand-side liquidity — enough candidates per opening |
| **Jobs per active employer** | 1.5–3 per month | Supply-side liquidity — employers posting consistently |
| **Applications per active seeker** | 3–10 per month | Engagement liquidity — seekers actively participating |

**Liquidity health check:** If all three metrics are within range, the marketplace is balanced. If applications per job drops below 5 while jobs per employer is high → demand problem (not enough seekers). If applications per job exceeds 30 while jobs per employer is low → supply problem (not enough employers posting).

### Red Flags (Act Immediately)

| Red Flag | Threshold | What It Means | Action |
|----------|-----------|---------------|--------|
| **Jobs with zero applications** | >20% of jobs get 0 applications | Discovery broken or demand missing | Audit search/matching, review job quality, check notification delivery |
| **Applications not viewed** | >40% applications never viewed | Employers disengaged | Employer re-engagement campaign, review notification effectiveness |
| **High applications, low hiring** | Many applications, few hires | Poor matching or low candidate quality | Review matching algorithm weights, audit skill tag quality, survey employers |
| **Employers don't return** | Return rate <25% | No real value delivered | Deep-dive employer interviews, compare to competing channels |
| **Users drop after first apply** | Low repeat applications | Bad experience or no feedback loop | Audit "viewed by employer" signal delivery, review notification tiering |
| **Fake / low-quality jobs** | Scam or misleading posts pass review | Trust layer failing | Retrain Job Admins, add automated screening rules, review approval criteria |
| **Low qualified application rate** | <40% of applications are qualified | Spam problem or matching broken | Tighten skill tag quality, review minimum profile requirements, audit matching threshold |

---

## MVP Scope

**Target Timeline:** 6 weeks

### Core Features (Day One)

#### 1. Job Posting & Admin Approval

- Job creation form with all fields (title, description via WYSIWYG, job type, location type, location, company, salary range, experience level, skills tags, application deadline, JD attachment, cultural skills flag)
- Job types: Full-time, Part-time, Contract, Freelance, Internship, **Apprenticeship**
- Work location: Remote, On-site, Hybrid
- Job statuses: `draft → pending_approval → approved → request_changes → rejected → expired → closed → filled`
- Dedicated `JOB_ADMIN` role (separate from `MODERATOR` and `ADMIN`)
- Job Admin approval queue: approve, reject (with reason), request changes (with feedback)
- Expedited review indicator for previously verified companies
- Job expiry lifecycle: auto-close on expiry date, block new applications, keep visible for 30 days (badge: "Closed"), remove from search after 30 days, employer can renew (no re-approval if no content changes) or close manually, mark as filled on successful hire
- "Expiring in 3 days" notification to employer
- Posting limit: 5 active posts per member (premium tier deferred)

#### 2. Company Profiles

- Inline creation during first job post (not a separate step)
- Minimum required: company name, description (with guiding placeholder), industry (dropdown), company size (dropdown: 1-10, 11-50, 51-200, 200+)
- Optional: logo, culture statement, benefits, banner image
- Company page showing all active listings
- Verification status displayed (earned through first approved job post)

#### 3. Job Seeker Profiles & Resume

- Dedicated job seeker profile: headline, summary, skills, experience, education
- Auto-fill from existing `communityProfiles` (display name, location, interests → skills seed)
- Minimum to apply: display name + location (auto-filled) + 1 skill tag (hard gate)
- Predefined skill library with autocomplete; custom skills allowed but visually distinct
- PDF/DOCX resume upload (S3, max 25MB), multiple versions with labels, default resume selection
- One-click apply using stored profile + default resume
- Progressive completion nudges (3+ skills recommended, headline, resume upload)
- "Open to Opportunities" toggle on profile
- Profile visibility: Public, Members Only, Hidden

#### 4. Application System & ATS

- Internal applications only (no external links)
- Application pipeline: Applied → Under Review → Shortlisted → Interview Scheduled → Offered → Hired / Rejected
- Single-candidate status transitions with optional notes
- `viewed_at` timestamp — set on first employer view, displayed passively to candidate ("Viewed by employer — March 30")
- Candidate list view per job with basic filtering (date, status)
- Application count per job (visible to employer on dashboard)
- Employer dashboard: my active jobs, application counts, unread indicator
- Basic interview scheduling: employer sets date/time manually (no calendar sync)
- Qualified application flag: computed from match score ≥ threshold + valid skills + non-empty profile

#### 5. Smart Matching

- Weighted formula: `score = (skills_overlap × 0.5) + (location_match × 0.3) + (experience_match × 0.2)`
- Skills overlap: Jaccard similarity between job required skills and seeker profile skills (0–1)
- Location match: 1.0 same city, 0.7 same country, 0.5 remote job, 0.3 different country non-remote (0–1)
- Experience match: 1.0 within range, 0.5 within 2 years of range, 0.0 outside (0–1)
- "Jobs for you" section on seeker dashboard (top 10 by score)
- Explainability tags: "Matches 4 of your skills", "Same city", "Experience fits" — human-readable pills, no percentages
- Pure PostgreSQL computed column, no microservice

#### 6. Search & Discovery

- PostgreSQL full-text search (`tsvector`) across job titles, descriptions, skills
- Filters: job type, experience level, salary range, posted date, work location, industry/category
- Search by location (city, country)
- Job listing cards: title, company, location, job type, salary range, posted date, badges
- Job badges: Urgent Hiring (poster-selected), Apprenticeship, Community Referral

#### 7. Apprenticeship Program

- "Apprenticeship" as a job type (same posting flow, additional fields unlocked)
- Additional fields: mentorship duration, skills to be taught, what apprentice receives upon completion
- Two types supported: business-led (structured, pipeline to job) and individual-led (flexible, skill transfer / assistant model)
- Dedicated featured section on portal homepage: hero banner, active apprenticeship cards across industries, success stories carousel, dual CTAs ("Offer an Apprenticeship" / "Find a Mentor")

#### 8. Messaging

- Employer-candidate chat opens after application (not just shortlisting)
- Uses existing igbo chat system (Socket.IO)
- Employer-initiated; both sides can reply once opened
- Conversation threads linked to specific job applications for context

#### 9. Notifications (Tiered)

**Real-time (immediate in-app + email):**
- New application received (employer)
- Application status change (candidate)
- New message from either party
- Job posting approved/rejected/changes requested (employer)
- Interview scheduled (both)

**Daily digest (batched, single email — only sent when content exists):**
- Job expiring soon reminders
- New smart-match recommendations

**In-app only (no email):**
- "Viewed by employer" (passive signal on dashboard, no notification)

#### 10. Referral System

- **Link Sharing (Primary):** Share button on every job listing → WhatsApp, LinkedIn, copy link
- **Named Referral (Light):** "Refer a Member" → select community member → notification sent → "Referred by [Name]" badge visible to employer on application + "You were referred by [Name]" visible to candidate. No points rewards.

#### 11. Guest Access & SEO

- Full job descriptions, salary ranges, company profiles visible to non-members
- Apply button visible → redirects to community signup/login if not authenticated
- Google for Jobs structured data (JSON-LD `JobPosting` schema) on all job listing pages
- Google Analytics on all portal pages

#### 12. Cold Start Flows

- **Job seeker:** Full browsing immediately; persistent banner for profile completion; Apply triggers minimum profile gate; progressive nudges after first application
- **Employer:** Inline company profile creation during first job post; submit together for review

#### 13. Infrastructure & Integration

- Separate subdomain: `job.[domain]`
- SSO via main igbo platform (Auth.js v5, shared session cookies across subdomains)
- Shared PostgreSQL database
- Shared Redis for caching
- Shared Socket.IO for chat messaging
- Shared notification service + EventBus for notification delivery
- Shared file upload infrastructure (S3) for resumes and JD attachments

### Out of Scope for MVP

| Feature | Deferred To | Rationale |
|---------|-------------|-----------|
| **Points escrow system** | Phase 2 | On hold — launch without points economy integration |
| **Elasticsearch** | Phase 2 | PostgreSQL full-text handles 200 jobs/month; defer until scale demands it |
| **AI-powered job matching** | Phase 2 | Insufficient historical data at launch; rule-based matching delivers 90% of value |
| **Bulk ATS actions** | Phase 2 | At 20 applications/job, single-candidate management works fine |
| **Candidate comparison view** | Phase 2 | Nice-to-have; employers can review candidates one by one |
| **Calendar integration** | Phase 2 | Google/Outlook/Apple sync adds weeks of OAuth work; manual scheduling sufficient |
| **Video meeting link auto-generation** | Phase 2 | Employers can share meeting links in chat manually |
| **Interview time slot proposals** | Phase 2 | Manual date/time sufficient for launch volume |
| **Message templates** | Phase 2 | Employers write their own messages at launch |
| **Template-based resume PDF generation** | Phase 2 | Upload + profile-as-resume covers launch needs |
| **Employer analytics dashboard** | Phase 1.5 | Employers need candidates and communication, not dashboards; minimal: application count per job |
| **Job seeker analytics** | Phase 2 | Seekers care about responses, not analytics |
| **Saved searches & alerts** | Phase 2 | Smart matching covers discovery; saved search adds complexity |
| **LinkedIn profile import** | Phase 2 | Manual profile entry + auto-fill from community profile is sufficient |
| **Skill endorsements** | Phase 2 | Trust signals come from verification badges initially |
| **Indeed/Glassdoor syndication** | Phase 3+ | Focus on community-exclusive value first |
| **External company accounts** | Phase 3+ | Community-only at launch |
| **Recruitment agency accounts** | Phase 3+ | Not needed at launch volume |
| **Resume auto-deletion (6-month)** | Phase 2 | Background job; not critical for launch |

### MVP Success Criteria

The MVP is validated and Phase 2 is greenlit when:

| Criteria | Target | Measurement |
|----------|--------|-------------|
| **Jobs posted** | 100+ jobs posted in first 3 months | Cumulative count |
| **Applications flowing** | 8–20 applications per job on average | Rolling 30-day average |
| **Employers returning** | 40%+ employer return rate | % posting again within 30–60 days |
| **Candidates feel seen** | >70% applications viewed within 3 days | `viewed_at` timestamp tracking |
| **First hires happening** | At least 5 successful hires in first 3 months | Jobs marked as "Filled" |
| **Time to first value** | < 48 hours from posting to first qualified application | Median across all approved jobs |
| **Marketplace liquidity** | All three liquidity metrics within range | Applications/job, jobs/employer, applications/seeker |
| **No red flags triggered** | Zero critical red flags sustained for >2 weeks | Red flag dashboard |
| **Platform stability** | 99.5%+ uptime, < 2s page loads | Monitoring |

### Future Vision

**Phase 1.5 (Weeks 7–10):**
- Employer analytics: views per posting, application funnel, time-to-hire
- Enhanced Job Admin tooling: bulk approve/reject, priority scoring for review queue

**Phase 2 (Months 3–6):**
- Points escrow system integration with Platform Wallet
- Elasticsearch for search (when volume justifies)
- AI-powered job matching with historical data
- Bulk ATS actions + candidate comparison view
- Calendar integration (Google, Outlook, Apple)
- Video meeting link auto-generation
- Interview time slot proposals + message templates
- Template-based resume PDF generation from profile
- Job seeker analytics (profile views, success rate, AI suggestions)
- Saved searches with alerts
- LinkedIn profile import
- Skill endorsements from community members
- Resume auto-deletion (6-month retention with notification)

**Phase 3 (Months 6–12):**
- External company accounts with separate onboarding
- Recruitment agency partnerships
- Job syndication to Indeed/Glassdoor
- Weekly email digest of matching jobs
- Virtual career fairs integration with events calendar
- Candidate skill assessments/tests
- Advanced admin analytics (points economy health, hiring trends)

**Phase 4+ (Year 2):**
- Mobile-optimized dedicated job portal experience
- AI-suggested resume improvements and skills gap analysis
- Comparative candidate positioning (anonymized)
- Multi-currency salary display
- White-label job portal for other communities
