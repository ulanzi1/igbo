---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
inputDocuments:
  - product-brief-igbo-2026-02-18.md
  - Job_Portal_PRD_v1.1_FINAL.md
  - masterplan2.1.md
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 0
  projectDocs: 2
classification:
  projectType: "Web App (SPA, real-time, mobile-first responsive)"
  primaryDomain: "Community Platform (social, cultural preservation, civic engagement)"
  secondaryDomains:
    - "Fintech (Phase 2+)"
    - "Civic-Tech (Phase 3+)"
  complexity: "high"
  projectContext: "greenfield"
lastEdited: "2026-02-19"
editHistory:
  - date: "2026-02-19"
    changes: "Validation-guided edits: fixed 3 NFR implementation leakage violations, strengthened FR81 and FR85 with measurable criteria, added Adaeze user journey, added Navigation & Page Structure section"
workflowType: "prd"
---

# Product Requirements Document - igbo

**Author:** Dev
**Date:** 2026-02-18

## Executive Summary

**igbo** is the first purpose-built digital home for the Igbo diaspora — a real-time community platform that makes scattered community members discoverable, connected, and engaged across the globe.

**The Problem:** Millions of Igbo people live outside Nigeria, fragmented across disconnected WhatsApp groups, Facebook pages, and LinkedIn connections. No single platform serves their unique needs: cultural preservation, community governance, professional networking, and economic empowerment. Generic social platforms solve fragments. Nothing solves the whole picture.

**The Solution:** A mobile-first web application (Next.js hybrid SPA with Lite PWA) delivering real-time chat, member directory with geographic discovery, events with video meetings, articles for cultural preservation, group management, and a points-based engagement system — all with bilingual support (English + Igbo) and admin-approved membership for community integrity.

**Target Users:**

- **Diaspora members** seeking cultural connection (Chidi, 28, Houston)
- **Elders and cultural knowledge keepers** preserving heritage (Chief Okonkwo, 67, Enugu)
- **Community leaders** organizing chapters (Ngozi, 45, London)
- **New discoverers** finding their people for the first time (Emeka, 34, Kuala Lumpur)

**Differentiator:** Category-defining product. No competitor combines social networking, cultural preservation, democratic governance, professional networking, and community commerce under one roof for a specific diaspora. igbo's moat is purpose — generic platforms cannot replicate cultural context, bilingual support, community-exclusive membership, and governance features designed for this community.

**Phase 1 (MVP, 4-6 months):** Community core — auth, chat, directory, groups, events, articles, points, admin tools. No commerce, no financial transactions, no mobile apps.

## Success Criteria

### User Success

**The "Worth It" Moment:** Two community members from the same city or village — sitting miles apart, unaware of each other — find each other through igbo for the first time.

**Measurable User Outcomes:**

| Metric                               | Target                                             | Timeframe            |
| ------------------------------------ | -------------------------------------------------- | -------------------- |
| Member discovery (local connections) | 50+ members find local community members per month | Ongoing from month 3 |
| Cross-country connections            | Members from 10+ countries actively engaging       | Within 6 months      |
| Daily engagement actions             | Average 3+ actions per active user per day         | Within 6 months      |
| Cultural content creation            | 20+ articles published per month by members        | Within 6 months      |
| Mentorship connections               | 30+ active mentor-mentee pairs                     | Within 12 months     |
| Governance participation             | 70%+ voter turnout on community votes              | Per vote event       |
| Event attendance                     | 50+ members per virtual event                      | Within 6 months      |

**User Success Personas:**

- **Chidi** succeeds when he discovers fellow community members in Houston and attends his first virtual cultural event
- **Adaeze** succeeds when she connects with a diaspora mentor and finds career opportunities (Phase 2)
- **Chief Okonkwo** succeeds when his oral history articles are read by hundreds and he mentors youth through the platform
- **Ngozi** succeeds when she migrates her London chapter to igbo and runs her first virtual town hall

### Business Success

**Leading Indicator (Daily Watch):** Messages sent per user per month > 20. This is the pulse of the community — if members are talking, the platform is alive.

**3-Month Objectives (Post-Launch):**

- 500+ monthly active users
- DAU/MAU ratio of 40%+ (strong daily habit)
- 20+ messages sent per active user per month
- 99.5%+ platform uptime
- Organic word-of-mouth growth

**12-Month Objectives:**

- 2,000+ MAU with representation from 15+ countries
- 60%+ of members active in at least one group
- 100+ new member-to-member connections formed per month
- 70% retention at 30 days, 50% at 90 days
- Clear demand signal for Phase 2 features (marketplace, job portal, mobile apps)

**24-Month Objectives:**

- 10,000+ MAU with strong global presence
- Self-sustaining revenue through marketplace fees, membership dues, and wallet transactions
- Platform recognized as the definitive digital home for the community

### Technical Success

| Metric                   | Target                        |
| ------------------------ | ----------------------------- |
| Platform uptime          | 99.5%+                        |
| Page load time           | < 2 seconds                   |
| Chat message delivery    | < 500ms                       |
| Moderation response time | < 24 hours                    |
| Member approval time     | < 48 hours                    |
| Support issue resolution | 90%+ resolved within 72 hours |

### MVP Validation Gate

**Phase 2 is greenlit when:**

- 500+ MAU with daily chat and group activity
- Members from 5+ countries actively discovering and connecting
- Average messages per user per month exceeds 20
- DAU/MAU ratio holds at 40%+
- Platform stability proven at 99.5%+ uptime
- Members actively requesting marketplace, job portal, and mobile app features

## Product Scope & Phased Development

### MVP Strategy

**Approach:** Experience MVP — prove that a dedicated digital home for a diaspora community creates meaningful human connections. The MVP doesn't need commerce, employment, or governance to validate the thesis. It needs to make scattered community members discoverable and give them a reason to come back every day.

**Core thesis to validate:** If we build a purpose-built platform where community members can find each other, chat, join groups, attend events, and share cultural knowledge — they will engage deeply and organically grow the community through word of mouth.

**Resource Requirements:**

- Small-to-medium development team (3-5 developers)
- 4-6 months for Phase 1
- Key roles: Full-stack lead, frontend developer, backend developer (real-time specialist), UI/UX designer
- Part-time: DevOps engineer, QA tester

### MVP Feature Set (Phase 1: 4-6 Months)

All 6 mapped user journeys are fully supported — Chidi (discovery), Chief Okonkwo (cultural preservation), Ngozi (community leader), Emeka (guest-to-member onboarding), Adaeze (young person back home), Admin Amaka (operations).

**Must-Have Capabilities (7 feature areas):**

