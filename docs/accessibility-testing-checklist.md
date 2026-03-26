# Accessibility Testing Checklist — OBIGBO Platform

## Purpose

Pre-launch manual accessibility verification checklist for the OBIGBO community platform.
Covers WCAG 2.1 AA compliance across all critical user flows using screen readers and keyboard-only navigation.

## Screen Reader Setup

### VoiceOver (macOS)

- **Toggle**: `Cmd + F5` (or triple-click Touch ID button on Touch Bar Macs)
- **Navigation**: `Ctrl + Option + Arrow` to move through content; `Ctrl + Option + Space` to activate
- **Headings**: `Ctrl + Option + Cmd + H` to jump between headings
- **Links**: `Ctrl + Option + Cmd + L` to jump between links
- **Web Rotor**: `Ctrl + Option + U` to open the rotor for landmarks, headings, links

### VoiceOver (iOS)

- **Toggle**: Triple-click side/Home button, or ask Siri "Turn on VoiceOver"
- **Navigation**: Swipe left/right to move through elements; double-tap to activate
- **Scroll**: Three-finger swipe

### NVDA (Windows)

- **Toggle**: `Ctrl + Alt + N` (if shortcut configured)
- **Navigation**: Arrow keys to move through content; `Enter` to activate links/buttons
- **Headings**: `H` to jump to next heading; `1-6` for heading levels
- **Landmarks**: `D` to jump between landmarks
- **Links**: `K` to jump to next link; `L` for lists
- **Forms**: `F` to jump to form fields; `Enter` to open combo boxes

---

## Critical User Flows

### Flow 1: Guest Landing Page

| Test Step                                              | VoiceOver (macOS) | NVDA (Windows) | iOS VoiceOver | Pass/Fail |
| ------------------------------------------------------ | ----------------- | -------------- | ------------- | --------- |
| Page title announced correctly                         | ☐                 | ☐              | ☐             |           |
| Skip link present and working ("Skip to main content") | ☐                 | ☐              | ☐             |           |
| Main navigation landmark announced                     | ☐                 | ☐              | ☐             |           |
| Heading hierarchy is logical (H1 → H2 → H3)            | ☐                 | ☐              | ☐             |           |
| All images have meaningful alt text                    | ☐                 | ☐              | ☐             |           |
| "Apply to Join" CTA button label is announced          | ☐                 | ☐              | ☐             |           |
| Footer landmark present and announced                  | ☐                 | ☐              | ☐             |           |
| Language toggle button announced with current language | ☐                 | ☐              | ☐             |           |

---

### Flow 2: Login Flow

| Test Step                                          | VoiceOver (macOS) | NVDA (Windows) | iOS VoiceOver | Pass/Fail |
| -------------------------------------------------- | ----------------- | -------------- | ------------- | --------- |
| Page heading "Sign In" announced                   | ☐                 | ☐              | ☐             |           |
| Email field label announced before input           | ☐                 | ☐              | ☐             |           |
| Password field label announced before input        | ☐                 | ☐              | ☐             |           |
| Required field indication announced                | ☐                 | ☐              | ☐             |           |
| Form validation error messages announced on submit | ☐                 | ☐              | ☐             |           |
| Incorrect credentials error announced              | ☐                 | ☐              | ☐             |           |
| Successful login transition announced              | ☐                 | ☐              | ☐             |           |
| "Forgot password?" link accessible and labeled     | ☐                 | ☐              | ☐             |           |

---

### Flow 3: Onboarding Wizard

