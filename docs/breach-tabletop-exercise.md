# Data Breach Tabletop Exercise

> **Purpose**: Test the breach response plan in a realistic scenario without an actual breach.
> **Frequency**: Annually (at minimum)
> **Duration**: 60-90 minutes
> **Participants**: All members of the incident response team (see `docs/data-breach-response-plan.md`)

## Instructions

1. Read the scenario aloud to all participants
2. Walk through each question in order
3. Record answers and decisions
4. After the exercise, complete the findings section
5. File this document as evidence of testing

---

## Scenario: Compromised Administrator Account

### Background

It is Tuesday at 14:30. You receive the following message from an organisation administrator:

> "I just got a call from one of my technicians saying they can see someone else's personnel records when they expand their own row. They can see home addresses and phone numbers for people in a different organisation. This has been happening since they logged in this morning."

### Phase 1: Detection & Initial Response (15 minutes)

**Question 1**: Who is the first person to be notified, and how?

**Question 2**: What is the immediate containment action? (Options to discuss: take the system offline? disable the affected user account? restrict personnel page access?)

**Question 3**: What evidence needs to be preserved right now, before any changes are made?

### Phase 2: Investigation (15 minutes)

**Question 4**: How do you determine what data was exposed? (Hint: activity logs, PII reveal logs)

**Question 5**: How do you determine how many individuals are affected?

**Question 6**: How do you determine when the issue started? (Hint: deployment logs, recent code changes, database migration history)

**Question 7**: What is the root cause? (In this scenario: a Row-Level Security policy was accidentally dropped during a database migration)

### Phase 3: Notification Assessment (15 minutes)

**Question 8**: Does this breach need to be reported to the ICO? Apply the test: is it likely to result in a risk to the rights and freedoms of individuals?

**Question 9**: If yes, what information do you need to include in the ICO notification? Who drafts it?

**Question 10**: Do affected individuals need to be notified? What would you tell them?

**Question 11**: It is now 15:00 on Tuesday. The 72-hour ICO notification deadline is Thursday 15:00. What is your timeline for the remaining steps?

### Phase 4: Remediation (15 minutes)

**Question 12**: How do you fix the immediate issue? (Restore the RLS policy)

**Question 13**: How do you verify the fix is working? (Test with different user roles)

**Question 14**: What process changes would prevent this from happening again? (RLS verification in CI? Pre-deployment checklist? Database migration review process?)

**Question 15**: When do you conduct the post-incident review, and who attends?

---

## Findings

Complete after the exercise.

| Field | Detail |
|---|---|
| **Exercise date** | [DATE] |
| **Participants** | [NAMES AND ROLES] |
| **Facilitator** | [NAME] |

### What went well

| # | Finding |
|---|---|
| 1 | |
| 2 | |
| 3 | |

### Gaps identified

| # | Gap | Severity | Remediation Action | Owner | Deadline |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

### Improvements to breach response plan

| # | Change to make | Reason |
|---|---|---|
| 1 | | |
| 2 | | |

### Overall assessment

| Question | Answer |
|---|---|
| Could the team identify and contain the breach within 1 hour? | Yes / No |
| Could the team complete ICO notification within 72 hours? | Yes / No |
| Did all participants know their role in the response plan? | Yes / No |
| Were communication channels clear and accessible? | Yes / No |

---

## Alternative Scenarios

Use these for future exercises (rotate annually):

### Scenario B: Stolen Laptop
An employee's laptop is stolen from their car. They were logged into NDT Suite and had exported a CSV of personnel data to their desktop. The laptop was not encrypted.

### Scenario C: Phishing Attack
An administrator clicks a phishing link and enters their NDT Suite credentials. The attacker logs in and downloads competency records for 50 technicians before the account is locked.

### Scenario D: Insider Threat
An administrator who is about to leave the company downloads all personnel data via the "Download My Data" admin export. They email it to their personal email address. This is discovered in the activity logs two days later.

### Scenario E: Supabase Outage
Supabase experiences a security incident affecting your project's region. They notify you that unauthorised access to database backups may have occurred. They cannot confirm whether your data was accessed.
