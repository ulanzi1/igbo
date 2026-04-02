---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
  - step-12-complete
classification:
  projectType: "Web App (SPA, real-time, subdomain of existing platform)"
  primaryDomain: "Employment Marketplace (two-sided: employers + job seekers)"
  secondaryDomain: "Community Platform (integrated with existing igbo ecosystem)"
  complexity: "high"
  projectContext: "brownfield"
inputDocuments:
  - product-brief-igbo-2026-03-29.md
  - prd.md (existing, reference)
  - project-context.md (reference)
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 0
  projectDocs: 2
workflowType: 'prd'
lastEdited: '2026-03-31'
editHistory:
  - date: '2026-03-31'
    changes: 'Post-validation edits: added 6 marketplace health KPIs (GAP-BC4), 2 new FRs (FR107 cultural skills, FR108 analytics), fixed 7 FR specificity/leakage issues, fixed 7 NFR specificity/leakage issues, added guest discovery journey variant, timeline rationale notes, FR102 orphan trace'
---

# Product Requirements Document - igbo

**Author:** Dev
**Date:** 2026-03-31

## Executive Summary

The **igbo Job Portal** is a community-exclusive employment marketplace that enables members to hire within their own network — keeping economic opportunity circulating inside the community instead of leaking to external platforms.

**The Problem:** Community business owners rely on fragmented channels like WhatsApp and word-of-mouth to hire. Talented members lack visibility into opportunities within their own network. The result is economic leakage — jobs created by the community are filled externally, while internal talent remains underutilized.

**The Solution:** A job portal that enables employers to post roles, receive applications from verified community members, and manage hiring through an integrated system — powered by shared identity, messaging, and trust signals from the igbo platform.

**The Core Principle:** "Discovery is open. Participation is exclusive." Anyone can discover opportunities. Only members can participate — apply, message, and be trusted.

### What Makes This Special

**Verifiable community trust** — the only job platform where trust precedes the transaction. The trust layer is not built from scratch; it is harvested from an existing ecosystem of verified members, engagement history, and shared identity.

**Aha Moment:** An employer posts a job and, within 24–48 hours, receives qualified applications from verified community members — and can immediately engage them. For candidates: "Your application was viewed and responded to."

**Emotional Heart:** The apprenticeship program — a modern revival of Igba Odibo — defines the platform's cultural purpose: connecting opportunity with mentorship and long-term growth.

**Structural Advantages:**

- **Pre-built trust layer** — verified members, identity, engagement history
- **Visible trust signals** — referrals, badges, community context
- **Admin-verified job quality** — JOB_ADMIN review
- **Deep ecosystem integration** — SSO, chat, notifications, profiles
- **Google-discoverable acquisition** — SEO + guest access

**Target Users:**

- **Employers** — diaspora business owners hiring remotely (Emeka, Toronto) and local business owners hiring at volume (Chioma, Lagos)
- **Job Seekers** — early career graduates seeking opportunity (Adaeze, Lagos), experienced professionals seeking trusted employers (Obinna, Abuja), and diaspora remote seekers (Amara, London)
- **Job Admins** — dedicated trust and safety gatekeepers with business judgment who verify every job posting before it goes live
- **Passive Members** — browsers, sharers, and referrers who drive organic growth through link sharing and named referrals
- **Guest Visitors** — non-members who discover jobs via Google or shared links, with a clear path to join when ready to apply

**Timeline:** 12-week MVP, sequenced to validate the core hiring loop by mid-point.

The igbo Job Portal transforms a social network into an economic network — where trust, identity, and opportunity converge to create a self-sustaining hiring ecosystem.

## Project Classification

- **Project Type:** Web App (SPA, real-time, subdomain of existing platform with shared infrastructure via SSO, Socket.IO, PostgreSQL, Redis)
- **Primary Domain:** Employment Marketplace (two-sided: employers + job seekers)
- **Secondary Domain:** Community Platform (deeply integrated with existing igbo social ecosystem)
- **Complexity:** High — two-sided marketplace liquidity, ATS pipeline, admin approval workflows, smart matching, guest SEO, apprenticeship program, integration with existing platform
- **Project Context:** Brownfield — extends the existing igbo platform (12 epics, 4795+ tests) with a new subdomain and shared infrastructure

## Success Criteria

### User Success

**The "Worth It" Moments:**

| Persona | Success Moment | Measurable Signal |
|---------|---------------|-------------------|
| **Employer (Chioma/Emeka)** | "I found the right person without going external" | First qualified application within 24-48 hours of posting |
| **Job Seeker (Adaeze/Obinna)** | "They actually saw my application and responded" | >70% of applications viewed within 3 days |
| **Job Admin** | "I can review the queue efficiently and trust what gets through" | < 24-hour approval time; 85%+ posting quality rate |
| **Passive Member** | "I helped someone in my community get a job" | Referred candidate progresses in pipeline |
| **Guest Visitor** | "This is worth joining for" | 10%+ guest-to-member conversion rate |

**User Success Metrics:**

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Applications per job | 8-20 | Below 5 = demand missing; above 30 = noise problem |
| % of applications viewed | >70% within 3 days | Solves the "black hole" problem |
| % of applications with status change | >50% | Movement = system is alive |
| Time to first response | < 72 hours (view or status change) | Speed determines trust |
| Interview/shortlist rate | 10-25% of applications | Proves matching is working |
| Employer return rate | 40-60% post again within 30-60 days | True product-market fit signal |
| Job fill rate | 25-40% (launch), 40-60% (mature) | Ultimate outcome metric |
| Seeker minimum profile rate | 100% (enforced — display name, location, 1+ skill) | Gate to apply |
| Seeker quality profile rate | 60%+ (3+ skills, headline, resume within 3 months) | Higher-quality profiles improve matching accuracy and employer trust |

### Business Success

**North Star Metric:** Applications per Job (with quality threshold) — 8-20 applications per job posting, where >70% are viewed by the employer within 3 days.

**Launch Ramp (First 3 Months):**

| Month | Jobs Posted | Applications | Notes |
|-------|------------|--------------|-------|
| Month 1 | 30-50 | 300-600 | Seed with community business owners; validate core flows |
| Month 2 | 60-100 | 1,000-2,000 | Word-of-mouth growth; first hires happening |
| Month 3 | 100-150 | 2,000-3,000 | Approaching steady state; employer return rate measurable |

**Steady State (12 Months):** ~200 jobs/month, ~4,000 applications/month, 10+ hires/month, 40%+ employer return rate.

**Platform Cross-Pollination:**

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Profile completion beyond minimum | 50%+ of job-driven signups | Leading indicator — if they won't complete a profile, they won't engage further |
| Engagement with non-portal features | 30%+ within 30 days | Proves the portal feeds the ecosystem, not a silo |
| Portal impact on main platform DAU | Measurable lift in overall DAU | Validates "economic layer deepens engagement" thesis |

**Marketplace Liquidity Health:**

| Metric | Target | Imbalance Signal |
|--------|--------|-----------------|
| Applications per job | 8-20 | < 5 = demand problem; > 30 = supply problem |
| Jobs per active employer | 1.5-3/month | Low = employer disengagement |
| Applications per active seeker | 3-10/month | Low = no engagement; high = desperation |

**Marketplace Health Signals:**

| Metric | Launch Target | Mature Target | Why It Matters |
|--------|--------------|---------------|----------------|
| Seeker cohort retention | 30-40% | 40-60% | Measures whether seekers return after first visit — leading indicator of value |
| Smart match click-through | 15%+ | 20%+ | Validates matching algorithm relevance |
| Chat engagement | 50%+ of shortlisted | 60%+ | Shortlist-to-conversation rate proves employer trust in candidates |
| Search-to-apply conversion | 5-15% | 10-20% | Measures discovery-to-action efficiency |
| External share rate | Track from launch | Establish baseline | Organic growth signal — members sharing jobs externally |
| Referral-driven applications | 10%+ | 15%+ | Validates named referral system ROI |

**Red Flags (Act Immediately):**

| Red Flag | Threshold | Action |
|----------|-----------|--------|
| Jobs with zero applications | >20% of jobs | Audit search/matching, review job quality |
| Applications not viewed | >40% never viewed | Employer re-engagement campaign |
| High applications, low hiring | Many applications, few hires | Review matching weights, audit skill tags |
| Employers don't return | Return rate < 25% | Deep-dive employer interviews |
| Fake/low-quality jobs pass review | Scam posts approved | Retrain Job Admins, add screening rules |
| Job Admin approval bottleneck | Approval time > 48 hours consistently | Activate fast-lane queue (see Week 6 mitigation) |

### Technical Success

| Metric | Target | Measurement |
|--------|--------|-------------|
| Portal uptime | 99.5%+ | Monitoring |
| Page load time | < 2 seconds (global, via CDN) | Lighthouse CI |
| API response time (p95) | < 200ms | Server-side monitoring |
| SSO session handoff | < 1 second, seamless across main and job subdomains on all supported browsers (including Safari strict cookie policies) | Client-side measurement + cross-browser E2E tests |
| Chat message delivery (employer-candidate) | < 500ms | Server-side telemetry |
| Search response time | < 1 second | Client-side measurement |
| DB load from portal | < 15% increase in main platform query latency | Query analysis |
| Existing test suite regression | Zero failures in existing 4795+ tests after portal schema migrations | CI pipeline gate |
| Google for Jobs indexing | Job listings crawled and indexed within 48 hours | Search Console |

### Week 6 Validation Gate

**Goal:** Validate core marketplace loop before committing to full build.