| Test Step                                             | VoiceOver (macOS) | NVDA (Windows) | iOS VoiceOver | Pass/Fail |
| ----------------------------------------------------- | ----------------- | -------------- | ------------- | --------- |
| Current step number announced (e.g., "Step 2 of 5")   | ☐                 | ☐              | ☐             |           |
| Step title announced when advancing                   | ☐                 | ☐              | ☐             |           |
| Required fields indicated before input                | ☐                 | ☐              | ☐             |           |
| Progress indicator readable (not just visual)         | ☐                 | ☐              | ☐             |           |
| "Continue" / "Back" button labels clear and announced | ☐                 | ☐              | ☐             |           |
| Character counter on bio field announced              | ☐                 | ☐              | ☐             |           |
| Profile photo upload button labeled                   | ☐                 | ☐              | ☐             |           |
| Completion success message announced                  | ☐                 | ☐              | ☐             |           |

---

### Flow 4: Member Dashboard

| Test Step                                                          | VoiceOver (macOS) | NVDA (Windows) | iOS VoiceOver | Pass/Fail |
| ------------------------------------------------------------------ | ----------------- | -------------- | ------------- | --------- |
| Dashboard heading announced                                        | ☐                 | ☐              | ☐             |           |
| Widget headings (e.g., "Your Points", "Upcoming Events") announced | ☐                 | ☐              | ☐             |           |
| Notification count in bell announced ("X unread notifications")    | ☐                 | ☐              | ☐             |           |
| Navigation landmarks (nav, main, aside) present                    | ☐                 | ☐              | ☐             |           |
| Points total announced with unit (e.g., "450 points")              | ☐                 | ☐              | ☐             |           |
| Upcoming event card details readable                               | ☐                 | ☐              | ☐             |           |
| "View all" links have context (not just "click here")              | ☐                 | ☐              | ☐             |           |

---

### Flow 5: Chat

| Test Step                                                            | VoiceOver (macOS) | NVDA (Windows) | iOS VoiceOver | Pass/Fail |
| -------------------------------------------------------------------- | ----------------- | -------------- | ------------- | --------- |
| Conversation list announced with sender names                        | ☐                 | ☐              | ☐             |           |
| Message list region announced                                        | ☐                 | ☐              | ☐             |           |
| Each message announced with sender name and timestamp                | ☐                 | ☐              | ☐             |           |
| New message notification announced (live region)                     | ☐                 | ☐              | ☐             |           |
| Typing indicator is hidden from screen reader (or announced briefly) | ☐                 | ☐              | ☐             |           |
| Message input field labeled ("Type a message")                       | ☐                 | ☐              | ☐             |           |
| Send button labeled                                                  | ☐                 | ☐              | ☐             |           |
| Attachment button labeled                                            | ☐                 | ☐              | ☐             |           |
| Emoji picker button labeled                                          | ☐                 | ☐              | ☐             |           |

---

### Flow 6: Member Directory

| Test Step                                               | VoiceOver (macOS) | NVDA (Windows) | iOS VoiceOver | Pass/Fail |
| ------------------------------------------------------- | ----------------- | -------------- | ------------- | --------- |
| Page heading announced                                  | ☐                 | ☐              | ☐             |           |
| Search field labeled                                    | ☐                 | ☐              | ☐             |           |
| Filter options (location, interests) labeled            | ☐                 | ☐              | ☐             |           |
| Result count announced after search ("X members found") | ☐                 | ☐              | ☐             |           |
| Each member card readable: name, location, bio excerpt  | ☐                 | ☐              | ☐             |           |
| "Follow" button per card announced with member name     | ☐                 | ☐              | ☐             |           |
| "Message" button per card labeled                       | ☐                 | ☐              | ☐             |           |
| Pagination / load-more announced                        | ☐                 | ☐              | ☐             |           |

---

### Flow 7: Article Reading Experience