1. **Authentication & User Management** — Admin-approved registration, 2FA login, three membership tiers (Basic/Professional/Top-tier), RBAC, guest access, social media linking, user profiles with privacy controls
2. **Communication** — Real-time Slack-style chat (DMs + group channels), group creation (Top-tier only), news feed with role-based posting, commenting, @mentions, threaded replies, in-app and email notifications
3. **Content** — Articles section (tier-based publishing), About Us, constitution/governance docs, guest-facing pages, bilingual support (English + Igbo)
4. **Events** — Events calendar with RSVP and registration limits, video meeting SDK integration (Agora/Daily.co), general and group meetings, recurring events, event notifications
5. **Basic Points System** — Points earning through engagement, verification badges (Blue/Red/Purple) with multipliers (3x/6x/10x), balance display and history, member dashboard (no wallet conversion)
6. **Navigation & UI** — Responsive mobile-first web (Lite PWA), personalized dashboard, global search, member directory with geographic fallback search (city to state to country)
7. **Admin Tools** — Member approval workflow, content moderation queue, progressive discipline system, member management, badge assignment, analytics dashboard, audit logs

**Internal MVP Priority Tiers (if time gets tight):**

| Priority             | Features                                                                                                                                              | Rationale                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Launch-critical**  | Auth/registration, admin approval, member profiles, real-time chat (DMs + groups), member directory with search, basic news feed, notification system | Without these, the platform has no pulse                   |
| **Week-1 essential** | Articles section, events calendar with video SDK, group creation/management, bilingual toggle                                                         | Needed for first week of community activity                |
| **Month-1 polish**   | Points system, verification badges, analytics dashboard, guest-facing SEO pages, Lite PWA features                                                    | Can ship in first update without impacting core experience |

**Highest Technical Risk:** Real-time chat system. Foundation of the leading success metric (20+ messages/user/month), must work flawlessly across global time zones, and is architecturally the most complex MVP component (WebSockets, message persistence, read receipts, typing indicators, group channels). Deserves earliest development start and heaviest testing.

### Post-MVP Roadmap

**Phase 2 — Growth (Months 7-12):**

- Marketplace with seller-arranged shipping
- Platform Wallet with points-to-currency conversion (1000 pts = $100)
- Mobile apps (iOS/Android — native)
- Job portal on subdomain (`job.[domain]`) with ATS and points escrow
- Professional networking section with organizational email
- Basic voting/polls, forum-style discussions
- E2E encryption for chat, photo albums

**Phase 3 — Expansion (Months 13-16):**

- Platform-handled shipping (DHL integration)
- Project management with fundraising campaigns
- Studio broadcasting (professional video production)
- Advanced gamification and leaderboards
- Full voting and governance system (elections, petitions, quorum enforcement)

**Phase 4+ — Scale & Optimize:**

- Subdomain hosting for groups, multi-currency support
- AI-powered content moderation, personalization engine
- Advanced analytics and reporting

**Phase 5+ — Future (Year 2-3):**

- Investment/trading features (with proper licensing)
- White-label platform (retrofit if demand materializes)
- VR cultural experiences, premium subscription tiers, regional chapter autonomy

**The Ultimate Goal:** A self-sustaining ecosystem where dispersed cultural communities worldwide have a digital home — starting with this community and expanding to serve any diaspora that needs to reconnect, preserve culture, and grow together.

## User Journeys

### Journey 1: Chidi — "Finding My People" (Primary User, Discovery Path)

**Who:** Chidi, 28, software engineer in Houston, Texas. Born in Nigeria, moved to the US for university. Misses the sense of community he grew up with. Scattered across random WhatsApp groups that don't connect to each other.

**Opening Scene:** It's a Saturday evening in Houston. Chidi is scrolling through a WhatsApp group that's mostly muted — the last message was two weeks ago. His coworkers invited him to a bar, but he craves something different. He wants to talk to someone who _gets it_ — the culture, the humor, the food, the stories from home. He stumbles across igbo through a link a cousin shared on Facebook.

**Rising Action:** Chidi lands on the guest page and browses articles about cultural events and heritage pieces. Something stirs. He clicks "Contact Us to Join" and fills out the application — name, email, location, cultural connection. Within 36 hours, he gets an email: _Welcome to igbo._ He logs in, sets up his profile, completes the feature tour, and immediately searches the member directory for Houston.

**The Fallback Moment:** No results in Houston. A brief pang of disappointment — but the platform doesn't leave him hanging. It suggests: _"No members found in Houston yet. Here are 12 community members in Texas."_ He sees names in Dallas, Austin, San Antonio. He expands further and finds 47 members across the United States. He's not alone after all.

**Climax:** Chidi messages a Professional member in Dallas — turns out they grew up in the same town in Nigeria. They talk for two hours that first night. The next week, Chidi joins the "US Members" group, attends a virtual cultural event with 60 members, and discovers there's actually one other member in Houston who joined just three days after him.

**Resolution:** Within his first month, Chidi has connected with community members across three states, attended two virtual events, and is mentoring a young person back home through the platform. He messages his cousin: _"This is it. This is what we've been missing."_ He stops checking WhatsApp groups entirely.

**Requirements Revealed:**

- Member directory with location-based search (city to state to country fallback)
- Guest-accessible public content (articles, about, events listing)
- Contact form to admin approval to account creation flow
- Profile setup wizard with onboarding tour
- Real-time chat (DMs and group channels)
- Group discovery and joining
- Virtual event attendance with video SDK
- Notification system (email + in-app)

### Journey 2: Chief Okonkwo — "Preserving What Matters" (Primary User, Cultural Preservation Path)

**Who:** Chief Okonkwo, 67, retired teacher in Enugu, Nigeria. Deeply knowledgeable about Igbo history, traditions, and proverbs. Not very tech-savvy — his granddaughter helps him with his phone. Worried that the stories he carries will die with his generation.

**Opening Scene:** Chief Okonkwo sits on his veranda telling his grandchildren a story about the founding of their village. His granddaughter Amara, who is a member on igbo, says: _"Papa, you should write this down on the platform. People all over the world would read it."_ He's skeptical. He doesn't trust these internet things. But Amara shows him the articles section — stories from other elders, in both English and Igbo. He sees the engagement. People are commenting, thanking the authors, asking questions. He agrees to try.

**Rising Action:** Amara helps him create his account. The admin approves him quickly — his application mentions he's a retired teacher and cultural knowledge keeper. The profile setup is straightforward. Amara bookmarks the articles section for him. Over the next week, Chief Okonkwo dictates his first article to Amara, who types it up and submits it on his behalf. It goes through admin review and is published within 24 hours.

**Climax:** Within a week, his article has been read by 200+ members. Comments pour in from young people in Malaysia, the US, and the UK — asking questions, sharing how the story connected them to their roots. A young Professional member in London asks if Chief Okonkwo would be willing to mentor her. He receives a notification (Amara reads it to him): _"Your article 'The Founding of Our Village' has earned 340 points."_