| Metric | Target |
|--------|--------|
| Jobs posted (seeded) | 20-30 |
| Applications per job | ≥ 5 (early signal) |
| Time to first application | < 72 hours |
| Applications viewed rate | > 50% |
| Hires or strong shortlist signals | At least 1-2 (qualitative) |
| Employer feedback | "I would use this again" |

**Decision Outcomes:**

- **PASS** — Continue full build (apprenticeship section, smart matching polish, advanced ATS features, SEO optimization)
- **FAIL** — Stop and fix: discovery, matching, or onboarding. Deploy deferral candidates to buy time.

**Deferral Candidates (If Week 6 Fails):**

Priority deferral order (highest to lowest impact to cut):

1. **Apprenticeship Featured Section** (UI layer only) — Keep apprenticeship as a job type. Remove homepage hero section, carousel, and success stories.
2. **Named Referral System** — Keep link sharing (WhatsApp/LinkedIn/copy). Remove referral badges and named referral flows.
3. **Notification Digest** — Keep real-time notifications only. Remove daily digest batching.
4. **Smart Matching** (reduce complexity, not remove) — Keep basic ranking (skills overlap only). Remove explainability tags and weighted scoring complexity.

**Job Admin Bottleneck Mitigation** (deploy if approval queue becomes the constraint):

- Verified employers → fast-lane queue: auto-approved with option to review later and unapprove
- Repeat trusted employers → reduced scrutiny: auto-approved with option to review later and unapprove
- Twice unapproved after auto-approve → requires approval every time going forward

### MVP Validation Gate (12 Weeks)

Phase 2 is greenlit when:

| Criteria | Target |
|----------|--------|
| Jobs posted | 100+ in first 3 months |
| Applications per job | 8-20 average (rolling 30-day) |
| Employer return rate | 40%+ within 30-60 days |
| Candidates feel seen | >70% applications viewed within 3 days |
| First hires | At least 5 successful hires in first 3 months |
| Time to first value | < 48 hours from posting to first qualified application |
| Marketplace liquidity | All three liquidity metrics within range |
| No red flags sustained | Zero critical red flags for > 2 weeks |
| Platform stability | 99.5%+ uptime, < 2s page loads |

## Product Scope

### MVP — Minimum Viable Product (12 Weeks)

**Core Features (Day One):**

1. **Job Posting & Admin Approval** — creation form, JOB_ADMIN review queue, job statuses, expiry lifecycle, 5-active-post limit
2. **Company Profiles** — inline creation during first post, minimum fields, verification via first approved job
3. **Job Seeker Profiles & Resume** — dedicated profile, auto-fill from community data, skill tags, PDF/DOCX resume upload, one-click apply
4. **Application System & ATS** — internal applications, pipeline stages (Applied → Hired/Rejected), viewed_at transparency, employer dashboard
5. **Smart Matching** — weighted formula (50% skills, 30% location, 20% experience), explainability tags, "Jobs for you" section
6. **Search & Discovery** — PostgreSQL full-text search, filters, job listing cards with badges
7. **Apprenticeship Program** — dedicated job type, additional mentorship fields, featured homepage section with success stories
8. **Messaging** — employer-candidate chat via existing Socket.IO, opens after application
9. **Notifications (Tiered)** — real-time for critical events, daily digest for low-priority, "viewed by employer" passive signal
10. **Referral System** — link sharing (WhatsApp/LinkedIn/copy) + named referral with badge visibility
11. **Guest Access & SEO** — full listings visible, Apply redirects to signup, Google for Jobs JSON-LD, Google Analytics
12. **Cold Start Flows** — progressive seeker profile, inline employer onboarding
13. **Infrastructure** — subdomain SSO, shared PostgreSQL/Redis/Socket.IO/S3/EventBus/notifications

For detailed phasing, timelines, and resource requirements, see **Project Scoping & Phased Development**.
Post-MVP roadmap (Growth, Phase 2+) is defined in that section.

## User Journeys

### Journey 1: Chioma — "Finding the Right People, Fast" (Primary Employer, High Volume)

**Who:** Chioma, 38, restaurant chain owner in Lagos with 4 locations and 60+ employees. Constantly hiring for operational roles — cooks, servers, managers, delivery staff. Currently relies on word-of-mouth and walk-ins with unpredictable quality.

**Opening Scene:** It's Monday morning and Chioma needs a Head Chef for her Lekki location. The last one left two weeks ago and the kitchen is struggling. She's posted in three WhatsApp groups, received 30 messages — half are "I know someone" with no follow-up, the rest are unstructured CVs she can't compare. She has no way to track who applied, who she's spoken to, or who she rejected. She logs into the igbo Job Portal.

**Rising Action:** Chioma clicks "Post a Job." Since this is her first time, the system prompts her to create a company profile inline — company name, description, industry (Food & Hospitality), company size (51-200). She uploads her logo. She fills out the job posting: Head Chef, Full-time, On-site (Lagos - Lekki), salary range ₦350K-₦500K/month, required skills (menu planning, kitchen management, Nigerian cuisine, team leadership), experience level (3-5 years). She submits. The posting enters the JOB_ADMIN review queue.

**The Wait:** Within 18 hours, a Job Admin reviews her posting. Company description checks out — Chioma's community profile shows she's an active Top-tier member with a verification badge. The job details are specific, the salary is plausible for the role and location. Approved. Chioma gets a notification: "Your job posting 'Head Chef — Lekki' is now live."

**Climax:** The first application arrives within 24 hours of the posting going live. By Wednesday — 48 hours later — Chioma has 8 applications. She opens her employer dashboard: each application shows the candidate's display name, location, skills with overlap indicators, verification badge (if any), and community engagement context. She clicks on the first candidate — sees their full profile, headline, experience, and resume. A blue verification badge. She clicks "Message" and the conversation opens instantly in the platform chat she already uses daily. No email thread, no WhatsApp switching. She shortlists 3 candidates in one sitting, messages all three, and schedules interviews — all tracked in the ATS pipeline.

**Resolution:** Chioma hires her new Head Chef within 10 days. The candidate was a community member in mainland Lagos she never knew existed. She closes the job posting and marks it as "Filled." The next week, she posts another role — this time the system remembers her company profile, pre-fills the company fields, and the posting flow takes 3 minutes instead of 10. She tells another business owner at a community gathering: "Stop using WhatsApp for hiring. Use the portal."

**Success Signal:** Receives 8 qualified applications within 48 hours and hires within 10 days.

**Requirements Revealed:**
- Job posting form with all fields (title, description, type, location, salary, skills, experience, deadline)
- Inline company profile creation during first post
- JOB_ADMIN review queue with approve/reject/request-changes
- Employer dashboard with application list, counts, and unread indicators
- Candidate profile view with skills overlap, badges, and engagement context
- In-platform messaging (employer-initiated after application)
- ATS pipeline (Applied → Under Review → Shortlisted → Interview → Offered → Hired/Rejected)
- Job close and "Filled" status
- Returning employer pre-fill and faster posting flow

---

### Journey 2: Adaeze — "My First Real Opportunity" (Primary Job Seeker, Early Career)

**Who:** Adaeze, 22, recent university graduate in Lagos. BSc in Computer Science. Hungry for her first real opportunity but invisible on generic job boards. Less than 2 years of experience. Already an active igbo community member — she joined through her cousin's referral and has been attending virtual events and engaging in groups.

**Opening Scene:** Adaeze opens the igbo platform on a Tuesday evening. She navigates to the Job Portal and sees the "Jobs for you" section on her dashboard. The smart matching has surfaced 6 jobs ranked by relevance. The top one catches her eye: "Junior Software Developer — Remote" posted by an IT consulting firm in Toronto. The explainability tags say: "Matches 4 of your skills," "Remote job," "Experience fits." She clicks through.

**Rising Action:** The full job listing shows everything: role description, salary range (visible and fair), company profile with culture statement, required skills, and a badge — "Apprenticeship Available." She scrolls down and sees: mentorship duration (6 months), skills to be taught (cloud infrastructure, CI/CD pipelines), and what the apprentice receives upon completion (potential full-time offer + professional reference). This isn't just a job — it's a launchpad.

Adaeze clicks "Apply." Since she already has a community profile, her display name and location are pre-filled. She has 2 skill tags from her profile setup. The system prompts: "Add at least one more skill to improve your match score." She adds "Python," "React," and "Git" from the autocomplete library. She selects her default resume (uploaded last week as a PDF). One-click apply. Done.

**The Turning Point:** Two days later, Adaeze checks her application status. She sees: "Viewed by employer — Thursday, March 27" — viewed within 72 hours, target met. Her heart jumps. Someone actually looked at her application. No black hole. On Friday, her status changes to "Under Review." On Monday, a chat notification: the employer has messaged her directly through the platform. "Hi Adaeze, your profile looks promising. Can we schedule a 30-minute video call this week?"

**Climax:** Adaeze has her interview. She's shortlisted. A week later, she receives an offer for the 6-month apprenticeship with a path to full-time. She accepts through the platform. Her application status moves to "Hired."

**Resolution:** Adaeze starts her first professional role — mentored by a diaspora business owner who wanted to hire from within the community. She tells her university friends: "You don't have to leave Nigeria to access the global community. The opportunities are right here." She writes her first article on igbo about the experience.

**Success Signal:** Application viewed within 3 days and receives direct employer message within 5 days.

**Cold Start Variant:** If Adaeze had no job seeker profile, she would still be able to browse all jobs immediately. On clicking "Apply," she would be prompted to complete a minimal profile (display name, location, 1 skill tag) before proceeding. Progressive nudges after her first application would encourage her to add more skills, a headline, and upload a resume — improving her match quality and employer trust over time.

