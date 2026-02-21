# Community Job Portal

## Product Requirements Document (PRD) v1.1 — FINAL

**Document Version:** 1.1 (Final)  
**Date:** February 18, 2026  
**Status:** Ready for Development  
**Subdomain:** `job.[domain]`  
**Reference Platform:** AngelList (Wellfound)

> _Reviving the cultural apprentice tradition through community-powered employment_

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Scope and Integration](#2-scope-and-integration)
3. [User Roles and Permissions](#3-user-roles-and-permissions)
4. [Job Posting Features](#4-job-posting-features)
5. [Application Process](#5-application-process)
6. [Search and Discovery](#6-search-and-discovery)
7. [Employer Features](#7-employer-features)
8. [Candidate Features](#8-candidate-features)
9. [Monetization and Points Economy](#9-monetization-and-points-economy)
10. [Notifications and Communication](#10-notifications-and-communication)
11. [Compliance and Privacy](#11-compliance-and-privacy)
12. [Analytics and Reporting](#12-analytics-and-reporting)
13. [Integration and Technical Specifications](#13-integration-and-technical-specifications)
14. [Unique Community Features](#14-unique-community-features)
15. [Data Model](#15-data-model)
16. [Admin Configuration Panel](#16-admin-configuration-panel)
17. [Development Timeline](#17-development-timeline)
18. [Key Decisions Summary](#18-key-decisions-summary)

---

## 1. Executive Summary

The CultureConnect Community Job Portal is a dedicated employment platform accessible at `job.[domain]`. It is a **community-exclusive** job board designed to connect members with employment opportunities while **reviving the cultural apprentice tradition** that has been declining over the years.

The portal operates on its own subdomain but is deeply integrated with the CultureConnect ecosystem — sharing authentication (SSO), Platform Wallet (points economy), chat system (messaging), and member profiles.

### Key Differentiators

- Community-exclusive access (members only for full features)
- Points-based hiring economy with **escrow/blocking mechanism** (points blocked on apply, deducted only on interview confirmation)
- Cultural apprenticeship promotion and mentorship integration
- AI-powered job matching and recommendations
- Built-in resume builder with multiple versions
- Full ATS (Applicant Tracking System) for employers
- All key economy parameters (application cost, referral bonus, premium period) are **admin-configurable via UI**
- Integration with CultureConnect membership, wallet, and chat systems

### Capacity Planning

| Metric                       | Expected Volume               |
| ---------------------------- | ----------------------------- |
| Jobs posted per month        | ~200                          |
| Applications per job         | ~20                           |
| Total applications per month | ~4,000                        |
| Peak concurrent users        | ~100-150                      |
| Total active job seekers     | ~500 (scaling with community) |

---

## 2. Scope and Integration

### 2.1 Platform Architecture

- Hosted on **separate subdomain**: `job.[domain]`
- **Community-exclusive** job board — only members can post and apply
- Shared authentication with main CultureConnect platform via **SSO**
- Integrated with **Platform Wallet** for points-based transactions
- Shared member profiles with dedicated **job seeker profile extension**
- Uses **existing chat system** for employer-candidate communication

### 2.2 Access Levels

| User Type                | View Jobs             | Post Jobs            | Apply | Details                                                               |
| ------------------------ | --------------------- | -------------------- | ----- | --------------------------------------------------------------------- |
| **Guest Visitors**       | Limited listings only | No                   | No    | Can browse limited public listings; must join to see full board       |
| **Basic Members**        | Full access           | Yes (admin approved) | Yes   | Standard 5-post limit; one-click apply                                |
| **Professional Members** | Full access           | Yes (admin approved) | Yes   | Standard 5-post limit; priority visibility                            |
| **Top-tier Members**     | Full access           | Yes (admin approved) | Yes   | Standard 5-post limit; featured poster badge                          |
| **External Companies**   | N/A                   | Future phase         | N/A   | Room for companies as platform grows                                  |
| **Recruitment Agencies** | N/A                   | Future phase         | N/A   | Agency accounts planned for growth phase                              |
| **Admins**               | Full access           | Yes (direct)         | N/A   | Approve/reject all member job posts; configure all economy parameters |

### 2.3 Future Growth Path

- External company accounts with separate onboarding and verification workflows
- Recruitment agency partnerships with bulk posting capabilities
- Paid job posting tiers for non-member organizations
- Job syndication to external platforms (Indeed, Glassdoor)

---

## 3. User Roles and Permissions

### 3.1 Job Poster Permissions

- **All membership tiers** (Basic, Professional, Top-tier) can post jobs
- Every job posting requires **admin approval** before going live
- Standard limit: **5 active job posts** per member
- After 5 posts → upgrade to Premium job posting tier
- Premium tier is **free for an admin-configurable introductory period**, then costs **admin-set points per additional post**
- Admins can post directly without approval

### 3.2 Job Seeker Permissions

- **All members** can apply for jobs regardless of tier
- External candidates (non-members) **cannot apply** in the initial phase
- On application, points are **blocked (escrowed)** from the member's wallet — not immediately deducted
- Points are only **permanently deducted when the employer confirms the interview**
- If employer rejects the application before interview → **blocked points are released back** to the member
- **First application is free** (no points blocked) to encourage initial engagement
- **One-click apply** option using stored member profile data

### 3.3 Guest Access

- Guests can browse a **limited selection** of job listings (teaser view)
- Job details partially visible — title, company, location, job type shown
- Full descriptions, application buttons, and salary details **require membership**
- Clear CTA prompts encouraging guests to join the community

---

## 4. Job Posting Features

### 4.1 Job Types Supported

| Category            | Options                                               | Display                      |
| ------------------- | ----------------------------------------------------- | ---------------------------- |
| **Employment Type** | Full-time, Part-time, Contract, Freelance, Internship | Badge on job card cover      |
| **Work Location**   | Remote, On-site, Hybrid                               | Badge on job card cover      |
| **Duration**        | Temporary, Permanent                                  | Indicated in listing details |
| **Custom Duration** | 30, 60, 90 days or custom expiry                      | Set by poster per job        |

### 4.2 Job Posting Fields

| Field                  | Required/Optional | Notes                                                 |
| ---------------------- | ----------------- | ----------------------------------------------------- |
| Job Title              | **Required**      | Free text, max 120 characters                         |
| Job Description        | **Required**      | WYSIWYG editor with rich formatting                   |
| Job Type               | **Required**      | Full-time, Part-time, Contract, Freelance, Internship |
| Work Location Type     | **Required**      | Remote, On-site, Hybrid                               |
| Location/City          | **Required**      | For on-site and hybrid positions                      |
| Company Name           | **Required**      | Auto-filled from verified company profile             |
| Company Logo           | Optional          | Pulled from company profile if available              |
| Salary Range           | Optional          | Min-Max with currency selector                        |
| Experience Level       | Optional          | Entry, Mid, Senior, Lead, Executive                   |
| Skills Required        | Optional          | Tag-based selection from skill library                |
| Application Deadline   | Optional          | Date picker; defaults to posting duration             |
| JD Attachment          | Optional          | PDF upload support, max 25 MB                         |
| Cultural Skills Needed | Optional          | Special flag for cultural knowledge roles             |

### 4.3 Rich Job Descriptions

- Full **WYSIWYG editor** for job descriptions with formatting toolbar
- Support for headings, bold, italic, bullet lists, numbered lists
- Ability to attach **PDF job description** documents (max 25 MB)
- Company logo and branding displayed on job listings
- Company information auto-populated from verified company profile

### 4.4 Posting Limits and Economy

| Tier                   | Free Posts     | Beyond Limit             | Cost                      |
| ---------------------- | -------------- | ------------------------ | ------------------------- |
| All Members (Standard) | 5 active posts | Upgrade to Premium       | Free                      |
| Premium (Introductory) | Unlimited      | Admin-set intro period   | Free (promotional)        |
| Premium (Post-Intro)   | Unlimited      | Points deducted per post | Admin-set points per post |

> **Reward:** Job poster receives **100 points bonus** upon successful hire confirmation from the job seeker.

### 4.5 Admin Approval Workflow

```
Member submits job post
       ↓
Automated spam/scam screening runs
       ↓
Admin receives notification of pending post
       ↓
Admin reviews:
  - Company verification
  - Content quality
  - Community guidelines compliance
       ↓
┌──────────────┬────────────────┬──────────────┐
│   Approve    │ Request Changes│    Reject    │
│ (Goes live)  │ (Back to user) │ (With reason)│
└──────────────┴────────────────┴──────────────┘
       ↓
Poster notified of decision
```

---

## 5. Application Process

### 5.1 Application Method

All applications are processed through the **internal platform system only**. No external links or email applications are supported. This ensures all hiring activity stays within the CultureConnect ecosystem for complete tracking and analytics.

### 5.2 Application Requirements by Job Type

| Requirement          | Corporate Jobs                 | General Jobs | Freelance/Contract |
| -------------------- | ------------------------------ | ------------ | ------------------ |
| Resume/CV            | **Mandatory**                  | Optional     | Optional           |
| Cover Letter         | **Required**                   | Optional     | Optional           |
| Portfolio Links      | Optional                       | Optional     | Recommended        |
| Additional Questions | None (future phase)            | None         | None               |
| One-Click Apply      | Available (still needs resume) | Available    | Available          |

### 5.3 One-Click Apply

Members can apply instantly using their stored job seeker profile data:

- System auto-attaches the **default resume version**
- Pre-fills all application fields from job seeker profile
- Submits with a **single click**
- For corporate jobs where resume is mandatory → prompts user to **select a resume version** before completing

### 5.4 Points Escrow Model

The job portal uses a **points escrow (blocking) system** rather than immediate deduction. This protects job seekers from losing points on applications that never progress.

```
┌─────────────────────────────────────────────────────────────────┐
│                   POINTS ESCROW FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  STEP 1: Member applies for a job                               │
│  ├── First application ever → FREE (no points blocked)          │
│  └── Subsequent applications:                                   │
│       └── Points are BLOCKED (escrowed) from wallet             │
│           (amount set dynamically by Admin)                     │
│           Member cannot use blocked points for anything else    │
│                                                                 │
│  STEP 2a: Employer CONFIRMS interview                           │
│  └── Blocked points are permanently DEDUCTED                    │
│       └── Points move from "blocked" → "spent"                  │
│                                                                 │
│  STEP 2b: Employer REJECTS application (no interview)           │
│  └── Blocked points are RELEASED back to wallet                 │
│       └── Member regains full access to those points            │
│                                                                 │
│  STEP 3: Successful hire confirmed by job seeker                │
│  └── Job poster earns +100 points reward                        │
│  └── Referrer earns +Y points (admin-set) if applicable         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Wallet Display for Job Seekers:**

| Field                 | Description                                    |
| --------------------- | ---------------------------------------------- |
| **Available Balance** | Points freely usable (total minus blocked)     |
| **Blocked Balance**   | Points held in escrow for pending applications |
| **Total Balance**     | Available + Blocked combined                   |

**Key Rules:**

- Member must have sufficient **available balance** (not blocked) to apply
- Blocked points are **not usable** for any other platform activity (marketplace, other applications, etc.)
- If an application is withdrawn by the member before employer action → points are released
- If a job posting expires with no employer response → points are auto-released after a grace period (7 days)

### 5.5 Resume and Profile Integration

- **Dedicated job seeker profile**, separate from social community profile
- Resume upload and secure storage on **S3** (PDF and DOCX, max 25 MB)
- Built-in **online resume builder** with professional templates
- Support for **multiple resume versions** (e.g., technical, managerial, creative)
- **Default resume selection** for one-click apply
- **LinkedIn profile import** for quick profile setup
- Resume storage duration: **6 months** (auto-delete with notification)

---

## 6. Search and Discovery

### 6.1 Search Capabilities

- Full-text keyword search across job titles, descriptions, and skills
- Search by location (city, region, country)
- Search by company name
- Auto-complete suggestions as user types
- Search history and saved searches for repeat queries

### 6.2 Filters

| Filter Category   | Options                                                |
| ----------------- | ------------------------------------------------------ |
| Job Type          | Full-time, Part-time, Contract, Freelance, Internship  |
| Experience Level  | Entry, Mid, Senior, Lead, Executive                    |
| Salary Range      | Slider with min-max (optional listings excluded)       |
| Posted Date       | Last 24 hours, Last 7 days, Last 30 days, Any time     |
| Industry/Category | Technology, Education, Healthcare, Finance, Arts, etc. |
| Work Location     | Remote-only, On-site, Hybrid                           |
| Cultural Skills   | Jobs requiring cultural knowledge/language skills      |

### 6.3 AI-Powered Job Matching

The platform uses AI to analyze member profiles and recommend relevant jobs. Matching engine considers:

- Skills and experience listed in the job seeker profile
- Past application history and success rates
- Industry preferences and location
- Cultural knowledge and language skills
- Community engagement patterns and endorsements

### 6.4 Alerts and Notifications

- **Weekly email digest** of matching jobs (configurable)
- Occasional updates on **application success levels** and platform hiring trends
- **In-app notifications** for new matching opportunities
- **Saved search alerts** when new jobs match saved criteria

### 6.5 Job Badges

No paid featured/promoted listings. Instead, organic badges help job seekers:

| Badge                     | Trigger                                     |
| ------------------------- | ------------------------------------------- |
| 🔥 **Hot Job**            | High application volume indicator           |
| ⚡ **Urgent Hiring**      | Poster-selected for time-sensitive roles    |
| 🎭 **Cultural Skills**    | Roles requiring cultural knowledge/language |
| 🤝 **Community Referral** | Jobs posted with referral bonuses           |

---

## 7. Employer Features

### 7.1 Company Profiles

Every job poster can create a company profile page:

- Company name, logo, and banner image
- About section with company description
- Company size, industry, and founding year
- Culture and values statement
- Benefits and perks listing
- **All active jobs from the company viewable on one page**
- Company verification status displayed prominently

### 7.2 Company Verification

Companies are **not pre-verified** before posting. Verification happens at the **job posting level** through admin approval:

1. Member creates company profile and submits first job post
2. Admin reviews and approves both the job and company information simultaneously
3. Once verified through first approved posting → **subsequent posts get expedited review**

### 7.3 Applicant Tracking System (ATS)

#### 7.3.1 Employer Dashboard

- Overview of all active job postings with application counts
- Quick-view pipeline showing candidates at each stage
- Unread applications counter and notification badges
- Recent activity feed (new applications, status changes)

#### 7.3.2 Candidate Management

- Filter and sort candidates by date, skills, experience, profile score
- Shortlist candidates with notes and ratings
- Reject candidates with optional feedback message
- **Bulk actions:** shortlist multiple, reject multiple, message multiple
- **Candidate comparison view** (side-by-side profiles)

#### 7.3.3 Communication

- Direct messaging with candidates **after application acceptance/shortlisting**
- Uses **existing CultureConnect chat system** (no separate messaging tool)
- **Candidates cannot initiate messages** to hiring managers (employer-initiated only)
- Message templates for common responses (received, shortlisted, rejected, interview invite)

#### 7.3.4 Interview Scheduling

- Built-in interview scheduling tool with calendar integration
- Propose **multiple time slots** for candidate selection
- Sync with **Google Calendar, Outlook, and Apple Calendar**
- Automated **reminder notifications** for both parties
- **Video meeting link auto-generation** (using platform video SDK)

#### 7.3.5 Application Pipeline Stages

```
Applied → Under Review → Shortlisted → Interview Scheduled → Offered → Hired
                                           ↑                            ↓
                                    Points DEDUCTED              Triggers +100 pts
                                    (escrow confirmed)           reward to poster

         ↘ Rejected (at any stage)
              ↓
         Points RELEASED back
         (if before interview confirmation)
```

| Stage                         | Description                           | Actions Available                     | Points Impact                          |
| ----------------------------- | ------------------------------------- | ------------------------------------- | -------------------------------------- |
| **Applied**                   | New application received              | Review, Shortlist, Reject             | Points BLOCKED (escrowed)              |
| **Under Review**              | Application being evaluated           | Shortlist, Reject, Request Info       | Points remain blocked                  |
| **Shortlisted**               | Candidate moved to shortlist          | Schedule Interview, Reject            | Points remain blocked                  |
| **Interview Scheduled**       | Interview confirmed by employer       | Record Feedback, Move Forward, Reject | Points permanently DEDUCTED            |
| **Offered**                   | Job offer extended                    | Mark Hired, Withdraw Offer            | —                                      |
| **Hired**                     | Candidate accepted and confirmed      | —                                     | +100 pts to poster; +Y pts to referrer |
| **Rejected** (pre-interview)  | Application declined before interview | Send feedback (optional)              | Points RELEASED to applicant           |
| **Rejected** (post-interview) | Application declined after interview  | Send feedback (optional)              | Points already deducted (no refund)    |

### 7.4 Employer Analytics

- Views per job posting (impressions and unique views)
- Application funnel analytics (views → applications → shortlisted → hired)
- Time-to-hire metrics per job posting
- Candidate source tracking (search, recommendations, direct)
- Comparison across multiple job postings

---

## 8. Candidate Features

### 8.1 Application Tracking Dashboard

- View **all applications in one place** with status indicators
- Real-time status tracking through all pipeline stages
- Push notifications and email alerts for **every status change**
- Application history with dates, companies, and outcomes
- **Points wallet widget** showing available, blocked, and total balance
- Points transaction history for job applications

### 8.2 Profile Visibility Controls

| Setting          | Visibility                           | Who Can See                                   |
| ---------------- | ------------------------------------ | --------------------------------------------- |
| **Public**       | Visible to all members and employers | Any community member searching for talent     |
| **Members Only** | Visible only to logged-in members    | Restricted to authenticated community members |
| **Hidden**       | Not visible in search                | Only visible when member actively applies     |

- **"Open to Opportunities"** badge — toggleable indicator on member profile
- Employers can search member profiles (respecting visibility settings)
- Members control whether job seeker profile is linked to social profile

### 8.3 Saved Jobs and Sharing

- Bookmark/save jobs for later review
- Organized saved jobs list with sorting and filtering
- Share jobs with other community members via chat or direct link
- Share to external platforms (copy link functionality)

### 8.4 Candidate Analytics

- **Profile view count** (how many employers viewed your profile)
- **Application success rate** (percentage of positive outcomes)
- **AI-suggested improvements** for profile and resume
- **Skills gap analysis** based on desired job types
- Comparative positioning (anonymized ranking against other applicants)

---

## 9. Monetization and Points Economy

### 9.1 Revenue Model

The job portal operates on a **community-first model** with no upfront paid listings. Revenue is generated through the points escrow/commission system on applications and the broader wallet economy.

### 9.2 Points Economy Flow (All Values Admin-Configurable)

| Action                               | Points Impact          | Timing                    | Admin Configurable?       |
| ------------------------------------ | ---------------------- | ------------------------- | ------------------------- |
| Post a job (Standard)                | Free                   | Immediate                 | No (always free up to 5)  |
| Post a job (Premium, intro period)   | Free                   | During intro period       | ✅ Intro period length    |
| Post a job (Premium, post-intro)     | -N points              | On post submission        | ✅ Points per post        |
| Apply for a job (first ever)         | Free                   | —                         | No (always free)          |
| Apply for a job (subsequent)         | -N points **BLOCKED**  | On application submit     | ✅ Points per application |
| Interview confirmed by employer      | Blocked → **DEDUCTED** | On interview confirmation | — (uses blocked amount)   |
| Application rejected (pre-interview) | Blocked → **RELEASED** | On rejection              | — (auto-release)          |
| Job expired with no response         | Blocked → **RELEASED** | 7 days after expiry       | — (auto-release)          |
| Application withdrawn by member      | Blocked → **RELEASED** | On withdrawal             | — (auto-release)          |
| Successful hire (poster)             | **+100 points**        | On hire confirmation      | No (fixed at 100)         |
| Community referral bonus             | **+N points**          | On referred hire          | ✅ Referral bonus amount  |

### 9.3 Escrow Rules Summary

1. Points are **blocked** (not deducted) at the moment of application
2. Blocked points are **unavailable** for any other use
3. Points convert to **permanent deduction** only when employer confirms interview
4. Points are **auto-released** if: application is rejected pre-interview, job expires without response (7-day grace), or member withdraws application
5. Member must have sufficient **available (unblocked) balance** to apply
6. **First-ever application** is always free regardless of admin settings

### 9.4 Wallet Integration

The job portal is **fully integrated with the CultureConnect Platform Wallet**:

**Wallet Display (Job Seeker View):**

```
┌─────────────────────────────────┐
│  💰 Job Portal Wallet           │
├─────────────────────────────────┤
│  Available Balance:    450 pts  │
│  Blocked (in escrow):  150 pts  │
│  ─────────────────────────────  │
│  Total Balance:        600 pts  │
│                                 │
│  [View Transaction History]     │
└─────────────────────────────────┘
```

Points can be earned through: regular community engagement, content creation, event participation, marketplace activity, or direct purchase through the wallet.

---

## 10. Notifications and Communication

### 10.1 Notification Matrix

| Event                               | In-App | Email    | Frequency            |
| ----------------------------------- | ------ | -------- | -------------------- |
| New matching jobs                   | ✅     | ✅       | Weekly digest        |
| Application status change           | ✅     | ✅       | Instant              |
| Points blocked/released/deducted    | ✅     | ✅       | Instant              |
| New application received (employer) | ✅     | ✅       | Instant              |
| Interview scheduled                 | ✅     | ✅       | Instant + reminders  |
| Job posting approved/rejected       | ✅     | ✅       | Instant              |
| Job expiring soon                   | ✅     | ✅       | 3 days before expiry |
| Escrow auto-release (expired job)   | ✅     | ✅       | On release           |
| Saved search match                  | ✅     | Optional | Configurable         |
| Hiring success metrics              | ❌     | ✅       | Occasional updates   |

### 10.2 Messaging Rules

- Employers **can message candidates** directly after acceptance/shortlisting
- Candidates **cannot initiate messages** to hiring managers
- All job-related messaging uses the **existing CultureConnect chat system**
- **Message templates** available for employers (received, shortlisted, rejected, interview invite)
- Conversation threads **linked to specific job applications** for context

---

## 11. Compliance and Privacy

### 11.1 Equal Opportunity

- Equal Opportunity Employment statement displayed on all job postings
- Employers required to follow **EEO guidelines** as part of posting terms
- Demographic information is **not hidden** from employers (community trust model)
- Anti-discrimination reporting mechanism for members

### 11.2 Data Privacy

- Applicant data visible **only to the specific job poster** (not other members)
- Resume/CV **auto-deleted after 6 months** with advance notification
- Members have the **right to delete** their application history at any time
- **GDPR and CCPA compliant** data handling for all job-related data
- Encryption at rest and in transit for all personal documents

### 11.3 Content Moderation

- **Admin approval required** before any job goes live
- **Automated spam/scam screening** using ML-based content analysis
- Keyword-based flagging for suspicious job postings
- **Member reporting system** for suspicious or misleading postings
- Automated fraud detection for duplicate or mass-posted jobs
- Admin moderation queue with priority scoring

---

## 12. Analytics and Reporting

### 12.1 Admin Dashboard

- Total jobs posted (active, expired, filled)
- Total applications submitted and conversion rates
- Successful hires count and time-to-hire trends
- Popular job categories and in-demand skills
- Employer engagement metrics (posting frequency, response rates)
- **Points economy health:** total blocked, total deducted, total released, net flow
- Content moderation metrics (approved, rejected, flagged)

### 12.2 Employer Analytics

- Views per job posting (impressions, unique views, view-to-apply ratio)
- Application funnel: Views → Applications → Shortlisted → Interviewed → Hired
- Time-to-hire per job posting and historical trends
- Candidate quality scores and source attribution
- Comparison dashboard across multiple active postings

### 12.3 Job Seeker Analytics

- Profile views count (weekly/monthly trend)
- Application success rate with historical comparison
- AI-suggested improvements for profile, resume, and skills
- Skills gap analysis based on desired roles
- Points spent vs earned through the job portal

---

## 13. Integration and Technical Specifications

### 13.1 Third-Party Integrations

| Integration                 | Purpose                                      | Priority    |
| --------------------------- | -------------------------------------------- | ----------- |
| **CultureConnect SSO**      | Single sign-on authentication                | 🔴 Critical |
| **CultureConnect Wallet**   | Points transactions, blocking, and escrow    | 🔴 Critical |
| **CultureConnect Chat**     | Employer-candidate messaging                 | 🔴 Critical |
| **LinkedIn Profile Import** | Quick job seeker profile setup               | 🟡 High     |
| **Google for Jobs SEO**     | Job listings appear in Google search results | 🟡 High     |
| **Google Calendar**         | Interview scheduling sync                    | 🟡 High     |
| **Outlook Calendar**        | Interview scheduling sync                    | 🟡 High     |
| **Indeed Syndication**      | Cross-post jobs for wider reach              | 🟢 Medium   |
| **Glassdoor Syndication**   | Cross-post jobs and collect reviews          | 🟢 Medium   |
| **Apple Calendar**          | Interview scheduling sync                    | 🟢 Medium   |

### 13.2 File Handling

| Parameter        | Specification                              |
| ---------------- | ------------------------------------------ |
| Max file size    | **25 MB** per upload                       |
| Accepted formats | **PDF, DOCX**                              |
| Storage          | **Amazon S3**                              |
| Virus scanning   | Auto-scan on all uploads                   |
| Delivery         | CDN for fast retrieval                     |
| Retention        | **6 months** auto-delete with notification |

### 13.3 Performance Requirements

| Metric                              | Target SLA                    |
| ----------------------------------- | ----------------------------- |
| Search query response               | **< 300ms** (p95)             |
| Job listing page load               | **< 2 seconds**               |
| Application submission              | **< 1 second**                |
| Points block/release operation      | **< 500ms**                   |
| Dashboard load (employer/candidate) | **< 3 seconds**               |
| Concurrent users supported          | **150+** (peak)               |
| Monthly job postings                | **~200**                      |
| Monthly applications                | **~4,000** (20 per job avg)   |
| Database query response             | **< 100ms** (indexed queries) |
| Uptime SLA                          | **99.5%**                     |

### 13.4 Tech Stack Recommendations

```
Frontend:    React/Next.js (consistent with main platform)
Backend:     Node.js / Express or NestJS
Database:    PostgreSQL (shared with main platform)
Search:      Elasticsearch
Cache:       Redis
Storage:     Amazon S3
CDN:         CloudFront (or equivalent)
Auth:        SSO via main platform (JWT-based)
AI/ML:       Job matching engine (Python microservice)
Queue:       Bull/BullMQ (for escrow auto-release jobs, email digests)
```

### 13.5 Background Jobs

| Job                   | Schedule             | Purpose                                               |
| --------------------- | -------------------- | ----------------------------------------------------- |
| Escrow auto-release   | Every 6 hours        | Release blocked points for expired jobs (7-day grace) |
| Resume cleanup        | Daily (midnight)     | Delete resumes past 6-month retention                 |
| Job expiry check      | Every hour           | Mark expired jobs, notify posters                     |
| Weekly digest         | Weekly (Monday 9 AM) | Send matching job email digests                       |
| Spam/scam screening   | On submission        | ML-based content screening before admin queue         |
| Analytics aggregation | Daily (2 AM)         | Aggregate daily metrics for dashboards                |

---

## 14. Unique Community Features

### 14.1 Cultural Apprenticeship Revival

The most distinctive feature — reviving the declining cultural apprentice system:

- Dedicated **"Apprenticeship"** job type for traditional skill-transfer roles
- **Mentorship connections** alongside job listings — matching experienced members with learners
- Cultural knowledge/language skill requirements **prominently featured** on relevant jobs
- **Storytelling section** where successful apprenticeships are highlighted
- Elder-to-youth knowledge transfer programs integrated with the job ecosystem

### 14.2 Community Referral System

- **"Community Member Referral"** bonus badge on referred candidates
- Referral points reward (**admin-configurable**) when a referred candidate is hired
- Referral tracking dashboard showing referral outcomes
- Top referrer recognition on community leaderboard

### 14.3 Networking Events

- Occasional **networking events** specifically for job seekers
- **Virtual career fairs** within the community
- Industry-specific meetups connecting employers and candidates
- Integration with main platform events calendar

### 14.4 Skill Verification

- **Endorsements** from community members (LinkedIn-style)
- **Skill assessments/tests** for corporate job applications
- Community-verified skills carry **more weight** in AI job matching
- Verification badges (Blue/Red/Purple) are **NOT integrated** with job portal skill verification — kept separate

---

## 15. Data Model

### 15.1 Core Entities

```
┌─────────────────────┐     ┌──────────────────────┐
│    JobPosting        │     │   CompanyProfile      │
├─────────────────────┤     ├──────────────────────┤
│ id                   │     │ id                    │
│ title                │     │ name                  │
│ description (rich)   │     │ logo_url              │
│ job_type             │◄────│ description           │
│ location_type        │     │ size                  │
│ location             │     │ industry              │
│ salary_min           │     │ verified              │
│ salary_max           │     │ verified_at           │
│ experience_level     │     │ culture_statement     │
│ skills[]             │     │ benefits              │
│ status               │     │ member_id (FK)        │
│ duration_days        │     └──────────────────────┘
│ cultural_skills_flag │
│ jd_attachment_url    │     ┌──────────────────────┐
│ company_id (FK)      │     │   JobSeekerProfile    │
│ member_id (FK)       │     ├──────────────────────┤
│ created_at           │     │ id                    │
│ approved_at          │     │ member_id (FK)        │
│ expires_at           │     │ headline              │
└─────────────────────┘     │ summary               │
         │                   │ skills[]              │
         │                   │ experience[]          │
         ▼                   │ education[]           │
┌─────────────────────┐     │ resume_urls[]         │
│    Application       │     │ default_resume        │
├─────────────────────┤     │ visibility            │
│ id                   │     │ open_to_opportunities │
│ job_id (FK)          │     └──────────────────────┘
│ member_id (FK)       │
│ status               │     ┌──────────────────────┐
│ resume_version_url   │     │   Interview           │
│ cover_letter         │────►├──────────────────────┤
│ portfolio_links[]    │     │ id                    │
│ points_blocked       │     │ application_id (FK)   │
│ points_deducted      │     │ scheduled_at          │
│ is_first_free        │     │ duration_minutes      │
│ applied_at           │     │ meeting_link          │
│ updated_at           │     │ status                │
└─────────────────────┘     │ feedback              │
                             └──────────────────────┘
┌─────────────────────┐
│  PointsEscrow        │     ┌──────────────────────┐
├─────────────────────┤     │   SavedSearch         │
│ id                   │     ├──────────────────────┤
│ member_id (FK)       │     │ id                    │
│ application_id (FK)  │     │ member_id (FK)        │
│ amount_blocked       │     │ query                 │
│ status               │     │ filters (JSON)        │
│ blocked_at           │     │ alert_enabled         │
│ resolved_at          │     └──────────────────────┘
│ resolution_type      │
│   (deducted/released)│     ┌──────────────────────┐
└─────────────────────┘     │   SavedJob            │
                             ├──────────────────────┤
┌─────────────────────┐     │ id                    │
│    JobReferral       │     │ member_id (FK)        │
├─────────────────────┤     │ job_id (FK)           │
│ id                   │     │ saved_at              │
│ referrer_id (FK)     │     └──────────────────────┘
│ candidate_id (FK)    │
│ job_id (FK)          │     ┌──────────────────────┐
│ status               │     │  SkillEndorsement     │
│ points_awarded       │     ├──────────────────────┤
└─────────────────────┘     │ id                    │
                             │ endorser_id (FK)      │
                             │ member_id (FK)        │
                             │ skill                 │
                             │ endorsed_at           │
                             └──────────────────────┘
```

### 15.2 Points Transaction Types (Job Portal)

| Transaction Type          | Direction | Amount         | Trigger                                        |
| ------------------------- | --------- | -------------- | ---------------------------------------------- |
| `JOB_APPLICATION_BLOCK`   | Block     | Admin-set      | Member applies for a job (after first free)    |
| `JOB_APPLICATION_DEDUCT`  | Debit     | Blocked amount | Employer confirms interview                    |
| `JOB_APPLICATION_RELEASE` | Release   | Blocked amount | Rejection pre-interview / expiry / withdrawal  |
| `JOB_APPLICATION_WAIVER`  | N/A       | 0              | First-ever application (free)                  |
| `SUCCESSFUL_HIRE_REWARD`  | Credit    | 100 points     | Job seeker confirms hiring                     |
| `PREMIUM_JOB_POST`        | Debit     | Admin-set      | Posting beyond 5-job limit (post-intro period) |
| `REFERRAL_BONUS`          | Credit    | Admin-set      | Referred candidate gets hired                  |

### 15.3 Escrow Status Enum

```
BLOCKED → DEDUCTED   (interview confirmed)
BLOCKED → RELEASED   (rejected / expired / withdrawn)
```

### 15.4 Application Status Enum

```
APPLIED → UNDER_REVIEW → SHORTLISTED → INTERVIEW_SCHEDULED → OFFERED → HIRED
                                              ↑
                                       Escrow → DEDUCTED
         ↘ REJECTED (any stage)
              ↑
         If pre-interview: Escrow → RELEASED
         If post-interview: No refund
```

---

## 16. Admin Configuration Panel

All dynamic economy values are controlled through a dedicated **Admin Settings UI** under the Job Portal section.

### 16.1 Configurable Parameters

| Parameter                   | Description                                 | Default (Suggested) | Where Used                                |
| --------------------------- | ------------------------------------------- | ------------------- | ----------------------------------------- |
| **Application Points Cost** | Points blocked per application              | 10 points           | Applied when member submits application   |
| **Referral Bonus Points**   | Points awarded for successful referral hire | 50 points           | Credited when referred candidate is hired |
| **Premium Intro Period**    | Duration of free unlimited posting          | 3 months            | After 5-post limit is hit                 |
| **Premium Post Cost**       | Points per job post after intro period      | 20 points           | Deducted on post submission               |
| **Escrow Grace Period**     | Days after job expiry before auto-release   | 7 days              | Background job releases blocked points    |
| **Resume Retention**        | Months before auto-deletion                 | 6 months            | Cleanup background job                    |
| **Free Post Limit**         | Number of free job posts per member         | 5                   | Before Premium upgrade required           |
| **Hire Reward Points**      | Points awarded to poster on successful hire | 100 points          | On hire confirmation                      |

### 16.2 Admin UI Requirements

- Dedicated **"Job Portal Settings"** page in admin panel
- All values editable via simple form inputs with save/cancel
- Changes take effect **immediately** for new transactions (existing escrows honor original amount)
- **Audit log** of all parameter changes (who changed, when, old value → new value)
- **Preview mode**: admin can see the impact of proposed changes before saving
- Role-restricted: only Super Admins can modify economy parameters

---

## 17. Development Timeline

| Phase                            | Duration  | Scope                                                                                                                                                         |
| -------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase A: Foundation**          | 4-6 weeks | Database schema, SSO integration, job seeker profile, company profile, basic job CRUD, admin approval workflow, admin config panel                            |
| **Phase B: Core Portal**         | 6-8 weeks | Search and filters (Elasticsearch), job posting with WYSIWYG, application flow with points escrow, one-click apply, resume upload/builder, wallet integration |
| **Phase C: ATS & Communication** | 4-6 weeks | Employer dashboard, candidate management pipeline, interview scheduling (escrow→deduct trigger), calendar integration, chat messaging integration             |
| **Phase D: Intelligence**        | 4-6 weeks | AI job matching, recommendations engine, analytics dashboards (admin, employer, candidate), email digests, background jobs (escrow release, cleanup)          |
| **Phase E: Polish & Launch**     | 2-4 weeks | Google for Jobs SEO, LinkedIn import, skill endorsements, networking events, referral system, load testing (200 jobs/4000 apps per month), beta launch        |

**Estimated Total: 20-30 weeks (5-7 months)**

> This timeline assumes a dedicated development team and can run in parallel with other CultureConnect platform phases. The job portal should ideally begin after Phase 1 (MVP) core features are stable.

---

## 18. Key Decisions Summary

| Decision             | Choice                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Hosting              | Separate subdomain: `job.[domain]`                                                         |
| Access Model         | Community-exclusive (members only for full access)                                         |
| Posting Approval     | Admin approval required for all posts                                                      |
| Posting Limits       | 5 free active posts, then points-based Premium tier                                        |
| Application Method   | Internal only (no external links or email)                                                 |
| Points Model         | **Escrow system** — blocked on apply, deducted on interview confirm, released on rejection |
| Application Cost     | **Admin-configurable** via UI (dynamic)                                                    |
| Referral Bonus       | **Admin-configurable** via UI (dynamic)                                                    |
| Premium Intro Period | **Admin-configurable** via UI (dynamic)                                                    |
| Hire Reward          | 100 points to poster on successful hire                                                    |
| First Application    | Always free (waived)                                                                       |
| Resume Builder       | Built-in with multiple versions                                                            |
| ATS                  | Full-featured with pipeline stages and interview scheduling                                |
| Messaging            | Employer-initiated only via existing chat system                                           |
| Verification         | Company verified through job posting admin approval                                        |
| Reference Platform   | AngelList (community-first approach)                                                       |
| AI Features          | Job matching, profile suggestions, skills gap analysis                                     |
| Cultural Feature     | Apprenticeship revival with mentorship connections                                         |
| File Storage         | S3, 25 MB limit, PDF/DOCX, 6-month retention                                               |
| Search Engine        | Elasticsearch with Redis caching                                                           |
| Expected Volume      | 200 jobs/month, 4,000 applications/month                                                   |
| Search SLA           | < 300ms (p95)                                                                              |
| Page Load SLA        | < 2 seconds                                                                                |
| Uptime SLA           | 99.5%                                                                                      |
| Estimated Timeline   | 5-7 months development                                                                     |

---

**✅ All open items resolved. This document is ready for development.**

---

_End of Document — CultureConnect Job Portal PRD v1.1 (Final)_