**Resolution:** Chief Okonkwo becomes a regular contributor. He dictates one article per week. His granddaughter helps him navigate the platform, but he's learned to check his notifications and browse comments on his own. He joins a governance vote for the first time — it takes him 30 seconds. He tells his friends at the village meeting: _"Our stories will live forever now. The children in America are reading them."_

**Requirements Revealed:**

- Articles section with admin review/approval workflow
- Bilingual support (English + Igbo) for articles
- Simple, accessible interface (large text, clear navigation)
- Commenting system on articles
- Points earning through content engagement
- Notification system readable by less tech-savvy users
- Assisted account creation flow (someone else helping)
- Verification badge system (cultural knowledge keeper)

### Journey 3: Ngozi — "Building Her Chapter" (Primary User, Community Leader Path)

**Who:** Ngozi, 45, business owner and community chapter leader in London. Already runs local meetups through WhatsApp and spreadsheets. Energetic, organized, frustrated by fragmented tools.

**Opening Scene:** Ngozi has 85 community members in her London WhatsApp group, but she knows there are more out there. She spends hours every month coordinating events through WhatsApp polls, tracking RSVPs in Excel, and posting updates across three different Facebook groups. Half the members miss announcements. Nobody knows about the community members in Manchester or Birmingham. She hears about igbo at a community gathering and signs up immediately.

**Rising Action:** As a Top-tier member, Ngozi creates a "London Chapter" group on the platform — public, so any UK-based member can find and join it. She sets up the group description, uploads a banner image, and configures posting permissions. She invites her WhatsApp contacts to join the platform. Over two weeks, 40 of her 85 WhatsApp members migrate, and she discovers 15 new community members in London who she never knew existed.

**Climax:** Ngozi schedules her first virtual town hall through the events system. She sets a registration limit of 200, enables RSVP, and the event auto-generates a video meeting link. She posts an announcement in her group's news feed — pinned to the top. 120 members RSVP within 48 hours. The event runs smoothly through the video SDK — screen sharing, Q&A, breakout rooms for regional subgroups. After the event, she posts a summary and photos in the group feed.

**Resolution:** Within three months, Ngozi's London Chapter has 150 members. She's appointed two group leaders (Professional members) to help moderate. She runs bi-weekly events, manages group discussions, and coordinates with chapter leaders in other UK cities through the platform. She no longer uses WhatsApp for community business. Her chapter is the most active group on igbo, and other community leaders reach out to learn how she did it.

**Requirements Revealed:**

- Group creation and management (Top-tier only)
- Group types (public/private/hidden) with configurable settings
- Group leader assignment and moderation roles
- Events calendar with RSVP, registration limits, and video meeting integration
- News feed with pinned posts and group-specific feeds
- Member directory for geographic discovery
- Notification system for event reminders and group activity
- Recurring event support

### Journey 4: Guest to New Member — "Walking Through the Door" (Onboarding Path)

**Who:** Emeka, 34, accountant in Kuala Lumpur, Malaysia. He's been in KL for six years and has never met another community member in the country. He finds igbo through a link shared by a friend on Twitter/X.

**Opening Scene:** Emeka clicks the link and lands on igbo's splash page. Three columns: Explore as Guest, Contact Us to Join, Members Login. He's curious but cautious — he clicks "Explore as Guest."

**Rising Action:** As a guest, Emeka browses the public articles — a piece on cultural heritage catches his eye, then a blog post about a recent virtual gathering with photos of members from around the world. He checks the events calendar and sees upcoming cultural celebrations. He can't comment, can't see member profiles, can't RSVP — but he can see enough to know this is real. The platform gently nudges: _"Join the community to connect with members near you."_

**The Decision:** Emeka clicks "Contact Us to Join." The form asks for his name, email, phone, location (Kuala Lumpur auto-detected), cultural connection details, reason for joining, and an optional referral from an existing member. He writes: _"I've been in Malaysia for 6 years and have never met another Igbo person here. I want to find my people."_ He submits.

**The Wait:** Within 24 hours, an admin reviews his application. The cultural connection checks out. His account is created as a Basic member. He receives a welcome email with login credentials and an automated welcome message on the platform.

**Climax:** Emeka logs in, completes his profile (bio, location, interests, languages), acknowledges community guidelines, and takes the feature tour. He searches the member directory for Malaysia — and finds three other members. Three! One is in Kuala Lumpur, just 20 minutes away. He sends a direct message: _"I can't believe there's another one of us here."_

**Resolution:** Emeka and the KL member meet for coffee the following weekend. It's the first time either of them has spoken Igbo in person in years. Emeka joins two groups, starts attending virtual events, and tells every community member he knows about igbo. He becomes the unofficial recruiter for Southeast Asia.

**Requirements Revealed:**

- Three-column splash page (Guest / Join / Login)
- Guest access: read-only articles, events calendar, blog, about page
- Contact form with cultural verification questions
- Admin approval workflow with notification to applicant
- Account creation with welcome email
- Profile setup wizard with onboarding tour and community guidelines acknowledgment
- IP-based location detection
- Clear CTA prompts for guest-to-member conversion

### Journey 5: Adaeze — "Finding Her Future" (Young Person Back Home Path)

**Who:** Adaeze, 22, recent university graduate in Lagos, Nigeria. Ambitious and eager for opportunity but isolated from the global community network. She doesn't know where to look beyond local job boards. She stumbles across igbo through a tweet from a diaspora member in Canada.

**Opening Scene:** Adaeze is sitting in her apartment in Lagos, scrolling through LinkedIn and local job boards with growing frustration. She graduated six months ago with a degree in marketing, but every listing feels like a dead end. A cousin in Toronto tweets about igbo — _"Finally, a platform that connects all of us."_ Adaeze clicks the link.

**Rising Action:** She browses the guest-accessible articles — a piece by Chief Okonkwo about village traditions catches her attention, then a blog post by a diaspora member in London about navigating career transitions. She sees the events calendar: a virtual mentorship session next Thursday, a cultural celebration this weekend. She can't comment or RSVP, but she's seen enough. She clicks "Contact Us to Join."

Her application highlights her interest in mentorship and professional growth. The admin approves her within 24 hours — her cultural connection is clear, and her reason for joining is genuine. She logs in, sets up her profile (marketing graduate, Lagos, interested in mentorship, professional development, and cultural content), and takes the feature tour.

**Climax:** Adaeze searches the member directory for mentors — she finds 8 Professional and Top-tier members who listed "mentorship" in their interests. She messages a marketing director in Atlanta: _"I just graduated and I'm looking for guidance. Would you be open to mentoring me?"_ The response comes within hours: _"Absolutely. Let's schedule a video call."_

She joins the "Young Professionals" and "Career Development" groups. She reads three articles about diaspora career paths and comments on each one, asking questions. She RSVPs for the virtual mentorship session on Thursday. She starts writing her own article about youth perspectives in Lagos — sharing what life is like for young graduates navigating the economy back home.