**Guest Discovery Variant:** A non-member discovers a "Junior Software Developer — Remote" listing via Google search. They land on the full job listing page — salary, company profile, skills, and description all visible. They click "Apply." The system redirects them to the community signup page with a return URL. After completing registration and minimum profile setup, they're redirected back to the job listing to complete their application. The guest-to-member conversion is tracked as an acquisition channel.

**Requirements Revealed:**
- Smart matching with "Jobs for you" section and explainability tags
- Full job listing view with salary, company profile, skills, badges
- Apprenticeship-specific fields visible on listing (duration, skills taught, completion benefits)
- One-click apply with pre-filled profile data and default resume
- Progressive profile nudges (add more skills)
- Application status tracking with "viewed_at" transparency
- Employer-candidate messaging after application
- Status change notifications (real-time)
- Cold start flow: browse freely, minimal profile gate on Apply, progressive completion

---

### Journey 3: Apprenticeship Flow — Mentor and Apprentice (Emeka + Adaeze)

**Who:** Emeka, 42, IT consulting firm owner in Toronto. Wants to give back by mentoring a junior community member. Adaeze, 22, the early career seeker from Journey 2.

**The Posting:** Emeka selects "Apprenticeship" as the job type when creating his posting. Additional fields unlock: mentorship duration (6 months), skills to be taught (cloud infrastructure, CI/CD, production deployment), what the apprentice receives upon completion (professional reference, portfolio of production work, potential full-time conversion). He flags it as business-led (structured, pipeline to job). The posting appears in the dedicated apprenticeship featured section on the portal homepage alongside other active apprenticeships across industries.

**The Application:** Adaeze discovers the apprenticeship through the featured homepage section — a hero banner showcasing active apprenticeships with a CTA: "Find a Mentor." She applies with one click. Emeka receives the application within hours, with her profile, skills, and community context visible.

**The Conversation:** Emeka messages Adaeze through the platform: "I'd like to understand your goals and see if this is a good mutual fit." They have a video call. Emeka sets expectations: 15 hours/week, weekly check-ins, real project work. Adaeze is clear on what she wants to learn. He moves her to "Offered."

**The Outcome:** Six months later, Adaeze has a portfolio of production work, a professional reference from a diaspora business owner, and a full-time offer. Emeka has a trusted junior developer trained in his systems. The success story is featured in the apprenticeship carousel — inspiring the next mentor and the next apprentice.

**Success Signal:** Apprenticeship completed with measurable skill transfer and employment outcome.

**Requirements Revealed:**
- Apprenticeship as a job type with additional fields (duration, skills taught, completion benefits)
- Business-led vs. individual-led apprenticeship types
- Dedicated featured section on portal homepage (hero banner, active cards, success stories, dual CTAs)
- Standard application and ATS flow applies to apprenticeships
- Messaging for expectation-setting before formal offer

---

### Journey 4: Repeat Employer Flow — Trusted Path (Chioma's 5th Posting)

**Who:** Chioma again — three months later. She's posted 4 jobs, all approved, 2 successful hires. She's now a verified, trusted employer.

**The Flow:** Chioma clicks "Post a Job." Her company profile is pre-filled — no setup needed. She selects a previous posting as a template, adjusts the title and location, and submits. Because she's a verified employer with a clean track record, her posting enters the fast-lane queue: auto-approved with a flag for optional later review. The job is live within minutes, not hours. Her first application arrives within 24 hours.

**The Difference:** No 18-hour wait. No anxiety about whether the posting will be approved. The system rewards trust built through consistent behavior. Chioma's employer dashboard now shows 4 active postings, application counts, and an unread indicator for new candidates. She manages all hiring from one screen.

**The Guardrail:** If a Job Admin later reviews one of Chioma's auto-approved postings and finds an issue (misleading salary, changed role description), they can unapprove it. If this happens twice, Chioma's fast-lane status is revoked — all future postings require approval. Trust is earned and can be lost.

**Success Signal:** Job posted and live within minutes. First qualified application within 24 hours. Zero approval friction for trusted employers.

**Requirements Revealed:**
- Returning employer pre-fill (company profile, posting templates)
- Fast-lane auto-approval for verified/trusted employers
- Optional later review with unapprove capability
- Twice-unapproved → permanent approval requirement
- Employer dashboard with multi-job management

---

### Journey 5: Job Admin Review and Rejection Flow (Edge Case)

**Who:** Kene, 35, dedicated Job Admin. Not a community content moderator — an economic gatekeeper with business judgment trained in trust and safety.

**Opening Scene:** Kene opens the Job Admin queue on a Thursday morning. 6 postings pending review. The first 4 are straightforward: known employers, plausible salaries, specific role descriptions. Approved in under 2 minutes each.

**The Suspicious Posting:** The 5th posting raises flags. "Remote Marketing Manager — $200K" from a company Kene has never seen. The company profile was created minutes ago with a generic description: "Global marketing solutions." No logo. The poster's community profile shows they joined 2 weeks ago with minimal engagement. The salary is unusually high for the described role.

**Investigation:** Kene checks the posting details. The job description is vague — copy-pasted language, no specific responsibilities. The required skills are generic ("marketing," "communication"). The application deadline is in 3 days — unusually short, often a scam signal. Kene clicks "Request Changes" and sends feedback: "Please provide a more detailed job description with specific responsibilities, clarify the salary range for this role level, and extend the application deadline to at least 2 weeks."

**Escalation:** The poster resubmits with minimal changes — still vague, salary unchanged. Kene rejects the posting with reason: "This posting does not meet our quality standards. The job description lacks specific responsibilities and the compensation appears inconsistent with the described role level." The rejection reason is visible to the poster. If a posting is flagged or reported by community members, it bypasses the normal queue and is prioritized for immediate review.

**Pattern Recognition:** Kene notices this is the third suspicious posting from recently-joined members with minimal community engagement this week. She flags the pattern for the platform admin team — potential coordinated scam targeting. The audit log captures all review decisions with timestamps. Between reviews, Kene spends a few minutes curating the skill tag library — promoting a frequently-used custom tag ("cloud infrastructure") to the official list and merging two duplicate tags ("NodeJS" and "Node.js").

**Success Signal:** Reviews 6 postings in under 20 minutes with high confidence. Suspicious posting caught and rejected. Zero scam postings reach job seekers.

**Requirements Revealed:**
- Job Admin review queue with posting details and poster context
- Request Changes flow with feedback to poster
- Rejection with visible reason
- Poster resubmission capability
- Flagged/reported postings prioritized for immediate review
- Audit log of all review decisions
- Pattern recognition signals (new accounts, minimal engagement, unusual salary, vague descriptions)
- Escalation path to platform admin team
- Skill tag library curation (promote, merge, remove)

---

### Journey 6: Alternative Entry — Referred Candidate (Short Journey)

**Who:** Nkem, 27, software developer in Abuja. Not actively looking. His community elder shares a job link with a named referral.

**The Flow:** Nkem clicks the shared link, lands on the full job listing (discovery is open). He's already a community member, so he's authenticated. He clicks Apply. His application carries a badge: "Referred by Chief Okonkwo" — visible to the employer. Nkem sees: "You were referred by Chief Okonkwo." Both sides know the connection. The hiring flow proceeds as normal.

**Success Signal:** Referral badge visible on application. Employer uses it as a trust signal in shortlisting decision.

**Requirements Revealed:**
- Share button on job listings (WhatsApp, LinkedIn, copy link)
- "Refer a Member" named referral flow
- Referral badge visible to both employer and candidate
- Standard application flow applies after referral entry

---

### Journey Requirements Summary

| Journey | Key Capabilities Revealed |
|---------|--------------------------|
| **Chioma (High-Volume Employer)** | Job posting, inline company profile, JOB_ADMIN review, employer dashboard, ATS pipeline, in-platform messaging, job close/filled |
| **Adaeze (Early Career Seeker)** | Smart matching, one-click apply, profile auto-fill, viewed_at transparency, cold start flow, progressive profile completion |
| **Apprenticeship (Emeka + Adaeze)** | Apprenticeship job type, additional fields, featured homepage section, standard ATS applies |
| **Repeat Employer (Chioma Trusted)** | Pre-fill, posting templates, fast-lane auto-approval, unapprove guardrail, multi-job dashboard |
| **Job Admin Edge Case (Kene)** | Review queue, request changes, rejection with reason, flagged post priority, audit log, pattern escalation |
| **Referred Candidate (Nkem)** | Share buttons, named referral, referral badge visibility (both sides) |

## Domain-Specific Requirements

### Platform Role & Legal Framing

**igbo is a connection platform, not an employer.** The portal facilitates introductions between community employers and job seekers. igbo does not employ, contract, or compensate any party. All employment relationships are between employer and candidate directly.

**Product hooks for legal team:**
- Terms of service must state platform role explicitly (connection marketplace, not employer/agency)
- Jurisdiction disclaimer on all job listings: "Employment terms are between employer and candidate. Laws vary by jurisdiction."
- Privacy policy must cover job portal data (resumes, applications, employer data) as an extension of the main platform policy

### Salary & Compensation Requirements

- All job postings must include a salary or compensation range (minimum and maximum). Postings without compensation information are rejected at form validation — not a Job Admin judgment call.
- Salary currency must be specified (dropdown: NGN, USD, GBP, EUR, CAD, other)
- For roles without fixed salary (e.g., contract, commission-based, apprenticeship), compensation structure must still be specified (e.g., hourly rate range, stipend range, commission model description). "Negotiable" alone is not allowed.
- Job Admins evaluate salary plausibility relative to role, location, and experience level — but do not enforce specific salary floors or ceilings

