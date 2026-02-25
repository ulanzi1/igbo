# GDPR Data Breach Response Runbook

> **Note:** This runbook will be migrated to the governance document repository in Story 11.5.

## Overview

GDPR Article 33 requires notification of the supervisory authority within **72 hours** of becoming aware of a personal data breach. Article 34 may additionally require notifying affected individuals.

This runbook covers:

1. Detecting and logging a breach
2. Generating an affected member list
3. Sending bulk breach notifications
4. Completing the incident report

---

## Step-by-Step Procedure

### 1. Detect the Breach

- Identify the nature of the breach (unauthorised access, accidental disclosure, data loss, etc.)
- Note the exact date/time the breach was discovered
- Start the 72-hour notification clock from this moment

### 2. Log the Incident

- Navigate to `/admin/breach-response`
- Set the **Incident Timestamp** to when the breach occurred (or was discovered)
- Generate the affected member list using the date range during which the breach window falls

### 3. Generate Affected Member List

- Use the "Generate Affected Member List" tool at `/admin/breach-response`
- Set **since** = start of breach window (ISO 8601, e.g. `2024-01-15T00:00:00Z`)
- Set **until** = end of breach window
- Review the list — confirm member count and scope

### 4. Send Bulk Notifications

- Compose the notification message explaining:
  - What data was exposed
  - When the breach occurred
  - What data was affected
  - Steps members can take to protect themselves
  - Contact information for questions
- Click "Send to N Member(s)" — the system emails each affected member and logs the action to the audit trail

### 5. Notify the Supervisory Authority

- File a report with the relevant Data Protection Authority within 72 hours
- Reference the incident timestamp logged in Step 2
- Include: nature of breach, categories and approximate count of affected individuals, likely consequences, measures taken

### 6. Document the Incident

- Record the full incident in the governance log (Story 11.5 — audit log viewer)
- Include: detection date, scope, notification date, regulatory filing reference

---

## Retention Cleanup Job

The daily anonymization job runs at **2:00 AM (server time)**.

**Cron entry (Docker Web container):**

```
0 2 * * * node -e "require('./dist/server/jobs/index.js'); require('./dist/server/jobs/retention-cleanup.js');"
```

This job:

1. Queries `auth_users` for accounts with `account_status = 'PENDING_DELETION'` and `scheduled_deletion_at <= NOW()`
2. Anonymizes each account: replaces PII with placeholder values, sets `account_status = 'ANONYMIZED'`
3. Logs each anonymization to the audit trail
4. Emits `member.anonymizing` (before) and `member.anonymized` (after) events

---

## Data Export Feature Flag

```bash
INCLUDE_RECEIVED_MESSAGES_IN_EXPORT=false
```

**Legal review required before enabling.** The default `false` excludes received messages from GDPR data exports (Article 20 — right to data portability). Received messages may contain third-party data; the exclusion policy must be confirmed by legal counsel before enabling.

**Tracking:** Legal review status for this decision should be tracked in this document until Story 11.5 governance repository is implemented.

| Date | Reviewer      | Decision | Notes                                     |
| ---- | ------------- | -------- | ----------------------------------------- |
| TBD  | Legal Counsel | Pending  | Received-message inclusion in GDPR export |

---

## Contact

For questions about GDPR compliance procedures, contact the Data Protection Officer (DPO) or legal counsel.
