# Subject Access Request (SAR) Procedure

> **Data Controller**: [YOUR COMPANY NAME]
> **Date**: 2026-02-20
> **Legal Basis**: UK GDPR Article 15

## 1. Overview

A Subject Access Request (SAR) is a request from an individual (or their authorised representative) to receive a copy of the personal data held about them. This procedure covers SARs that cannot be handled via the self-service "Download My Data" feature (e.g., requests from ex-employees, requests via solicitors, requests from individuals who cannot access their account).

**Self-service SARs**: Active users should be directed to use the "Download My Data" button on their profile page, which provides an immediate, formatted export.

## 2. Receiving a SAR

A SAR can be made:
- Verbally (phone, in person)
- In writing (email, letter)
- Via a third party (solicitor, representative with written authorisation)
- Via any employee of the organisation (all staff should be trained to recognise SARs)

**A SAR does not need to mention "subject access request", "GDPR", or "Article 15".** Any request for personal data should be treated as a SAR.

### Examples that constitute a SAR:
- "Can I have a copy of everything you hold about me?"
- "What data do you have on file for me?"
- "My solicitor has written to request my personnel records"
- "I left the company — can I get my qualification records?"

## 3. Procedure

### Step 1: Log the request (Day 0)

Record in the SAR register:
- Date received
- Requester name
- Contact details
- Method of request (email, phone, letter, third party)
- Who received it

**The 30-day clock starts from the day the request is received**, not from when identity is verified.

### Step 2: Verify identity (Days 1-5)

Before disclosing personal data, verify the requester's identity:

**If the requester is the data subject:**
- Verify via their registered email address
- If they can't access their email, request government-issued photo ID
- Do not request more information than necessary for verification

**If the requester is a third party (e.g., solicitor):**
- Request written authorisation from the data subject, OR
- Request evidence of legal authority (e.g., power of attorney, court order)
- Verify the third party's identity independently

**If identity cannot be verified:**
- Inform the requester that you cannot process the SAR without verification
- This does NOT stop the 30-day clock
- Document the reason for delay

### Step 3: Gather data (Days 5-20)

Export the individual's data from NDT Suite:

1. **If the user account still exists**: Use the admin panel or run the data export query directly:
   ```
   -- In Supabase SQL editor, replace USER_ID:
   SELECT * FROM profiles WHERE id = 'USER_ID';
   SELECT * FROM employee_competencies WHERE user_id = 'USER_ID';
   SELECT * FROM competency_history WHERE user_id = 'USER_ID';
   SELECT * FROM activity_log WHERE user_id = 'USER_ID';
   SELECT * FROM permission_requests WHERE user_id = 'USER_ID';
   ```

2. **If the user account has been deleted**: Check anonymised activity logs. If data has been deleted per the retention schedule, inform the requester that data is no longer held.

3. **Check all storage**: Include any documents in the Supabase storage buckets (avatars, competency documents).

4. **Review for third-party data**: Before sending, check that the response doesn't include personal data about *other* individuals. Redact if necessary.

### Step 4: Prepare response (Days 20-28)

Provide:
- A copy of all personal data held (in a commonly used electronic format)
- The purposes of processing
- The categories of data
- Who the data has been shared with
- The retention period
- Their rights (rectification, erasure, complaint to ICO)
- The source of the data (if not collected from them directly)

Use the response template below.

### Step 5: Send response (Day 28 at latest)

- Send via secure means (encrypted email or secure file sharing — NOT unencrypted email attachment)
- Confirm receipt
- Log completion in the SAR register

## 4. Response Template

```
Subject: Your Subject Access Request — Response

Dear [Name],

Thank you for your request dated [DATE] for a copy of your personal data
held by [COMPANY NAME] via the NDT Suite platform.

Please find attached a copy of all personal data we hold about you. This
includes:

- Your profile information (contact details, personal details)
- Your competency and certification records
- Your competency change history
- Your activity log (system actions attributed to your account)
- Any permission or account requests you submitted

PURPOSES OF PROCESSING:
Your data is processed for workforce competency management and regulatory
compliance with NDT industry standards (PED 2014/68/EU, EN ISO 9712).

RECIPIENTS:
Your data is accessible to your organisation's administrators and managers.
Our data processor is Supabase Inc. (infrastructure hosting). No other
third parties have access.

RETENTION:
Your profile data is retained for the duration of employment plus 6 years.
Competency records are retained for the expiry date plus 6 years. Activity
logs are retained for 3 years. Full details are in our data retention
schedule.

YOUR RIGHTS:
You have the right to:
- Request correction of inaccurate data (Article 16)
- Request deletion of your data (Article 17)
- Object to processing (Article 21)
- Lodge a complaint with the ICO (ico.org.uk, 0303 123 1113)

If you have any questions about this response, please contact [CONTACT EMAIL].

Yours sincerely,
[NAME, ROLE]
[COMPANY NAME]
```

## 5. Timelines

| Scenario | Deadline |
|---|---|
| Standard SAR | 30 calendar days from receipt |
| Complex/voluminous SAR | Up to 90 days (must notify requester of extension within 30 days with reasons) |
| Manifestly unfounded or excessive SAR | May refuse, but must explain why within 30 days |

## 6. Refusing a SAR

A SAR can only be refused if it is **manifestly unfounded or excessive** (e.g., repeated identical requests with no new data processing). If refusing:
- Respond within 30 days
- Explain why the request is considered unfounded/excessive
- Inform the requester of their right to complain to the ICO

## 7. SAR Register

Maintain a log of all SARs received:

| Field | Description |
|---|---|
| SAR ID | Unique reference number |
| Date received | When the request was received |
| Requester | Name of the data subject |
| Method | Email / Letter / Phone / Third party |
| Received by | Staff member who received the request |
| Identity verified | Date identity was confirmed |
| Response sent | Date the response was provided |
| Deadline | 30 days from receipt |
| Extension applied | Yes/No (with reason if yes) |
| Outcome | Completed / Refused (with reason) |
| Notes | Any relevant notes |