**Resolution:** Within two months, Adaeze has an active mentor relationship, has published two articles (one in English, one bilingual), and attends virtual events weekly. She's connected with five other young members in Nigeria who share her ambitions. When the job portal launches in Phase 2, she'll be the first to use it — but she didn't need to wait. The community gave her mentorship, visibility, and belonging from day one. She tells her university friends: _"You don't have to leave Nigeria to access the global community."_

**Requirements Revealed:**

- Guest-accessible articles and events calendar for discovery
- Contact form with cultural connection verification
- Member directory search with interest/skill filtering
- Direct messaging for mentorship connections
- Group discovery and joining
- Article commenting and content engagement
- Bilingual article publishing
- Virtual event attendance with RSVP
- Profile setup with interests and languages
- Points earning through content engagement

### Journey 6: Admin Amaka — "Keeping the Lights On" (Operations Path)

**Who:** Amaka, 38, one of three platform administrators. Former IT project manager, now volunteers as a community admin. She logs into the admin dashboard every morning before work.

**Opening Scene:** Amaka opens her admin dashboard at 7 AM. The overnight queue shows: 4 new membership applications, 2 flagged posts in the moderation queue, 1 content report from a member, and a new article submitted for review. The analytics widget shows 312 DAU yesterday — up 5% from last week.

**Rising Action:** She starts with membership applications. Each one shows: name, email, location, cultural connection statement, reason for joining, and IP assessment. Three are straightforward approvals — clear cultural connections, legitimate locations, no red flags. The fourth is vague — no cultural connection details, generic reason, suspicious IP. She clicks "Request More Info" and sends a template asking for clarification.

She moves to the moderation queue. One flagged post is a false positive — a member discussing a sensitive cultural topic that triggered the automated filter. She approves it. The second is a member promoting an external business — she removes it and sends a warning using the progressive discipline workflow (first offense: warning notification).

The content report is a member claiming another member sent harassing DMs. Amaka pulls up the chat logs (admin access to flagged conversations), reviews the exchange, and determines it's a misunderstanding. She messages both members with context.

**Climax:** The submitted article is from Chief Okonkwo — a beautiful piece on village founding stories. Amaka reviews it for community guidelines compliance, checks the bilingual content, and approves it. She marks it as "Featured" so it appears prominently in the news feed.

She then checks the analytics dashboard: member growth trend, engagement metrics, geographic distribution, tier breakdown. She notices a spike in new applications from the UK — Ngozi must be recruiting again. She assigns verification badges to two members who've met the criteria for Blue badge status.

**Resolution:** By 8 AM, Amaka has processed all overnight items. The platform is running smoothly. She sets a reminder for the weekly admin sync and logs off. Total admin time: 45 minutes. The three-admin rotation means each person handles the dashboard twice a week.

**Requirements Revealed:**

- Admin dashboard with queue summaries (applications, moderation, reports)
- Membership approval workflow (approve/request info/reject)
- Content moderation queue with automated flagging
- Progressive discipline system (warning to suspension to ban)
- Admin access to flagged conversations for dispute resolution
- Article review and approval with "Featured" designation
- Analytics dashboard (DAU, growth trends, geographic distribution, tier breakdown)
- Verification badge assignment
- Admin activity and audit logs
- Member management and tier assignment

### Journey Requirements Summary

| Journey                                   | Key Capabilities Revealed                                                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Chidi (Discovery)**                     | Member directory with geographic fallback search, guest content, onboarding, real-time chat, groups, virtual events          |
| **Chief Okonkwo (Cultural Preservation)** | Articles with bilingual support, admin review, commenting, points system, accessible UI, assisted onboarding                 |
| **Ngozi (Community Leader)**              | Group creation/management, events with video SDK, pinned posts, group leader roles, member migration path                    |
| **Emeka (Guest to Member)**               | Splash page, guest access, contact form, admin approval, profile setup, location detection, member discovery                 |
| **Adaeze (Young Person Back Home)**       | Guest content discovery, mentorship connections, article publishing, group participation, virtual events, career development |
| **Admin Amaka (Operations)**              | Admin dashboard, approval queues, moderation, dispute resolution, analytics, badge management, audit logs                    |

## Domain-Specific Requirements

### Compliance & Regulatory

**GDPR (Phase 1 — EU members from day one):**

- Privacy policy and transparent data collection notices
- Cookie consent management
- Right to deletion (soft-delete with retention policies)
- Data processing consent at registration
- Clear data usage disclosures for cultural identity information
- Data breach notification procedures (72-hour requirement)

**Data Privacy (Phase 1):**

- Server-side encryption at rest for all sensitive data (personal info, chat messages, cultural identity)
- TLS encryption in transit for all communications
- Chat architecture designed with E2E encryption migration path for Phase 2
- Member profile visibility controls (public/private/limited)
- Location data privacy (auto-detected with manual override, can be hidden)
- Email addresses hidden by default
- No data export functionality (by design, per masterplan)

**Deferred Compliance (Phase 2+):**

- KYC/AML verification for wallet and financial transactions
- Money transmitter licensing (jurisdiction-dependent)
- PCI-DSS compliance for payment processing
- Employment law compliance for job portal across multiple jurisdictions
- Tax reporting infrastructure (1099s for marketplace sellers)

### Content Moderation & Safety

- Admin approval queue for all membership applications
- Content moderation queue with automated profanity/inappropriate content filtering
- Bilingual moderation capability (English + Igbo)
- Progressive discipline system (warning to suspension to ban)
- Member reporting system with clear categories
- Cultural sensitivity considerations in automated filtering (avoid false positives on cultural discussion topics)
- Admin access to flagged conversations for dispute resolution (enabled by server-side encryption model)

## Innovation & Novel Patterns

### Primary Innovation: The All-in-One Cultural Ecosystem

igbo's core innovation is not any single feature — it's the deliberate combination of social networking, cultural preservation, democratic governance, professional networking, commerce, and employment under one roof, purpose-built for a specific dispersed cultural community. No existing platform attempts this. Facebook, WhatsApp, LinkedIn, and job boards each solve a fragment — igbo solves the whole picture.

This is a **category-defining product**: the first dedicated digital home for a diaspora community.

**Supporting Innovations:**

| Innovation                          | Description                                                                                                                                                       | Phase   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **Geographic fallback discovery**   | Member search gracefully expands from city to state to country when local density is low, preventing dead-end experiences in early growth                         | Phase 1 |
| **Points escrow for employment**    | Points blocked on job application, deducted only on interview confirmation, released on rejection — protects job seekers while incentivizing quality applications | Phase 2 |
| **Cultural apprenticeship revival** | Using digital technology to revive a declining cultural tradition, matching elders with youth for knowledge transfer                                              | Phase 2 |
| **Democratic governance built-in**  | Voting, elections, petitions, and quorum-based decision-making baked into the platform — not an afterthought                                                      | Phase 3 |

### Competitive Landscape