| Test Step                                                                 | VoiceOver (macOS) | NVDA (Windows) | iOS VoiceOver | Pass/Fail |
| ------------------------------------------------------------------------- | ----------------- | -------------- | ------------- | --------- |
| Article H1 title announced                                                | ☐                 | ☐              | ☐             |           |
| Heading hierarchy within article correct (H2, H3)                         | ☐                 | ☐              | ☐             |           |
| Language toggle ("English / Igbo") button announced with current language | ☐                 | ☐              | ☐             |           |
| Author name and publish date accessible                                   | ☐                 | ☐              | ☐             |           |
| Bookmark button labeled with article title (not just "bookmark")          | ☐                 | ☐              | ☐             |           |
| Comments section heading present                                          | ☐                 | ☐              | ☐             |           |
| Comment input field labeled                                               | ☐                 | ☐              | ☐             |           |
| Related articles section navigable                                        | ☐                 | ☐              | ☐             |           |

---

### Flow 8: Event Pages

| Test Step                                                         | VoiceOver (macOS) | NVDA (Windows) | iOS VoiceOver | Pass/Fail |
| ----------------------------------------------------------------- | ----------------- | -------------- | ------------- | --------- |
| Event listing page heading announced                              | ☐                 | ☐              | ☐             |           |
| Each event card readable: title, date, format, location           | ☐                 | ☐              | ☐             |           |
| Event date and time in accessible format (not only visual)        | ☐                 | ☐              | ☐             |           |
| Event detail page: H1 announced                                   | ☐                 | ☐              | ☐             |           |
| RSVP button state announced ("Register" vs "Cancel Registration") | ☐                 | ☐              | ☐             |           |
| Waitlist position announced if on waitlist                        | ☐                 | ☐              | ☐             |           |
| "Add to Calendar" button labeled                                  | ☐                 | ☐              | ☐             |           |
| Video meeting join link announced when available                  | ☐                 | ☐              | ☐             |           |

---

### Flow 9: Admin Dashboard

| Test Step                                                          | VoiceOver (macOS) | NVDA (Windows) | iOS VoiceOver | Pass/Fail |
| ------------------------------------------------------------------ | ----------------- | -------------- | ------------- | --------- |
| Admin navigation landmark separate from member nav                 | ☐                 | ☐              | ☐             |           |
| Analytics data table headers announced                             | ☐                 | ☐              | ☐             |           |
| Moderation queue table: action buttons labeled per row             | ☐                 | ☐              | ☐             |           |
| "Approve" / "Reject" buttons have context (include report summary) | ☐                 | ☐              | ☐             |           |
| Status tags (Pending, Active, Suspended) announced                 | ☐                 | ☐              | ☐             |           |
| Audit log table navigable by row                                   | ☐                 | ☐              | ☐             |           |
| Member search in admin labeled                                     | ☐                 | ☐              | ☐             |           |
| Destructive action confirmation dialogs announced                  | ☐                 | ☐              | ☐             |           |

---

## NFR-A Checklist

### NFR-A1: WCAG 2.1 AA Compliance

**Requirement**: WCAG 2.1 AA across all pages
**Measurement**: Automated (axe-core + Lighthouse CI) + manual screen reader pass

| Check                                                               | Status |
| ------------------------------------------------------------------- | ------ |
| Lighthouse CI accessibility score ≥ 90 on all scanned pages         | ☐      |
| `bun test` passes `src/lib/accessibility.test.ts` (contrast ratios) | ☐      |
| No critical/serious axe violations in Playwright E2E scans          | ☐      |
| No critical/serious axe violations in vitest-axe component scans    | ☐      |

**Steps**:

1. Run `bun test` — `accessibility.test.ts` must pass
2. Run CI — Lighthouse accessibility score column in CI results
3. Review Playwright accessibility scan output in CI artifacts

---

### NFR-A2: Keyboard Navigation

**Requirement**: All interactive elements reachable and operable via keyboard
**Measurement**: Playwright E2E keyboard tests (`e2e/keyboard-navigation.spec.ts`)