### Non-Discrimination Rules

- Job postings must not contain discriminatory language based on gender, age, religion, disability, marital status, or ethnicity beyond community membership
- The platform may reject postings that specify protected characteristics as requirements (e.g., "male only," "under 30")
- Job Admin training materials must include non-discrimination review criteria
- Community membership is the only exclusivity criterion — within the community, all members have equal access to apply for any posted role

### Matching Fairness Constraints

- Smart matching algorithm uses only: skills overlap, location proximity, and experience level
- Matching must NOT use: age, gender, profile photo, verification badge level, membership tier, or points balance as matching inputs
- Matching must not penalize candidates for incomplete profiles beyond minimum requirements — low completeness affects ranking position but does not exclude candidates from results
- Matching weights are transparent and documented (50% skills, 30% location, 20% experience)
- No candidate is excluded from search results based on matching score — low-match candidates appear lower in ranking but are never hidden

### Prohibited Job Categories

The following job types are prohibited and must be rejected by Job Admin:

- Jobs requiring upfront payment or fees from candidates (fee-for-employment schemes)
- Multi-level marketing (MLM) or pyramid scheme recruitment
- Jobs with no clear employer or company identity
- Jobs requiring personal financial information (bank details, credit card) as part of the application
- Jobs offering compensation exclusively in cryptocurrency or non-standard payment methods
- Duplicate mass-postings of the same role across multiple listings
- Jobs that are illegal in the jurisdiction of the employer or target candidate location

### Data Retention & Deletion

**Application data:**
- Active applications (job still open): retained for the duration of the job posting
- Closed job applications: retained for 12 months after job closure for employer reference, then automatically purged
- Rejected applications: retained for 6 months after rejection, then purged
- Candidate can delete their own applications at any time (hard delete — removed from employer view)

**Resume data:**
- Resumes stored in S3 with server-side encryption
- Candidates can delete any resume at any time (immediate removal from storage)
- If a candidate deletes their account (GDPR right to deletion), all resumes and applications are purged within the existing 30-day deletion window
- No resume data is retained after account deletion

**Employer data:**
- Company profiles are retained as long as the employer's community account is active
- If an employer deletes their community account, company profile is anonymized (company name replaced with "Deleted Company"), active job postings are closed, and application data follows candidate retention rules above

### Resume Access Rules

- Employers can view resumes only for candidates who have applied to their job postings — no browsing of candidate resumes without an application
- Resume access is retained for 180 days after a job is closed/filled (employers may revisit past applicants for future openings), then revoked automatically
- Note: employers may have already downloaded resumes locally — platform access revocation does not affect locally stored copies
- Job Admins may review candidate data only in cases of reported abuse, fraud investigation, or escalation from platform admins — with audit log entry
- Platform admins can access resume data only for dispute resolution or abuse investigation, with audit log entry

### Job Admin Enforcement Rules

**Review authority:**
- Job Admins review job postings only — they do not review candidate profiles, applications, or resumes (except in escalated abuse/fraud cases)
- Review scope: job description quality, salary plausibility, company legitimacy, non-discrimination compliance, prohibited category screening
- Job Admins can: approve, reject (with reason), or request changes (with feedback)
- All review decisions are logged in the audit system with timestamp, admin ID, and action

**Escalation:**
- Flagged or reported postings bypass normal queue and are prioritized for immediate review
- Pattern concerns (multiple suspicious postings from similar accounts) are escalated to platform admin team
- Job Admins can flag an employer for platform admin review but cannot ban community members (that remains a platform admin function)

**Fast-lane rules:**
- Verified employers (first approved posting + clean history): auto-approved, optional later review
- Repeat trusted employers (3+ approved postings, zero unapprovals): auto-approved, reduced scrutiny
- Twice unapproved after auto-approve: fast-lane revoked, all future postings require approval
- Fast-lane status is per-employer, tracked in system, visible to Job Admin
- **Safety override:** Any flagged or reported posting bypasses fast-lane privileges and requires manual review regardless of employer status

### Trust Architecture Summary

The portal relies on **behavioral rules enforced through product design** rather than legal complexity. Trust is enforced through product constraints and behavioral rules rather than algorithmic opacity or post-hoc moderation.

| Trust Layer | Mechanism |
|-------------|-----------|
| **Candidate trust** | Community verification badges, engagement history, named referrals |
| **Employer trust** | Job Admin review, company verification through first approved posting, fast-lane earned through track record |
| **Job quality** | Mandatory compensation disclosure, prohibited categories, non-discrimination rules, Job Admin judgment |
| **Data trust** | Resume access limited to applicants only, time-bound retention (180 days post-close), candidate-controlled deletion |
| **Matching trust** | Transparent weights, no hidden ranking factors, no penalty for incomplete profiles beyond minimum, fairness constraints on excluded attributes |
| **System trust** | Audit logs on all admin actions, flagged posts override fast-lane, escalation paths documented |

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. Trust-Harvested Marketplace (Structural Innovation)**

The igbo Job Portal inverts the standard marketplace trust problem. Every two-sided marketplace must solve trust: "Can I trust this employer? Can I trust this candidate?" Existing platforms build trust from scratch — reviews, ratings, verification badges earned within the platform. The igbo Job Portal harvests trust from an existing community ecosystem where trust precedes the transaction (see Executive Summary).

This is not a feature — it's a structural advantage that cannot be replicated by a greenfield job platform.

**2. Hybrid Access Model (Strategic Innovation — "Discovery is open. Participation is exclusive.")**

Most marketplaces are either fully open (Indeed, LinkedIn) or fully gated (internal job boards). The igbo Job Portal defines a third path: full transparency on content (job descriptions, salary ranges, company profiles visible to anyone, indexed by Google) combined with community exclusivity on participation (only members can apply, message, and be trusted). Every job listing simultaneously serves the community and recruits new members.

The open layer funds the growth of the exclusive layer. Every Google-indexed job listing is a paid acquisition channel that costs zero. The structural innovation (trust) powers the product; the strategic innovation (hybrid access) powers the business.

**3. Cultural Apprenticeship at Platform Scale**

The modernization of Igba Odibo — the traditional Igbo apprenticeship system — through a digital employment platform is novel. No existing job portal or community platform has attempted structured, cross-industry apprenticeship facilitated at community scale. A software engineer in Houston mentoring a junior in Lagos represents a new model of cultural-economic connection.

**Design principle:** The apprenticeship section must feel like a community bulletin board of mentorship happening right now — not a filtered job search. Success stories with photos and quotes. Active apprenticeship cards showing the mentor's face, the skill being taught, and the time commitment. "Emeka in Toronto is teaching cloud infrastructure. 3 months in." If the section feels like a job board, it fails. If it feels like a living cultural program, it succeeds.

**4. Community-Exclusive Employment as Ecosystem Extension**

The portal is not a standalone product — it's an economic layer added to an existing social platform. Shared authentication, chat, notifications, profiles, and file uploads mean the portal inherits the entire infrastructure and behavioral patterns of the community. This "ecosystem extension" model is distinct from building a job board and bolting community features onto it.

### Competitive Landscape

| Existing Solution | What It Does | What It Misses |
|-------------------|-------------|----------------|
| **LinkedIn** | Professional networking + job matching at scale | No community trust layer, no cultural context, no apprenticeship model, algorithmic opacity |
| **Indeed** | High-volume job aggregation | No trust signals, no community identity, "black hole" application experience |
| **Jobberman / BrighterMonday** | Dominant African job boards — where Chioma and Adaeze currently go | Generic platforms, no community exclusivity, no pre-built trust layer, no cultural context |
| **WhatsApp/Telegram community hiring** | The incumbent *behavior* — group admin posts "My company is hiring, DM me" | No structure, no tracking, no ATS, no searchability, no persistence. But it's fast, free, and already embedded in community behavior. **The portal must be easier than composing a WhatsApp message — or beat it so decisively on what happens after posting that the overhead is worth it.** |
| **Mighty Networks + job board plugin** | Community platform with job features | Bolted-on, not woven-in; no shared identity/trust layer for employment; no apprenticeship model |

**No competitor combines:** pre-built community trust + employment marketplace + cultural apprenticeship + hybrid open/exclusive access model.

### Validation Approach

| Innovation | Validation Method | Success Signal |
|-----------|-------------------|----------------|
| **Trust-harvested marketplace** | Week 6 validation gate — do employers engage with candidates faster than on generic platforms? | Time to first view < 48 hours; application-to-shortlist conversion rate 10-25% (vs. 5-10% industry benchmark on generic platforms — 2-5x improvement proves trust layer works) |
| **Hybrid access model** | Track guest-to-member conversion from job listings | 10%+ of guest visitors who view a job listing sign up for the community |
| **Cultural apprenticeship** | Launch with 5-10 apprenticeship postings; track completion and outcomes | At least 3 apprenticeships active within first 3 months; qualitative mentor/apprentice feedback |
| **Ecosystem extension** | Measure cross-pollination: portal users engaging with core platform features | 30%+ of portal users active in non-portal features within 30 days |

### Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Trust layer doesn't translate to hiring** | Employers don't value community signals in hiring decisions | Week 6 gate validates this explicitly; track application-to-shortlist rate vs. industry benchmark; if trust signals aren't valued, simplify to basic job board features |
| **WhatsApp behavior is too entrenched** | Employers default to WhatsApp because it's faster | Job posting flow must be completable in < 5 minutes (first time) and < 2 minutes (returning); beat WhatsApp on what happens *after* — structured applications, ATS tracking, messaging, transparency |
| **Apprenticeship low adoption** | Featured section is empty, undermining cultural positioning | Seed with 5-10 apprenticeships from known community leaders; apprenticeship is a deferral candidate if adoption is low |
| **Hybrid access attracts spam applicants** | Guest discovery leads to low-quality signups who apply for everything | Apply button requires community membership (gate); minimum profile requirements filter quality; Job Admin reviews postings, not applications |
| **Ecosystem extension creates coupling risk** | Portal issues affect main platform stability | Separate subdomain, shared DB with query load monitoring, existing test suite regression gate |

## Web App Specific Requirements

### Architecture Overview

The Job Portal is a **separate Next.js application** deployed at `job.[domain]`, sharing infrastructure with the main igbo platform via a **monorepo architecture**:

- **Separate deployment** — independent Next.js app with its own build, routing, and deployment pipeline
- **Shared database** — same PostgreSQL instance, shared schema for auth, profiles, chat; portal-specific tables for jobs, applications, companies
- **Shared authentication** — Auth.js v5 with session cookies scoped to `.[domain]` for cross-subdomain SSO
- **Shared UI components** — common component library extracted to monorepo package (shadcn/ui primitives, design tokens, layout components)
- **Shared services** — Redis, Socket.IO, EventBus, notification system, file upload infrastructure (S3)
- **Independent scaling** — portal can scale independently of the main platform

### Architectural Constraints

**SSO & Cookie Strategy (Mandatory):**
- Login always happens on the apex domain (`[domain]`), never on the portal subdomain — this avoids Safari ITP cookie expiry (7-day cap on cross-subdomain cookies)
- Portal implements silent token refresh against the main domain's auth endpoint for sessions approaching expiry
- Session cookies set with domain `.[domain]` (dot-prefixed for subdomain sharing)
- Login/logout on either subdomain affects both (single sign-on, single sign-out)
- CSRF token validation must account for cross-subdomain Origin headers

**Database Migration Ownership (Mandatory):**
- Single migration pipeline owned by `@igbo/db` shared package
- Both apps consume the same schema; only one CI pipeline runs migrations against the database
- Portal adds migrations to the same sequence as the main platform (next migration number continues from the shared counter)
- No app-specific migration pipelines — all schema changes flow through `@igbo/db`

**Shared Package Boundaries:**
- `@igbo/ui` — shadcn/ui primitives, design tokens, layout components, shared form elements
- `@igbo/db` — schema definitions, query builders, migration pipeline
- `@igbo/auth` — Auth.js configuration, session utilities, permission helpers
- `@igbo/config` — shared environment variables, type definitions, constants
- Portal-specific components (JobCard, ATSPipeline, SkillTagInput) live in `apps/job-portal/` — moved to shared only when cross-app consumption is needed
- Shared package changes trigger tests in ALL consuming apps (CI enforced)