**No direct competitor exists.** igbo occupies a unique space:

| Existing Solution            | What It Does                    | What It Misses                                                                                                               |
| ---------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Facebook Groups**          | Social networking, basic groups | No governance, no directory, no cultural preservation tools, no marketplace, fragmented across dozens of disconnected groups |
| **WhatsApp Groups**          | Real-time chat                  | No discoverability, no member directory, no content persistence, no governance, no cross-group connection                    |
| **LinkedIn**                 | Professional networking         | Not community-focused, no cultural context, no governance, no marketplace                                                    |
| **Slack/Discord**            | Real-time communication         | Not designed for cultural communities, no governance, no marketplace, no member directory with geographic search             |
| **Mighty Networks / Circle** | Community platforms             | Generic — no bilingual support, no cultural preservation tools, no points economy, no job portal, no governance system       |

**igbo's moat:** Purpose-built for this community's specific needs. Generic platforms cannot replicate the combination of cultural context, governance, bilingual support, and community-exclusive features.

### Innovation Validation

| Innovation                            | Validation Method                                                          | Success Signal                                               |
| ------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **All-in-one ecosystem**              | Phase 1 MVP with core community features; measure cross-feature engagement | Members using 3+ feature areas regularly                     |
| **Geographic fallback**               | A/B test fallback suggestions vs. "no results" dead end                    | Higher connection rate in low-density areas                  |
| **Points escrow (Phase 2)**           | Pilot with subset of job portal users; track application quality           | Fewer spam applications; higher interview-to-hire conversion |
| **Cultural apprenticeship (Phase 2)** | Launch with 10-20 mentor-mentee pairs; measure completion rates            | 70%+ of pairs reporting meaningful knowledge transfer        |

## Web App Specific Requirements

### Project-Type Overview

igbo is a real-time community web application built as a hybrid-rendered Next.js SPA — server-side rendering for SEO-critical guest-facing pages, client-side rendering for the authenticated member experience. The app functions as a Lite PWA (installable, push notifications, smart caching) to bridge the gap before native mobile apps arrive in Phase 2.

### Browser Matrix

**Target: Modern evergreen browsers, last 2 versions**

| Browser          | Minimum Version | Platform         |
| ---------------- | --------------- | ---------------- |
| Chrome           | Last 2 versions | Desktop, Android |
| Firefox          | Last 2 versions | Desktop, Android |
| Safari           | Last 2 versions | Desktop, iOS     |
| Edge             | Last 2 versions | Desktop          |
| Samsung Internet | Last 2 versions | Android          |

**Not supported:** Internet Explorer, legacy mobile browsers. Users on unsupported browsers see a clear upgrade prompt.

**Mobile browser priority:** Given global audience (Nigeria, US, EU, Malaysia, Vietnam), mobile Chrome and Safari are the primary targets. Samsung Internet included for Android market share in Africa and Southeast Asia.

### Responsive Design

**Mobile-first approach:**

- Breakpoints: Mobile (< 768px), Tablet (768-1024px), Desktop (> 1024px)
- Touch-friendly interactions (minimum 44px tap targets)
- Responsive navigation: hamburger menu on mobile, full nav bar on desktop
- Chat interface optimized for mobile viewport (full-screen on mobile, sidebar on desktop)
- Member directory and news feed: card-based layouts that reflow across breakpoints
- Video meeting interface adapts to screen size (full-screen on mobile, embedded on desktop)

### SEO Strategy

**SEO-critical pages (server-side rendered):**

- Landing/splash page
- About Us page
- Public articles and blog posts
- Events calendar (public view)
- Guest-facing navigation pages

**SEO implementation:**

- Next.js SSR/SSG for all guest-facing pages
- Structured data (JSON-LD) for articles and events
- Open Graph and Twitter Card meta tags for social sharing
- Sitemap.xml generation (public pages only)
- robots.txt configured to index public content, block authenticated areas
- Canonical URLs and proper heading hierarchy
- Bilingual SEO: hreflang tags for English and Igbo content variants

**Not indexed:** All authenticated member content (chat, member profiles, group discussions, admin pages). Privacy by design — member activity is not discoverable via search engines.

### Accessibility Approach

**Target: WCAG 2.1 AA compliance** (measurable targets in NFR-A1 through NFR-A9)

**Elder-friendly design (Chief Okonkwo considerations):**

- Readable default font sizes (minimum 16px body text)
- Clear, simple navigation with obvious labels
- High-contrast mode option
- Reduced motion option for animations
- Large click/tap targets (minimum 44x44px)
- Clear visual hierarchy with generous whitespace

### Navigation & Page Structure

**Guest Navigation (unauthenticated):**

- Home (splash page with three-column layout: Explore as Guest / Contact Us to Join / Members Login)
- About Us
- Articles (guest-accessible)
- Events Calendar (public view)
- Blog
- Contact Us / Apply to Join

**Authenticated Member Navigation:**

- Home (personalized dashboard)
- Chat (DMs + group channels)
- Groups (directory + joined groups)
- Events (calendar + RSVP management)
- Articles (browse + write)
- Members (directory + search)
- News Feed
- Notifications
- Profile / Settings

**Member Dashboard:**

- Activity feed (recent posts, messages, group activity)
- Upcoming events with RSVP status
- Points balance and recent earning history
- Recommended groups and member suggestions
- Quick-access shortcuts to chat, directory, and articles

**Group Leader Dashboard (extends member dashboard):**

- Group management panel (member requests, moderation queue)
- Group analytics (membership, engagement)
- Event creation and management for group

**Admin Dashboard:**

- Queue summaries: membership applications, moderation queue, content reports, article submissions
- Analytics overview: DAU, MAU, growth trends, geographic distribution, tier breakdown
- Member management (search, tier assignment, badge assignment)
- Audit log viewer
- Community guidelines and governance document management

**Page Hierarchy:**

- All authenticated pages share a persistent navigation shell (sidebar on desktop, bottom tab bar on mobile)
- Chat interface: full-screen on mobile, resizable sidebar on desktop
- Article editor: full-width focused writing view
- Video meetings: full-screen on mobile, embedded panel on desktop
- Admin pages: separate admin navigation context accessible only to admin role

### Lite PWA Implementation

**Included in Phase 1:**

- `manifest.json` with app name, icons, theme colors, display mode (standalone)
- Service worker for static asset and public content caching
- Web Push API integration for notifications (chat messages, event reminders, admin alerts)
- Installable on mobile home screens (Android and iOS)
- Graceful offline fallback page ("You're offline — reconnect to continue")
- Cache strategies: cache-first for static assets, stale-while-revalidate for public content, network-first for authenticated API calls

**Deferred to Phase 2 (native apps):**

- Offline chat with message queuing and sync
- Background sync for pending actions
- Full offline-first architecture

### Real-Time Architecture

**WebSocket infrastructure:**