| Check                                                             | Status |
| ----------------------------------------------------------------- | ------ |
| Skip link present and activatable via Enter                       | ☐      |
| All nav links, buttons, and inputs Tab-reachable                  | ☐      |
| Focus indicators visible (non-zero outline)                       | ☐      |
| No keyboard traps (modal Escape closes; Tab cycles within modal)  | ☐      |
| Login form Tab order: email → password → submit                   | ☐      |
| Dropdown/select Arrow keys navigate, Enter selects, Escape closes | ☐      |

**Steps**:

1. Run `bunx playwright test e2e/keyboard-navigation.spec.ts` locally
2. Manually verify with keyboard-only session on Chrome/Firefox

---

### NFR-A3: Screen Reader Compatibility

**Requirement**: Full compatibility with VoiceOver (macOS/iOS) and NVDA (Windows)
**Measurement**: Manual checklist (this document)

| Check                                                                | Status |
| -------------------------------------------------------------------- | ------ |
| All 9 critical flows tested with VoiceOver (macOS)                   | ☐      |
| All 9 critical flows tested with NVDA (Windows)                      | ☐      |
| iOS VoiceOver tested on mobile-critical flows (landing, login, chat) | ☐      |

**Steps**: Use the flow tables above. Mark each cell as Pass (✅) or Fail (❌) and log failures as GitHub issues labeled `a11y`.

---

### NFR-A4: Color Contrast Ratios

**Requirement**: Minimum 4.5:1 for normal text, 3:1 for large text
**Measurement**: `src/lib/accessibility.test.ts` (runs via `bun test`)