**Environment Variables:**
- Shared: `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `S3_*` credentials
- Portal-specific: `NEXT_PUBLIC_JOB_PORTAL_URL`, `GOOGLE_ANALYTICS_ID` (portal), portal-specific feature flags
- All env vars validated at build time via `@t3-oss/env-nextjs` — missing var = build failure, not runtime surprise

**EventBus Integration:**
- Portal events (new application, status change, job approved/rejected) must be registered in the EventBus bridge
- Existing Socket.IO server authenticates portal connections using shared session data
- Portal-originated events follow the same `domain.action` naming convention (e.g., `job.applied`, `application.statusChanged`, `job.approved`)

### Browser Matrix

Inherits the main platform browser matrix:

| Browser | Minimum Version | Platform |
|---------|----------------|----------|
| Chrome | Last 2 versions | Desktop, Android |
| Firefox | Last 2 versions | Desktop, Android |
| Safari | Last 2 versions | Desktop, iOS |
| Edge | Last 2 versions | Desktop |
| Samsung Internet | Last 2 versions | Android |

**Critical:** Cross-subdomain SSO must be validated with E2E tests across all supported browsers, with explicit Safari ITP test cases.

### Responsive Design — Hybrid Mobile/Desktop Strategy

**Job Seekers (Primary = Mobile):**
- Browse, search, apply, and chat must be mobile-first: fast, simple, thumb-friendly
- Job listing cards optimized for single-column mobile layout
- Apply flow completable with one hand on a phone
- Minimum 44px tap targets on all interactive elements

**Employers (Primary = Desktop):**
- ATS dashboard, candidate review, and bulk management optimized for desktop screen space
- Structured UI with tables, side panels, and multi-column layouts
- Must still work on mobile — but not optimized for heavy ATS workflows on small screens
- Mobile employer experience: view notifications, read applications, send messages — not manage full pipeline

**Network Resilience (Mobile):**

The application degrades gracefully under poor or unstable network conditions.

- Job browsing displays skeleton loaders and fallback states during slow connections
- Application submission failures present a clear error with retry option
- No offline submission queueing is implemented in MVP
- Full offline support (PWA capabilities) is deferred to Phase 2

**Breakpoints:** Mobile (< 768px), Tablet (768-1024px), Desktop (> 1024px) — consistent with main platform.

### SEO Strategy

**Tier 1 — Critical (aggressive optimization):**
- Individual job listing pages — server-side rendered, Google for Jobs JSON-LD `JobPosting` schema
- Job search/browse pages — SSR with proper heading hierarchy, canonical URLs
- Sitemap.xml generation for all active job listings (updated daily)
- robots.txt: index job listings and public browse pages, block authenticated areas

**Tier 2 — Important (indexed, not aggressively optimized):**
- Company profile pages — SSR, basic structured data (Organization schema), indexed
- Apprenticeship listings — SSR, indexed alongside regular job listings
- Portal homepage — SSR with featured apprenticeships and job categories

**Not indexed:**
- Employer dashboard, ATS, candidate management
- Job seeker profiles, application status pages
- All authenticated-only pages

**Canonical URLs & Duplicate Protection:**
- Each job listing has a single canonical URL: `job.[domain]/jobs/[slug]`
- If the same job is accessible via search results, category pages, or direct link — all point to the canonical URL via `<link rel="canonical">`
- No duplicate content across portal and main platform — job content lives exclusively on the portal subdomain
- Query parameter variations (filters, pagination) use `rel="canonical"` pointing to the base listing URL

**Job Expiry SEO Handling:**
- Expired jobs return HTTP 410 (Gone) — signals to Google that the page is intentionally removed
- Expired job pages show "This position has been filled/closed" with links to similar active jobs (good UX + internal linking for SEO)
- Google for Jobs structured data removed from expired listings (prevents stale search results)
- Expired jobs remain in sitemap for 7 days with `<lastmod>` updated, then removed

**SEO implementation:**
- Open Graph and Twitter Card meta tags on all public pages (for WhatsApp/LinkedIn sharing)
- hreflang tags for bilingual job listings (English + Igbo)
- Structured salary data in JSON-LD (Google for Jobs requires it)
- Dynamic meta descriptions per job listing (title, company, location, salary range)

### Real-Time Requirements

**Required real-time events (MVP):**

| Event | Recipient | Delivery |
|-------|-----------|----------|
| New application received | Employer | Immediate in-app notification via existing notification system |
| Application status change | Candidate | Immediate in-app notification |
| New message | Both parties | Already handled via existing Socket.IO chat |
| Job posting approved/rejected | Employer | Immediate in-app notification |

**Idempotency & Deduplication:**
- All real-time notifications must be idempotent — if the same event is delivered twice (network retry, EventBus replay), the recipient sees it once
- Notification deduplication key: `{eventType}:{targetUserId}:{sourceEntityId}:{timestamp_bucket}` (bucket = 60-second window)
- Client-side deduplication as secondary guard: dismiss duplicate notifications matching the same entity within 5 seconds

**Not in MVP:**
- Live application count updates on employer dashboard (nice-to-have, post-MVP)
- "Someone is viewing your job" — skip entirely

**Architecture:** All real-time events flow through the existing EventBus → notification system → Socket.IO delivery chain. No new real-time infrastructure required for the portal.

### Performance Targets & Budgets

**Performance Targets:**

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Job listing page load | < 2 seconds | Directly impacts SEO ranking and Google for Jobs eligibility |
| Apply flow completion | < 30 seconds (from click "Apply" to submission) | Conversion rate — every second of friction loses candidates |
| Time to Interactive (TTI) | < 3 seconds | Mobile seekers on slower connections must reach interactive state fast |
| First Contentful Paint (FCP) | < 1.5 seconds | Google Core Web Vitals — affects search ranking |
| Largest Contentful Paint (LCP) | < 2.5 seconds | Core Web Vitals |
| Cumulative Layout Shift (CLS) | < 0.1 | Core Web Vitals — job listing cards must not shift during load |
| Search results display | < 1 second | PostgreSQL full-text search response time |
| API response time (p95) | < 200ms | Consistent with main platform targets |

**Performance Budgets (enforced in CI):**

| Budget | Limit | Enforcement |
|--------|-------|-------------|
| Initial route JavaScript bundle | < 150 KB gzipped, with non-critical features loaded via dynamic imports | Lighthouse CI budget check |
| Total page weight (job listing) | < 500 KB | Lighthouse CI |
| Third-party scripts | < 50 KB (Google Analytics only) | Bundle analysis |
| Image assets per page | < 200 KB (WebP/AVIF, responsive srcset) | Build pipeline |
| Lighthouse Performance score | ≥ 90 (mobile) | CI gate — PR blocked if below threshold |

**Search Relevance Fallback:**
- If PostgreSQL full-text search returns zero results, fall back to partial match (prefix matching on job titles and skills)
- If partial match also returns zero, display: "No exact matches found. Here are recently posted jobs in [your location/category]" — never show an empty page
- Search suggestions: "Did you mean...?" for common misspellings in job titles and skills

### Accessibility

Inherits main platform WCAG 2.1 AA compliance targets. Portal-specific considerations:

- Job listing pages must be screen-reader compatible (proper heading hierarchy, ARIA labels on status badges, semantic HTML for salary/location/skills)
- Apply flow must be fully keyboard-navigable
- Skill tag autocomplete must be accessible (ARIA combobox pattern)
- ATS pipeline status changes must be announced to screen readers
- Color-coded status badges must have text labels (not color-only differentiation)

**Error Handling Accessibility:**
- All form validation errors must be announced to screen readers via ARIA live regions
- Error messages must be associated with their input fields via `aria-describedby`
- Focus must move to the first error field on form submission failure
- Network error states (submission failed, connection lost) must be announced via ARIA alerts, not just visual indicators

### Deployment & Operations

**Zero-Downtime Deployment (Mandatory):**
- Portal deploys must use rolling updates — no downtime during deployment
- Database migrations must be backward-compatible (additive only — new columns nullable, new tables only; destructive changes via multi-phase migration)
- If a migration requires breaking changes, deploy in phases: (1) add new schema, (2) deploy code that uses new schema, (3) remove old schema in next release
- Health check endpoint at `/api/health` — load balancer drains connections before killing old container

**Deployment architecture:**
- Separate Docker container for job portal
- Shared PostgreSQL and Redis instances
- Shared Socket.IO server (portal connects as additional client)
- Independent CI/CD pipeline (portal changes don't redeploy main platform)
- DNS: `job.[domain]` → portal container; `[domain]` → main platform container

**CI/CD Requirements:**
- Portal PRs must pass both portal test suite AND existing main platform test suite — cross-app regression gate
- Changes to shared packages (`@igbo/ui`, `@igbo/db`, `@igbo/auth`, `@igbo/config`) trigger tests in ALL consuming apps
- Lighthouse CI performance budget checks on portal PRs
- Schema migration validation: new migrations must not break existing queries (tested via main platform test suite)

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Experience MVP — Core Loop First

The igbo Job Portal's MVP is not about shipping the most features. It's about proving one thing: **the core hiring loop works inside a community trust layer.** If an employer can post a job, receive qualified applications from verified members, and hire — faster and with more confidence than WhatsApp — the platform has product-market fit. Everything else is amplification.

**Sequencing Principle:** Core Loop First — validate the employer-posts → candidate-applies → employer-hires cycle before investing in discovery, matching intelligence, or cultural features. The Week 6 Validation Gate is the explicit checkpoint.

### Phase 0: Monorepo Migration (Pre-MVP Prerequisite)

**Duration:** 2-3 weeks
**Purpose:** Extract shared infrastructure into monorepo packages before portal development begins.

**Deliverables:**
- Monorepo structure established (Turborepo or Nx)
- `@igbo/db` — shared schema, queries, migration pipeline
- `@igbo/auth` — Auth.js configuration, session utilities, permission helpers
- `@igbo/ui` — shared shadcn/ui primitives, design tokens, layout components
- `@igbo/config` — shared environment variables, type definitions, constants
- Cross-subdomain SSO validated (apex-domain login, silent refresh, Safari ITP tested) — must include Safari iOS 17+ in both browser and PWA contexts
- CI pipeline setup as explicit deliverable: shared package changes trigger tests in all consuming apps, cross-app regression gates enforced
- All existing test mocks validated against new monorepo import paths (no silent test breakage from path changes)
- Existing 4795+ tests passing in new monorepo structure (zero regression)
- Monorepo must be additive — main platform must remain fully operational as a standalone app throughout and after migration (no hard dependency on portal app existing)

**Exit Criteria:** Main platform fully functional in monorepo structure. Cross-subdomain session sharing works across all supported browsers including Safari iOS 17+ (browser + PWA). CI pipeline enforces cross-app test gates. All existing mocks validated against new import paths.

### Phase 1: MVP (12 Weeks)

> **Timeline Note:** The product brief targeted a 6-week MVP. During PRD elaboration, the scope expanded to 12 weeks (Phase 1a + 1b) to accommodate the two-sided marketplace validation strategy: Phase 1a (weeks 1-6) validates the core hiring loop via the Week 6 gate, while Phase 1b (weeks 7-12) adds discovery, trust signals, and cultural features only after the core loop is proven. This is a deliberate sequencing decision, not scope creep.

#### Phase 1a: Core Hiring Loop (Weeks 1-6)

**Goal:** Validate the fundamental marketplace loop — post, apply, hire.

**Must-Have Capabilities:**
1. **Job Posting & Admin Approval** — creation form, JOB_ADMIN review queue (approve/reject/request changes), job statuses, expiry lifecycle
2. **Company Profiles** — inline creation during first post, minimum fields, logo upload
3. **Job Seeker Profiles** — dedicated profile with auto-fill from community data, skill tags, resume upload (PDF/DOCX)
4. **Application System** — one-click apply, application tracking, viewed_at transparency
5. **Basic ATS** — pipeline stages (Applied → Under Review → Shortlisted → Interview → Offered → Hired/Rejected), employer dashboard
6. **Search & Browse** — PostgreSQL full-text search with tsvector columns + GIN indexes from Day 1, filters (location, type, category, skills), job listing cards
7. **Messaging** — employer-candidate chat via existing Socket.IO (opens after application)
8. **Notifications** — real-time for critical events (new application, status change, job approved/rejected)
9. **Guest Access** — full listings visible to non-members, Apply redirects to signup
10. **SSO Integration** — seamless cross-subdomain authentication
11. **Basic SEO** — Google for Jobs JSON-LD on job listing pages, sitemap.xml generation, canonical URLs, Open Graph tags for link sharing — Google indexing takes weeks to propagate, so this must ship with first public pages

**Core User Journeys Supported:** Chioma (employer), Adaeze (seeker), Job Admin (Kene)

**Week 4 DB Performance Checkpoint:** Measure portal query load impact on main platform. If query latency increase exceeds 10%, activate read replica immediately — do not wait for Week 6 gate.

**Week 6 Validation Gate:** See Success Criteria section. Pass → continue to Phase 1b. Fail → stop and fix.

#### Phase 1b: Full MVP (Weeks 7-12)

**Goal:** Complete the marketplace experience with discovery, trust signals, and cultural features.

**Capabilities Added:**
1. **Smart Matching** — weighted formula (50% skills, 30% location, 20% experience), "Jobs for you" section, explainability tags
2. **Apprenticeship Program** — dedicated job type with additional fields, featured homepage section, success story cards
3. **Fast-lane Approval** — auto-approval for verified/trusted employers, guardrails (twice-unapproved revokes)
4. **Referral System** — link sharing (WhatsApp/LinkedIn/copy), named referral with badge visibility
5. **SEO Polish** — HTTP 410 for expired listings, hreflang for bilingual listings, search relevance tuning (basic JSON-LD, sitemap, canonical URLs, and Open Graph moved to Phase 1a)
6. **Cold Start Flows** — progressive seeker profile nudges, inline employer onboarding
7. **Notification Digest** — daily digest for low-priority events (in addition to real-time for critical events)
8. **Employer Dashboard Polish** — multi-job management, posting templates for returning employers

**Additional Journeys Supported:** Apprenticeship (Emeka + Adaeze), Repeat Employer (Chioma trusted path), Referred Candidate (Nkem)

### Phase 1.5: Post-Launch Optimization (Months 4-6)

> **Timeline Shift:** Product brief positioned Phase 1.5 at "Weeks 7-10." With the MVP expanded to 12 weeks, Phase 1.5 shifts to Months 4-6 (post-launch).

- Employer analytics (views per posting, application funnel, time-to-hire)
- Enhanced Job Admin tooling (bulk approve/reject, priority scoring, pattern detection)
- Search relevance tuning based on usage data
- Bulk ATS actions + candidate comparison view
- Message templates and saved searches with alerts

### Phase 2: Growth Features (Months 7-12)

- Points escrow system integration (community points used for premium job features)
- Elasticsearch migration for search at scale
- AI-powered job matching using historical application and hiring data
- Calendar integration (Google, Outlook, Apple) for interview scheduling
- Video meeting link auto-generation for interviews
- LinkedIn profile import, skill endorsements
- Resume auto-deletion enforcement (6-month retention policy)

### Phase 3: Expansion (Year 2+)

- External company accounts with separate onboarding and verification
- Recruitment agency partnerships
- Job syndication to Indeed/Glassdoor
- Virtual career fairs integrated with events calendar
- Candidate skill assessments/tests
- AI-suggested resume improvements and skills gap analysis
- Multi-currency salary display
- White-label job portal for other diaspora communities

### Resource Requirements

**Minimum Team (3-4 Engineers):**
- 1 senior full-stack (monorepo architecture lead, SSO integration, shared packages)
- 1 full-stack (job posting, ATS, employer flows)
- 1 full-stack (job seeker flows, search, matching, SEO)
- 1 part-time or rotating (Job Admin tooling, notifications, testing)

**Critical Dependencies:**
- JOB_ADMIN role: at least 2 trained Job Admins available by Week 3 for seeded job review
- Content: seed 20-30 real job postings from community business owners by Week 5 (for Week 6 gate)
- Design: UX specifications for employer dashboard and job seeker mobile flows before Week 1

### Risk Assessment

| Risk Category | Key Risk | Impact | Mitigation |
|---------------|----------|--------|------------|
| **Technical** | Monorepo migration breaks existing platform | High — blocks all portal work | Phase 0 as dedicated prerequisite; zero-regression gate (4795+ tests); rollback plan |
| **Technical** | Cross-subdomain SSO fails on Safari | Medium — degrades employer experience | Apex-domain login mandatory; dedicated E2E tests for Safari ITP; silent refresh fallback |
| **Technical** | Shared DB query load degrades main platform | High — harms existing users | Query load monitoring; < 15% latency increase threshold; read replica if needed |
| **Market** | Employers prefer WhatsApp (too entrenched) | High — low adoption | Post flow < 5 min; beat WhatsApp on tracking/transparency; Week 6 validates this |
| **Market** | Not enough job seekers apply | Medium — empty marketplace | Community cross-pollination; notifications for new matching jobs; progressive profile flow |
| **Market** | Apprenticeship low adoption | Low — emotional heart, not functional core | Seed with community leaders; deferral candidate if adoption is low |
| **Resource** | 3-4 engineers insufficient for 12-week timeline | Medium — scope creep risk | Deferral candidates defined; Week 6 gate forces prioritization; Phase 1a/1b split |
| **Resource** | Job Admin bottleneck at scale | Medium — approval delays hurt employer experience | Fast-lane auto-approval for trusted employers; start with 2 admins, scale as needed |

## Functional Requirements

### Job Posting & Lifecycle

- FR1: Employers can create job postings with title, description, type, location, salary range, skills, experience level, and application deadline
- FR2: Employers can select a job type from: Full-time, Part-time, Contract, Freelance, Internship, Apprenticeship
- FR3: Employers can specify work location as Remote, On-site, or Hybrid
- FR4: Employers can attach a job description document to a posting
- FR5: Employers can flag a posting as "Urgent Hiring"
- FR6: Employers can save a job posting as draft before submitting for review
- FR7: Employers can edit a posting that has been returned with requested changes
- FR8: Employers can close an active job posting manually
- FR9: Employers can mark a job posting as "Filled" upon successful hire
- FR10: Employers can renew an expired job posting without re-approval if content is unchanged
- FR11: The system enforces a configurable maximum (default: 5) of active job postings per employer account, defined in platform settings
- FR12: The system automatically expires job postings on their deadline date and blocks new applications
- FR13: The system keeps expired/closed job listings visible for 30 days with a status badge, then removes them from search
- FR14: The system notifies employers when a posting is expiring in 3 days

### Company Profiles

- FR15: Employers can create a company profile inline during their first job posting
- FR16: Employers can specify company name, description, industry, and company size
- FR17: Employers can upload a company logo
- FR18: Employers can add culture statement, benefits, and banner image to their company profile
- FR19: The system displays a verification badge on company profiles earned through the first approved job posting
- FR20: The system pre-fills company profile fields for returning employers

### Job Seeker Profiles & Resume

- FR21: Job seekers can create a dedicated job seeker profile with headline, summary, skills, experience, and education
- FR22: The system auto-fills job seeker profile fields from existing community profile data
- FR23: Job seekers can add skill tags from a predefined library with autocomplete
- FR24: Job seekers can add custom skill tags (displayed with a distinct visual style)
- FR25: Job seekers can upload resumes in PDF or DOCX format (max 25MB)
- FR26: Job seekers can maintain up to 5 resume versions with labels and select a default (scalable post-MVP)
- FR27: Job seekers can delete any of their resumes at any time
- FR28: Job seekers can toggle an "Open to Opportunities" status on their profile
- FR29: Job seekers can set profile visibility to Public, Members Only, or Hidden
- FR30: The system enforces minimum profile requirements (display name, location, 1 skill tag) before allowing applications

### Application System & ATS

- FR31: Job seekers can apply to a job posting with one click using their stored profile and default resume
- FR32: Job seekers can track the status of their applications
- FR33: Job seekers can see when their application was viewed by the employer ("Viewed by employer — [date]")
- FR34: Job seekers can delete their own applications at any time (hard delete)
- FR35: Employers can view a list of applications per job posting with filtering by date and status
- FR36: Employers can view a candidate's full profile, skills, resume, and community context from the application
- FR37: Employers can advance applications through pipeline stages: Applied → Under Review → Shortlisted → Interview Scheduled → Offered → Hired / Rejected
- FR38: Employers can add notes when changing an application's status
- FR39: Employers can see application counts and unread indicators on their dashboard
- FR40: Employers can schedule an interview by setting a date and time manually
- FR41: The system computes a "qualified application" flag based on match score >= configured minimum threshold, >= 1 overlapping skill, and non-empty profile
- FR42: The system retains closed job applications for 12 months and rejected applications for 6 months, then purges automatically
- FR43: The system revokes employer resume access 180 days after a job is closed/filled

### Smart Matching

- FR44: The system computes match scores using weighted formula: 50% skills overlap, 30% location match, 20% experience match
- FR45: Job seekers can see a "Jobs for you" section showing top-ranked jobs by match score
- FR46: The system displays explainability tags on matched jobs (e.g., "Matches 4 of your skills", "Same city", "Experience fits")
- FR47: The system ranks but never excludes candidates from search results based on match score
- FR48: The system does not use age, gender, photo, badge level, membership tier, or points balance as matching inputs

### Search & Discovery

- FR49: Users can search jobs using full-text search across titles, descriptions, and skills
- FR50: Users can filter job listings by job type, experience level, salary range, posted date, work location, and industry/category
- FR51: Users can search jobs by location (city, country)
- FR52: The system displays job listing cards with title, company, location, type, salary range, posted date, and badges
- FR53: The system displays job badges: Urgent Hiring, Apprenticeship, Community Referral
- FR54: The system falls back to partial match (prefix matching) when full-text search returns zero results
- FR55: The system displays recently posted jobs in the user's location/category when no matches are found

### Apprenticeship Program

- FR56: Employers can create apprenticeship job postings with additional fields: mentorship duration, skills to be taught, and completion benefits
- FR57: Employers can designate an apprenticeship as business-led or individual-led
- FR58: The system displays a dedicated featured section on the portal homepage showcasing active apprenticeships with hero banner, cards, success stories, and dual CTAs

### Messaging

- FR59: Employers can initiate a chat conversation with a candidate after the candidate has applied
- FR60: Both employer and candidate can send messages within an opened conversation
- FR61: Conversation threads are linked to specific job applications for context

### Notifications

- FR62: The system sends real-time in-app and email notifications for: new application, application status change, new message, job approved/rejected/changes requested, interview scheduled
- FR63: The system sends daily digest emails for: job expiring soon reminders, new smart-match recommendations (only when content exists)
- FR64: The system displays "Viewed by employer" as a passive signal on the candidate's dashboard (no push notification)
- FR65: All notifications are idempotent — duplicate event deliveries result in a single notification

### Referral System

- FR66: Users can share job listings via WhatsApp, LinkedIn, or copy link
- FR67: Members can send a named referral for a specific job to another community member
- FR68: The system displays "Referred by [Name]" badge on applications visible to the employer
- FR69: The system displays "You were referred by [Name]" to the referred candidate

### Guest Access & SEO

- FR70: Guest visitors can browse full job listings, salary ranges, and company profiles without authentication
- FR71: The system redirects guest visitors to community signup when they click Apply
- FR72: The system renders Google for Jobs JSON-LD structured data on all active job listing pages
- FR73: The system generates a sitemap.xml of all active job listings
- FR74: The system returns HTTP 410 for expired job listings with links to similar active jobs
- FR75: The system renders Open Graph and Twitter Card meta tags on all public pages

### Job Admin Review

- FR76: Job Admins can view a queue of pending job postings with poster profile context
- FR77: Job Admins can approve, reject (with reason), or request changes (with feedback) on job postings
- FR78: Job Admins can see an expedited review indicator for previously verified companies
- FR79: The system auto-approves postings from verified/trusted employers (fast-lane) with option for later review
- FR80: The system revokes fast-lane status after two unapproved auto-approved postings
- FR81: The system prioritizes flagged or reported postings for immediate review, bypassing fast-lane privileges
- FR82: The system logs all Job Admin review decisions in the audit system with timestamp, admin ID, and action
- FR83: Job Admins can flag an employer for platform admin review

### Cold Start & Onboarding

- FR84: First-time job seekers can browse all job listings immediately without a profile
- FR85: The system displays progressive nudges for profile completion (persistent banner, post-apply prompts)
- FR86: Employers create a company profile inline during their first job post (not a separate flow)

### Platform Integration

- FR87: The system authenticates users via cross-subdomain SSO with the main igbo platform
- FR88: The system shares chat messaging infrastructure with the main platform
- FR89: The system shares notification delivery infrastructure with the main platform
- FR90: The system shares cloud file storage infrastructure for resumes and attachments

### Data Protection & Compliance

- FR91: Candidates can delete their own applications and resumes at any time
- FR92: The system purges all resumes and applications within the 30-day deletion window when a candidate deletes their account
- FR93: The system anonymizes company profiles when an employer deletes their community account
- FR94: Job Admins can access candidate data only in cases of reported abuse or fraud, with audit log entry
- FR95: All job postings must include a salary or compensation range, or explicitly select "Prefer not to disclose" (form validation enforced — field is required, but disclosure is optional)
- FR96: The system flags postings containing discriminatory keywords from a configurable screening list based on protected characteristics for Job Admin review
- FR97: The system displays a jurisdiction disclaimer on all job listings

### Community Trust & Engagement

- FR98: Employers can view a candidate's community trust signals alongside their application, including verification status, membership duration, and engagement level (post count, event attendance, points tier)
- FR99: The system provides a portal homepage displaying a combination of recent job listings, featured jobs (including apprenticeships), and a prominent search interface
- FR100: Employers can view a dashboard listing all their job postings with status, application counts, and actions (edit, close, view applications)
- FR101: Job Admins can create, edit, and manage apprenticeship success stories displayed in the featured section
- FR102: Job Admins can manage the skill tag library, including promoting custom tags to the official list, merging duplicates, and removing low-quality tags
- FR103: Employers and job seekers select skills from a shared skill tag library to ensure consistency in matching
- FR104: Employers can format job descriptions using rich text (e.g., headings, lists, bold/italic formatting)
- FR105: Employers can specify the currency for salary or compensation ranges
- FR106: The system provides autocomplete suggestions from the skill library during skill input for both job postings and job seeker profiles
- FR107: Employers can flag job postings as requiring cultural or language skills (e.g., Igbo language proficiency, cultural event experience) via a dedicated tag category
- FR108: The system integrates web analytics tracking for page views, conversion funnels, and user acquisition channels (including guest-to-member conversion from job listings)

### Portal-Specific (added during epic reconciliation 2026-04-01)

- FR109: The system prevents duplicate applications (one active application per job per seeker; unique constraint on job_id + seeker_user_id for non-withdrawn applications)
- FR110: Users can hold both seeker and employer roles simultaneously on a single account (dual-role support)
- FR111: The system maintains a session-scoped activePortalRole that determines the current seeker/employer context for UI and API permissions
- FR112: The portal navigation includes a role switcher for toggling between seeker and employer views
- FR113: User roles extend to include JOB_SEEKER, EMPLOYER, and JOB_ADMIN, integrated with the existing RBAC system
- FR114: The system provides bidirectional navigation between the community platform and the job portal
- FR115: Job descriptions support bilingual content (English + Igbo) with a language toggle for display
- FR116: The system provides a portal-specific reporting mechanism for suspected fraudulent job postings
- FR117: Employers can complete a verification flow by uploading business documents for admin review
- FR118: The system sends application confirmation emails with next-steps guidance to candidates
- FR119: Employers can preview a job posting before submitting it for review
- FR120: The system provides curated seed job postings for the launch period (cold start)
- FR121: The system supports a featured employer program for early adopter employers (cold start)
- FR122: The system provides a community skills survey to bootstrap seeker profiles (cold start)
- FR123: Employers can view application analytics per posting: views, applications, and conversion rates
- FR124: Job seekers can view analytics: profile views, application status summary, and match trend
- FR125: Job Admins can view platform-wide analytics: total postings, applications, time-to-fill, and active users
- FR126: The system manages consent for job matching visibility and employer access to seeker profiles
- FR127: Apprenticeship applications include a motivation statement (required) and learning goals (required) in addition to the standard application fields
- FR128: Message read receipts — when a recipient reads a message, the sender sees a "read" indicator with timestamp (aligns with "Viewed by Employer" confidence-signal philosophy)
- FR129: File sharing in messages — employers and candidates can attach CV, portfolio, and document files within message threads (required for platform containment; without this, users switch to WhatsApp/email)
- FR130: Saved searches (MVP-lite) — job seekers can save a search query and receive a daily email alert when new matching jobs are posted (no push notifications, no advanced logic)
- FR131: Bulk candidate export (MVP-lite) — employers can export a basic CSV of applicants per job posting (name, status, application date, match score)

### Deferred Requirements (post-MVP)

- DEFERRED-1: Employer bulk-action on applications (advance, reject, message multiple candidates at once)
- ~~DEFERRED-2: Saved searches~~ — promoted to FR130 (MVP-lite: save + daily email alert only)
- DEFERRED-3: Apprenticeship progress tracking with milestone definitions
- DEFERRED-4: Typing indicators in messages (read receipts promoted to FR128; typing indicators remain deferred)
- ~~DEFERRED-5: File sharing in messages~~ — promoted to FR129 (MVP)
- DEFERRED-6: Referral tracking from submission through hire (keep basic referral badge; defer full tracking)
- DEFERRED-7: Referrer notification on referral status changes
- DEFERRED-8: Referral count and success rate displayed on community profiles
- DEFERRED-9: Job posting templates for common role types
- DEFERRED-10: Bulk job import via CSV for enterprise employers
- DEFERRED-11: Interview scheduling integration
- DEFERRED-12: Employer subscription tiers (Free/Professional/Enterprise)
- DEFERRED-13: Seeker premium features (priority badge, enhanced visibility)
- DEFERRED-14: "Similar Jobs" recommendations on job detail pages
- DEFERRED-15: Job alert creation from search results
- DEFERRED-16: Employer brand page with custom content sections
- DEFERRED-17: Offline-capable job browsing (PWA service worker)
- DEFERRED-18: Seeker skill assessment integration
- DEFERRED-19: Community event cross-promotion from portal
- DEFERRED-20: Employer response time tracking and display
- ~~DEFERRED-21: Bulk candidate export~~ — promoted to FR131 (MVP-lite: basic CSV per posting)

## Non-Functional Requirements

> Detailed performance budgets, browser matrix, and deployment architecture are specified in **Web App Specific Requirements**. NFRs below define measurable quality gates; the Web App section provides implementation context.

### Performance

- NFR1: Job listing pages load in < 2 seconds on a 4G mobile connection (LCP < 2.5s, FCP < 1.5s, CLS < 0.1)
- NFR2: API responses complete within 200ms at p95 under normal load
- NFR3: Full-text search returns results in < 1 second
- NFR4: Apply flow completes in < 30 seconds from click to submission confirmation
- NFR5: Smart match score computation completes within the search query response time (no separate request)
- NFR6: Initial route JavaScript bundle < 150 KB gzipped, with non-critical features (e.g., rich text editor, employer dashboard) loaded via dynamic imports; total page weight < 500 KB per job listing page
- NFR7: Lighthouse Performance score ≥ 90 (mobile) enforced as CI gate

### Security

- NFR8: All data in transit encrypted via TLS 1.2+
- NFR9: Resumes stored with server-side encryption (AES-256)
- NFR10: Resume download URLs are time-limited signed URLs with a TTL of 1 hour (not publicly accessible)
- NFR11: Session cookies configured for secure cross-subdomain sharing with SameSite=None and Secure=true attributes, scoped to the apex domain for cross-subdomain SSO
- NFR12: CSRF validation on all mutating API endpoints, accounting for cross-subdomain Origin headers
- NFR13: All Job Admin and platform admin actions logged in the audit system with actor, action, target, and timestamp
- NFR14: User HTML input (job descriptions, company profiles) sanitized server-side via allowlist before storage and rendering
- NFR15: No PII (emails, phone numbers, resume content) logged in application logs — user IDs only
- NFR16: Resume and application data purged within 30 days of account deletion (GDPR right to deletion)
- NFR17: Job Admin and platform admin access to candidate data requires audit log entry

### Scalability

- NFR18: System supports 200 active job postings and 4,000 applications per month without degradation
- NFR19: Portal query load must not increase main platform query latency by more than 15%
- NFR20: Read replica activated if portal query load exceeds 10% latency impact (Week 4 checkpoint)
- NFR21: Portal deployed as independent container, scalable independently of main platform to handle NFR18 volume targets without affecting main platform resources
- NFR22: Search implementation is abstracted behind a query interface that allows backend replacement (e.g., relational full-text → dedicated search engine) without breaking API contracts

### Reliability

- NFR23: Portal uptime ≥ 99.5% measured monthly
- NFR24: Zero-downtime deployments via rolling updates with health check endpoint
- NFR25: Database migrations are backward-compatible (additive only; destructive changes via multi-phase migration)
- NFR26: Application submission failures (e.g., network issues) display a clear error message with retry option, ensuring no silent failures
- NFR27: Notification delivery is idempotent — duplicate events produce single notification (server-side deduplication key + client-side 5-second guard)
- NFR28: Existing main platform test suite must pass with zero regression after any portal-related changes

### Accessibility

- NFR29: WCAG 2.1 AA compliance on all portal pages (inherited from main platform)
- NFR30: All interactive elements have minimum 44px tap targets on mobile
- NFR31: All form validation errors announced via ARIA live regions with focus moved to first error field
- NFR32: Status badges use text labels in addition to color (not color-only differentiation)
- NFR33: Skill tag autocomplete follows ARIA combobox pattern
- NFR34: ATS pipeline status changes announced to screen readers
- NFR35: Full keyboard navigation for apply flow, search, and employer dashboard

### Integration

- NFR36: Cross-subdomain SSO session handoff completes in < 1 second across all supported browsers including Safari iOS 17+ (browser + PWA)
- NFR37: Portal events (job.applied, application.statusChanged, job.approved) registered in shared event system with `domain.action` naming convention
- NFR38: Shared real-time messaging server authenticates portal connections using shared session data
- NFR39: Changes to shared packages (`@igbo/db`, `@igbo/auth`, `@igbo/ui`, `@igbo/config`) trigger tests in all consuming apps (CI enforced)
- NFR40: Google for Jobs structured data indexed within 48 hours of job listing publication (validated via Search Console)
- NFR41: Portal API endpoints enforce rate limiting to prevent abuse (e.g., application spam, scraping), inheriting the main platform's rate-limit presets and configuration (see architecture for specific limits per endpoint)
- NFR42: Portal database operations use a separate connection pool with configurable limits to prevent resource contention with the main platform