- Persistent WebSocket connections for authenticated members
- Real-time chat message delivery (DMs and group channels)
- Live notification delivery (in-app)
- Typing indicators and read receipts
- Online/offline presence indicators
- Graceful reconnection on network interruption

**Video SDK integration (Agora or Daily.co):**

- Embedded video meetings within the platform
- Screen sharing, chat during calls, breakout rooms
- Waiting rooms and co-host controls
- Meeting recording (Top-tier members only)
- Calendar integration for scheduled events

### Tech Stack & Deployment

**Frontend:** Next.js (React) with TypeScript, Tailwind CSS, React Context + TanStack Query or SWR, next-intl or next-i18next, next-pwa

**Backend:** PostgreSQL, Redis caching layer, WebSocket (Socket.io or native WS)

**Infrastructure:** Hetzner hosting with containerized deployment, Cloudflare CDN with edge caching, CI/CD via GitHub Actions (Development to Staging to Production), automated Lighthouse CI checks in pipeline

**Testing:** Jest + React Testing Library + Cypress for E2E

## Functional Requirements

### Member Registration & Onboarding

- FR1: Guest visitors can browse public content (articles, blog, events calendar, about page) without authentication
- FR2: Guest visitors can view a three-column splash page with options to explore as guest, apply to join, or log in
- FR3: Prospective members can submit a membership application via contact form with personal information, cultural connection details, location, reason for joining, and optional member referral
- FR4: The system can auto-detect applicant location from IP address and pre-fill location fields
- FR5: Newly approved members can complete a profile setup wizard including bio, photo, location, interests, and languages
- FR6: New members can acknowledge community guidelines as part of onboarding
- FR7: New members can take a guided feature tour of the platform
- FR8: The system can send automated welcome emails and in-platform welcome messages to new members

### Authentication & Security

- FR9: Members can log in using email/username and password with mandatory two-factor authentication
- FR10: Members can manage their active sessions and revoke access from specific devices
- FR11: The system can lock accounts after repeated failed login attempts
- FR12: Members can reset their password through a secure recovery flow
- FR13: Members can link multiple social media accounts (Facebook, LinkedIn, Twitter/X, Instagram) to their profile

### Member Profiles & Directory

- FR14: Members can create and edit their profile with name, photo/avatar, bio, location, interests, cultural connections, and languages spoken
- FR15: Members can control their profile visibility (public to members, limited, or private)
- FR16: Members can choose to show or hide their location on their profile
- FR17: Members can search the member directory by name, location, skills, interests, and language
- FR18: The system can suggest members at broader geographic levels (state, country) when no members are found at the searched city level
- FR19: Members can view other members' profiles including verification badge, bio, interests, and engagement indicators

### Membership Tiers & Permissions

- FR20: The system can enforce three membership tiers (Basic, Professional, Top-tier) with distinct capability sets
- FR21: Basic members can participate in chat, join public groups, view articles, attend general meetings, and use the member directory
- FR22: Professional members can do everything Basic members can, plus publish 1 article per week (members-only visibility) and access enhanced features
- FR23: Top-tier members can do everything Professional members can, plus create and manage groups, publish 2 articles per week (guest or member visibility), and assign group leaders
- FR24: Admins can assign, upgrade, and downgrade member tiers
- FR25: The system can enforce tier-based posting limits that increase with points accumulation (up to 7 articles/week maximum)

### Verification & Points

- FR26: Admins can assign verification badges (Blue, Red, Purple) to qualifying members
- FR27: The system can apply points multipliers based on verification badge level (Blue: 3x, Red: 6x, Purple: 10x) to likes received
- FR28: Members can earn points through receiving likes on content and through activity-based engagement (event attendance, project participation, mentoring)
- FR29: Members can view their points balance and earning history on their dashboard
- FR30: The system can display verification badges on member profiles and content

### Real-Time Communication

- FR31: Members can send and receive direct messages to/from other members in real-time
- FR32: Members can participate in group direct messages (3+ people)
- FR33: Members can send messages with rich text formatting, file attachments, and emoji reactions
- FR34: Members can edit and delete their own messages
- FR35: Members can see typing indicators and read receipts in conversations
- FR36: Members can reply to specific messages in threads
- FR37: Members can @mention other members in messages to trigger notifications
- FR38: Members can search their message history
- FR39: Members can block or mute other members
- FR40: Members can set notification preferences per conversation and enable Do Not Disturb mode

### Groups & Channels

- FR41: Top-tier members can create groups with a name, description, banner image, and visibility setting (public, private, or hidden)
- FR42: Group creators can configure join requirements (open or approval-required), posting permissions, commenting permissions, and member limits
- FR43: Group creators can assign group leaders (Professional or Top-tier members) with moderation capabilities
- FR44: Members can discover and join public groups through the group directory
- FR45: Members can request to join private groups; group leaders can approve or reject requests
- FR46: Groups can have dedicated chat channels, a group news feed, file repositories, and a member list
- FR47: Group leaders can post pinned announcements within their group
- FR48: Members can belong to up to 40 groups simultaneously

### News Feed & Content

- FR49: Members can view a personalized news feed with posts from their groups, followed members, and platform announcements
- FR50: Members can create posts with rich media (images, videos, links), text formatting, and category tags
- FR51: The system can enforce role-based posting permissions (Basic: no general posts; Professional: 1/week; Top-tier: 2/week)
- FR52: Members can like, react to, comment on, and share posts within the platform
- FR53: Members can save/bookmark posts for later reference
- FR54: Admins can pin announcements to the top of the news feed
- FR55: Members can toggle between algorithmic and chronological feed sorting
- FR56: The system can display a separate "Announcements Only" feed for official communications

### Articles & Cultural Content

- FR57: Authorized members can write and submit articles using a rich text editor with multimedia support
- FR58: The system can route submitted articles through an admin approval queue before publication
- FR59: Admins can mark approved articles as "Featured" for prominent news feed placement
- FR60: Top-tier members can choose article visibility (guest-accessible or members-only)
- FR61: Articles can be published in English, Igbo, or both languages
- FR62: Members can comment on published articles
- FR63: Guest visitors can read guest-accessible articles without authentication
- FR64: The system can display reading time estimates and related article suggestions

### Events & Video Meetings

- FR65: Authorized members can create events with title, description, date/time, duration, event type (general/group), registration limit, and recurrence settings
- FR66: Members can RSVP to events with automatic waitlist when registration limits are reached
- FR67: The system can generate video meeting links for events using an integrated video SDK
- FR68: Members can join video meetings with screen sharing, in-meeting chat, breakout rooms, and waiting room capabilities
- FR69: Members can receive event reminder notifications at configurable intervals before the event
- FR70: Members can view past events with details, attendance records, and highlights
- FR71: Top-tier members can access archived meeting recordings

### Notifications