| Color Pair                                               | Computed Ratio | WCAG Requirement | Status         |
| -------------------------------------------------------- | -------------- | ---------------- | -------------- |
| foreground (#1A1612) on background (#FAF8F5)             | ≥ 12:1         | 4.5:1            | ✅ Auto-tested |
| primary-foreground (white) on primary (#2D5A27)          | ≥ 4.5:1        | 4.5:1            | ✅ Auto-tested |
| secondary-foreground (#3D2415) on secondary (#D4A574)    | ≥ 4.5:1        | 4.5:1            | ✅ Auto-tested |
| muted-foreground (#78716C) on background (#FAF8F5)       | ≥ 4.5:1        | 4.5:1            | ✅ Auto-tested |
| HC foreground (#141414) on HC background (#FFFFFF)       | ≥ 15:1         | 7:1              | ✅ Auto-tested |
| HC muted-foreground (#4A4540) on HC background (#FFFFFF) | ≥ 7:1          | 7:1              | ✅ Auto-tested |

---

### NFR-A5: Minimum Touch/Click Target Size

**Requirement**: 44×44px minimum for all interactive elements
**Measurement**: `min-h-[44px]` class on Button and Input; axe-core target-size rule

| Check                                                             | Status                                   |
| ----------------------------------------------------------------- | ---------------------------------------- |
| `button.tsx` has `min-h-[44px]`                                   | ✅ Auto-tested (`accessibility.test.ts`) |
| `input.tsx` has `min-h-[44px]`                                    | ✅ Auto-tested (`accessibility.test.ts`) |
| Small icon-only buttons (NotificationBell, ContrastToggle) ≥ 44px | ☐ Manual check                           |

---

### NFR-A6: Minimum Body Text Size

**Requirement**: 16px minimum for body text
**Measurement**: `globals.css` `font-size: 16px`; `input.tsx` `text-base` (not `text-sm`)

| Check                                                | Status         |
| ---------------------------------------------------- | -------------- |
| `globals.css` has `font-size: 16px` in `@layer base` | ✅ Auto-tested |
| `input.tsx` uses `text-base` (not `md:text-sm`)      | ✅ Auto-tested |
| Body text visually ≥ 16px at 100% zoom               | ☐ Manual check |

---

### NFR-A7: Reduced Motion Support

**Requirement**: Respect `prefers-reduced-motion`; no critical info solely through animation
**Measurement**: `globals.css` media query; `useReducedMotion` hook

| Check                                                                            | Status         |
| -------------------------------------------------------------------------------- | -------------- |
| `globals.css` contains `prefers-reduced-motion: reduce` media query              | ✅ Auto-tested |
| `animate-pulse` suppressed in reduced-motion mode                                | ✅ Auto-tested |
| `useReducedMotion` hook used in animated components                              | ✅ Code review |
| Test manually: enable OS reduced-motion setting → no spinning/pulsing animations | ☐ Manual check |

---

### NFR-A8: High Contrast Mode

**Requirement**: Optional high-contrast mode toggle for low-vision users
**Measurement**: `data-contrast="high"` palette; `ContrastToggle` component; `use-contrast-mode` hook

| Check                                                                          | Status         |
| ------------------------------------------------------------------------------ | -------------- |
| `ContrastToggle` button visible in nav/header                                  | ☐ Visual check |
| Activating toggle applies `data-contrast="high"` to `<html>`                   | ✅ Auto-tested |
| High-contrast foreground/background meets WCAG AAA (7:1+)                      | ✅ Auto-tested |
| Preference persisted to localStorage                                           | ✅ Auto-tested |
| Test manually: activate HC mode → all text clearly readable against background | ☐ Manual check |

---

### NFR-A9: Semantic HTML Structure

**Requirement**: All pages use proper heading hierarchy, landmarks, and ARIA labels
**Measurement**: Automated (axe-core) + manual audit; `eslint-plugin-jsx-a11y` at build time

| Check                                                       | Status                  |
| ----------------------------------------------------------- | ----------------------- |
| `<html lang={locale}>` present on every page                | ✅ `src/app/layout.tsx` |
| `<main id="main-content">` landmark present                 | ✅ Layout               |
| Skip link `href="#main-content"` present                    | ✅ `SkipLink` component |
| `eslint-plugin-jsx-a11y` passes (no build-time lint errors) | ✅ Part of `bun lint`   |
| Heading hierarchy starts at H1 (not H2/H3) on each page     | ☐ Per-page audit        |
| ARIA labels on icon-only buttons (bell, search, close)      | ☐ Spot-check 5 pages    |
| ARIA live regions present for toast notifications           | ☐ Manual SR test        |

---

## Known Limitations

The following items are **deferred** from the pre-launch accessibility milestone and should be tracked as future improvements:

1. **Analytics dashboard charts**: Chart.js/Recharts visualizations in the admin analytics dashboard require ARIA descriptions (`aria-label` on `<canvas>`) for screen reader access. Data tables as alternatives are a future enhancement (post-launch).

2. **Rich text editor (Tiptap)**: The Tiptap article editor is complex contenteditable. Basic keyboard navigation works, but full ARIA toolbar/grid patterns require Tiptap extension customization (deferred to post-launch).

3. **Video meeting interface (Daily.co)**: Daily.co `<iframe>` accessibility is controlled by Daily's platform. OBIGBO provides a pre-meeting accessibility check page (NFR-A checklist items covered); in-meeting controls are Daily's responsibility.

4. **Complex drag-and-drop**: Any future drag-and-drop interfaces (e.g., post reordering) require ARIA drag-and-drop patterns (`aria-grabbed`, keyboard move mode). No such interfaces exist at launch.

5. **Real-time live regions**: Chat new-message live regions are implemented but NVDA/JAWS announcement timing depends on screen reader settings. Some users may need to adjust their "verbosity" settings.

---

## How to Use This Checklist

1. **Before each release**: Run automated checks (`bun test`, CI Lighthouse, Playwright E2E)
2. **Pre-launch**: Complete manual screen reader passes for all 9 critical flows
3. **Log failures**: Create GitHub issues with label `a11y` and priority based on NFR impact
4. **Sign-off**: Mark each NFR-A section as "Verified" with tester name and date

---

_Last updated: 2026-03-25_
_Maintained by: Platform Team_
_References: WCAG 2.1 AA — https://www.w3.org/TR/WCAG21/_
