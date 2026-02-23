# Data Breach Response Plan

> **Last updated**: 2026-02-20
> **Owner**: [Data Protection Officer / Organisation Administrator]
> **Review frequency**: Annually and after any breach incident

## 1. Scope

This plan covers any breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to personal data processed by NDT Suite.

## 2. Breach Classification

### Severity Levels

| Level | Definition | Examples | Response Time |
|---|---|---|---|
| **Critical** | High-risk breach likely to affect rights and freedoms of data subjects | Unauthorised access to PII (addresses, DOB, next of kin), cross-tenant data exposure, credential compromise | ICO notification within 72 hours |
| **High** | Breach involving personal data but limited scope | Single user account compromise, unauthorised access to competency records | ICO notification within 72 hours if risk to individuals |
| **Medium** | Breach involving non-sensitive data or contained quickly | Temporary access logging failure, non-PII data exposure | Internal investigation, ICO notification if escalated |
| **Low** | Near-miss or contained incident | Failed attack attempt, vulnerability discovered before exploitation | Internal documentation only |

## 3. Response Procedure

### Phase 1: Identification & Containment (0-4 hours)

1. **Detect**: Breach identified via monitoring, user report, or audit log review
2. **Contain**: Immediately limit the breach:
   - Revoke compromised credentials
   - Disable affected accounts
   - Block suspicious IP addresses
   - Take affected systems offline if necessary
3. **Preserve evidence**: Do NOT delete logs. Screenshot dashboards. Export relevant activity logs
4. **Notify internal team**: Alert the incident response team (see Section 5)

### Phase 2: Assessment (4-24 hours)

1. **Scope**: Determine what data was affected, how many individuals, which organisations
2. **Cause**: Identify the root cause (vulnerability, human error, malicious action)
3. **Impact**: Assess the risk to affected individuals:
   - What data was exposed? (PII severity)
   - Can the data be used for identity theft, fraud, or discrimination?
   - Is the data encrypted or otherwise protected?
4. **Document**: Record all findings in the breach register (Section 6)

### Phase 3: ICO Notification (within 72 hours of awareness)

**Required if**: The breach is likely to result in a risk to the rights and freedoms of individuals.

**NOT required if**: The breach is unlikely to result in a risk (e.g., encrypted data, contained immediately, no PII involved).

#### ICO Notification Template

Submit via: https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/

Include:
- Description of the nature of the breach
- Categories and approximate number of individuals affected
- Categories and approximate number of personal data records affected
- Name and contact details of the DPO or contact point
- Description of likely consequences
- Description of measures taken or proposed to address the breach

### Phase 4: Individual Notification (within 72 hours if high risk)

**Required if**: The breach is likely to result in a HIGH risk to individuals.

#### Affected Individual Notification Template

```
Subject: Important: Data Security Incident Notification

Dear [Name],

We are writing to inform you of a data security incident that may have affected your personal information held in our NDT Suite system.

What happened:
[Brief factual description of the incident]

What information was involved:
[List specific data types affected]

What we are doing:
[Actions taken to contain and remediate]

What you can do:
- Change your password immediately at [URL]
- Monitor your accounts for suspicious activity
- Contact us at [email] if you have concerns

We have reported this incident to the Information Commissioner's Office (ICO).

We sincerely apologise for this incident and are taking steps to prevent recurrence.

[Name, Title]
[Organisation]
[Contact details]
```

### Phase 5: Remediation (1-4 weeks)

1. **Fix root cause**: Patch vulnerability, update configuration, retrain staff
2. **Review controls**: Assess whether existing security measures are sufficient
3. **Update procedures**: Revise this plan if the breach revealed gaps
4. **Post-incident review**: Conduct formal review with all stakeholders

## 4. Breach Register

Maintain a log of all breaches (required by Article 33(5)):

| Field | Description |
|---|---|
| Breach ID | Unique identifier |
| Date discovered | When the breach was identified |
| Date occurred | When the breach actually happened (if different) |
| Description | Nature of the breach |
| Data affected | Categories of personal data involved |
| Individuals affected | Number and categories of data subjects |
| Severity | Critical / High / Medium / Low |
| Containment actions | Steps taken to contain |
| Root cause | Identified cause |
| ICO notified | Yes/No + date |
| Individuals notified | Yes/No + date |
| Remediation | Actions taken to prevent recurrence |
| Status | Open / Closed |

## 5. Incident Response Team

| Role | Responsibility |
|---|---|
| **Incident Lead** | Coordinates response, makes notification decisions |
| **Technical Lead** | Containment, forensics, remediation |
| **Data Protection Officer** | ICO liaison, legal assessment, individual notification |
| **Communications** | Internal/external communications |

## 6. Contact Information

- **ICO helpline**: 0303 123 1113
- **ICO website**: https://ico.org.uk
- **ICO breach reporting**: https://ico.org.uk/make-a-complaint/