- FR72: Members can receive in-app notifications for direct messages, @mentions, group activity, event reminders, post interactions, and admin announcements
- FR73: Members can receive email notifications for important platform activity
- FR74: Members can receive push notifications via Web Push API (Lite PWA) when the browser is closed
- FR75: Members can customize which notification types they receive and through which channels
- FR76: Members can configure digest options (daily/weekly summaries) as an alternative to real-time notifications
- FR77: Members can set quiet hours/Do Not Disturb schedules

### Search & Discovery

- FR78: Members can perform global search across members, posts, articles, groups, events, and documents
- FR79: The system can provide autocomplete suggestions as users type in search
- FR80: Members can filter search results by content type, date range, author, category, location, and membership tier
- FR81: The system can display up to 5 recommended groups on the member dashboard and group directory, ranked by interest overlap and shared group membership with the member's connections
- FR82: The system can suggest members to connect with based on shared interests, location, or skills

### Administration & Moderation

- FR83: Admins can review, approve, request more information on, or reject membership applications
- FR84: Admins can review and approve or reject submitted articles and flagged content through a moderation queue
- FR85: The system can automatically flag text content containing blocklisted terms (admin-configurable keyword blocklist for English and Igbo) with a false-positive rate below 5% and detection rate above 80% for blocklisted terms, routing flagged content to the moderation queue
- FR86: Members can report posts, comments, messages, or other members with categorized reasons
- FR87: Admins can issue warnings, temporary suspensions, or permanent bans through a progressive discipline system
- FR88: Admins can review flagged conversations for dispute resolution
- FR89: Admins can view an analytics dashboard showing DAU, MAU, growth trends, geographic distribution, tier breakdown, and engagement metrics
- FR90: Admins can view comprehensive audit logs of all administrative actions
- FR91: Admins can manage community guidelines, constitution, and governance documents in a document repository
- FR92: Members can view and download governance documents (read-only)

### Bilingual Support

- FR93: Members can toggle the platform UI between English and Igbo
- FR94: The system can display all navigation, labels, buttons, and system messages in the selected language
- FR95: Content creators can publish articles in English, Igbo, or both with language tags

### Guest Experience & SEO

- FR96: The system can server-side render all guest-facing pages for search engine discoverability
- FR97: Guest pages can display clear call-to-action prompts encouraging visitors to apply for membership
- FR98: The system can generate structured data, Open Graph tags, and sitemaps for public content
- FR99: Guest visitors cannot access member profiles, chat, group discussions, or interactive features

## Non-Functional Requirements

### Performance

| ID      | Requirement                                                        | Target                                                | Measurement                    |
| ------- | ------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------ |
| NFR-P1  | Page load time for guest-facing SSR pages                          | < 2 seconds (global, via CDN)                         | Lighthouse CI, Core Web Vitals |
| NFR-P2  | Page load time for authenticated SPA pages (subsequent navigation) | < 1 second                                            | Service worker cached          |
| NFR-P3  | First Contentful Paint (FCP)                                       | < 1.5 seconds                                         | Lighthouse                     |
| NFR-P4  | Largest Contentful Paint (LCP)                                     | < 2.5 seconds                                         | Core Web Vitals                |
| NFR-P5  | Cumulative Layout Shift (CLS)                                      | < 0.1                                                 | Core Web Vitals                |
| NFR-P6  | First Input Delay (FID)                                            | < 100ms                                               | Core Web Vitals                |
| NFR-P7  | Chat message delivery (send to receive)                            | < 500ms                                               | Server-side telemetry          |
| NFR-P8  | API response time (p95)                                            | < 200ms                                               | Server-side monitoring         |
| NFR-P9  | Member directory search response                                   | < 1 second for results display                        | Client-side measurement        |
| NFR-P10 | Concurrent WebSocket connections supported                         | 500+ simultaneous at launch                           | Load testing                   |
| NFR-P11 | Video meeting join time                                            | < 5 seconds from click to connected                   | SDK metrics                    |
| NFR-P12 | Image optimization                                                 | All images served as WebP/AVIF with responsive srcset | Build pipeline validation      |

### Security

| ID      | Requirement                               | Target                                                                                          | Measurement             |
| ------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------- |
| NFR-S1  | All data encrypted in transit             | TLS 1.2+ on all connections                                                                     | SSL Labs A+ rating      |
| NFR-S2  | All sensitive data encrypted at rest      | AES-256 server-side encryption                                                                  | Infrastructure audit    |
| NFR-S3  | Two-factor authentication enforced        | 100% of member accounts                                                                         | System enforcement      |
| NFR-S4  | Password policy enforcement               | Minimum 8 characters, complexity requirements, industry-standard password hashing algorithm     | Automated testing       |
| NFR-S5  | Account lockout on failed attempts        | Lock after 5 consecutive failures, unlock after 15 minutes or admin action                      | Automated testing       |
| NFR-S6  | Session management                        | Configurable timeout, max concurrent sessions per member                                        | System configuration    |
| NFR-S7  | Content Security Policy headers           | CSP, X-Frame-Options, X-Content-Type-Options on all responses                                   | Header scan tools       |
| NFR-S8  | File upload security                      | Virus scanning on all uploads; file type whitelisting; size limits                              | Upload pipeline testing |
| NFR-S9  | GDPR compliance                           | Cookie consent, data processing consent, right to deletion, breach notification within 72 hours | Compliance audit        |
| NFR-S10 | Input validation and sanitization         | All user inputs validated server-side; protection against XSS, CSRF, SQL injection              | OWASP testing           |
| NFR-S11 | Audit logging coverage                    | 100% of admin actions logged with timestamp, actor, and action details                          | Log audit               |
| NFR-S12 | Chat architecture E2E migration readiness | Service abstraction layer supports future E2E encryption without data model changes             | Architecture review     |

### Scalability

| ID      | Requirement                      | Target                                                                                   | Measurement         |
| ------- | -------------------------------- | ---------------------------------------------------------------------------------------- | ------------------- |
| NFR-SC1 | User growth support              | System handles 10x user growth (500 to 5,000 members) with < 10% performance degradation | Load testing        |
| NFR-SC2 | Concurrent user capacity         | 500 concurrent users at launch, scalable to 2,000 without infrastructure redesign        | Load testing        |
| NFR-SC3 | Event traffic spikes             | Platform handles 3x normal traffic during virtual events (200+ simultaneous attendees)   | Spike testing       |
| NFR-SC4 | Chat message throughput          | System processes 100+ messages per second across all channels                            | Load testing        |
| NFR-SC5 | Database query performance       | All user-facing queries execute within 100ms at 10,000 member scale                      | Query analysis      |
| NFR-SC6 | Static asset delivery            | CDN serves static assets from edge locations globally                                    | CDN analytics       |
| NFR-SC7 | Horizontal scalability readiness | Application architecture supports horizontal scaling of API and WebSocket servers        | Architecture review |

### Accessibility

| ID     | Requirement                     | Target                                                                                                | Measurement                 |
| ------ | ------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------- |
| NFR-A1 | WCAG compliance level           | WCAG 2.1 AA across all pages                                                                          | Automated + manual testing  |
| NFR-A2 | Keyboard navigation             | All interactive elements reachable and operable via keyboard                                          | Manual testing              |
| NFR-A3 | Screen reader compatibility     | Full compatibility with VoiceOver (macOS/iOS) and NVDA (Windows)                                      | Manual testing              |
| NFR-A4 | Color contrast ratios           | Minimum 4.5:1 for normal text, 3:1 for large text                                                     | Automated contrast checking |
| NFR-A5 | Minimum touch/click target size | 44x44px minimum for all interactive elements                                                          | Design review               |
| NFR-A6 | Minimum body text size          | 16px minimum for body text                                                                            | Design review               |
| NFR-A7 | Reduced motion support          | Respect prefers-reduced-motion media query; no critical information conveyed solely through animation | Automated testing           |
| NFR-A8 | High contrast mode              | Optional high-contrast mode toggle for low-vision users                                               | Manual testing              |
| NFR-A9 | Semantic HTML structure         | All pages use proper heading hierarchy, landmarks, and ARIA labels                                    | Automated + manual audit    |

### Integration

| ID     | Requirement                    | Target                                                                                  | Measurement             |
| ------ | ------------------------------ | --------------------------------------------------------------------------------------- | ----------------------- |
| NFR-I1 | Video SDK reliability          | Video meetings connect successfully 99%+ of attempts                                    | SDK monitoring          |
| NFR-I2 | Video SDK latency              | Audio/video lag < 300ms for participants on standard broadband                          | SDK quality metrics     |
| NFR-I3 | Email delivery reliability     | Transactional emails delivered within 5 minutes; 98%+ inbox placement rate              | Email service analytics |
| NFR-I4 | Web Push notification delivery | Push notifications delivered within 30 seconds of trigger                               | Push service metrics    |
| NFR-I5 | CDN cache hit ratio            | 90%+ cache hit ratio for static assets                                                  | CDN analytics           |
| NFR-I6 | Social media linking           | OAuth flows complete within 10 seconds; graceful degradation if provider is unavailable | Integration testing     |

### Reliability & Availability

| ID     | Requirement                    | Target                                                                                         | Measurement               |
| ------ | ------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------- |
| NFR-R1 | Platform uptime                | 99.5%+ monthly uptime                                                                          | Uptime monitoring         |
| NFR-R2 | Planned maintenance window     | Maximum 2 hours per month during lowest-traffic period                                         | Maintenance log           |
| NFR-R3 | Data backup frequency          | Daily automated backups with 30-day retention                                                  | Backup monitoring         |
| NFR-R4 | Recovery time objective (RTO)  | < 4 hours for full platform recovery from backup                                               | Disaster recovery testing |
| NFR-R5 | Recovery point objective (RPO) | < 24 hours of data loss in worst-case scenario                                                 | Backup validation         |
| NFR-R6 | WebSocket reconnection         | Automatic reconnection within 5 seconds on network interruption; no message loss               | Connection testing        |
| NFR-R7 | Graceful degradation           | Platform remains usable (read-only mode) if chat or video services are temporarily unavailable | Failover testing          |

## Risk Assessment

### Technical Risks

| Risk                                 | Impact                                              | Mitigation                                                                                                                 |
| ------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Real-time chat reliability**       | Core success metric fails if chat is unreliable     | Start chat development first; dedicate senior engineer; load test with simulated global users; Socket.io fallback strategy |
| **Video SDK integration complexity** | Events experience degraded if video is flaky        | Use proven SDK (Agora/Daily.co) rather than custom; prototype early; audio-only fallback                                   |
| **Bilingual i18n throughout**        | Igbo translations incomplete or inconsistent        | Build i18n framework from day one with next-intl; translation keys everywhere; community members validate translations     |
| **RBAC complexity across 3 tiers**   | Permission bugs expose restricted features          | Design permission matrix upfront; test tier boundaries extensively; middleware-based access control                        |
| **E2E encryption migration**         | Costly refactor if chat architecture isn't prepared | Design chat service abstraction layer now with clean interfaces; document E2E migration path in architecture               |

### Market Risks

| Risk                                 | Impact                                                  | Mitigation                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Low initial adoption**             | Platform feels empty, undermining the "worth it" moment | Seed with 500 known members; community leaders actively recruit; geographic fallback search prevents dead ends                        |
| **WhatsApp migration resistance**    | Members stick to existing WhatsApp groups               | Complement WhatsApp, don't compete; offer features WhatsApp can't (directory, events, articles, structured groups); gradual migration |
| **Content creation chicken-and-egg** | No articles means no reason for guests to join          | Pre-seed articles section with cultural content; incentivize early authors with points and featured status                            |
| **Category creation is hard**        | No existing market means no existing demand signal      | Leverage 500 initial members as early adopters; word-of-mouth within tight-knit community is the growth engine                        |

### Resource Risks

| Risk                                     | Impact                            | Mitigation                                                                                                          |
| ---------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Fewer developers than planned**        | Timeline extends beyond 6 months  | Internal priority tiers defined — launch with launch-critical features, add week-1 and month-1 features iteratively |
| **Single point of failure on key roles** | Knowledge silos, blocked progress | Document architecture decisions; pair programming on critical systems (chat, auth); cross-train on frontend/backend |
| **Scope creep during development**       | MVP expands, launch delays        | This PRD is the scope contract; any new feature request goes to Phase 2 backlog; PM reviews all scope changes       |

### Domain Risks

| Risk                                        | Impact                                                       | Mitigation                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **GDPR non-compliance**                     | Legal exposure for EU members                                | Privacy-by-design from Phase 1; data processing agreements; soft-delete with retention policies        |
| **Admin bottleneck at scale**               | Member approval delays, moderation backlog                   | Multiple admins with rotation; clear criteria checklists; consider automated pre-screening for Phase 2 |
| **Cultural content false positives**        | Legitimate cultural discussions flagged by automated filters | Train moderation filters on community-specific vocabulary; human review for edge cases                 |
| **Data breach with cultural identity data** | Trust damage, GDPR penalties                                 | Encryption at rest; minimize data collection; access controls; breach notification procedures          |

### Innovation Risks

| Risk                                   | Impact                                                            | Mitigation                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **All-in-one complexity**              | Trying to do everything results in doing nothing well             | Phase 1 focuses on community core only — prove the ecosystem thesis before adding commerce and employment              |
| **Feature breadth vs. depth**          | Each feature area competes with dedicated solutions               | Don't compete on individual features — compete on the _integration_ and cultural context no generic platform can offer |
| **White-label premature optimization** | Designing for multi-tenancy too early adds unnecessary complexity | Defer white-label entirely; build for one community first, retrofit if demand materializes                             |
