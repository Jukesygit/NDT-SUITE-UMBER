# Personal Data Breach Register

> **Data Controller**: Matrix Advanced Inspection Services
> **Statutory basis**: UK GDPR Article 33(5) — the controller shall document *any* personal data breach, including the facts, its effects and the remedial action taken, whether or not it was notifiable.
> **Schema**: the 13-field register defined in `docs/data-breach-response-plan.md` §4.
> **Maintained by**: REVIEW (owner): name the register owner (recommended: the Designated Data Protection Contact appointed in `docs/dpo-decision.md`).
> **Last updated**: 2026-08-26
> **Review frequency**: on every incident, and at the annual compliance review.

## How to use this register

Every incident gets **two** things:

1. a row in the **Index** below (one line, for scanning and for producing a register extract on request); and
2. a **full 13-field entry** in the *Entries* section (the schema is written vertically because 13 columns is not readable side-by-side — the field set is exactly the one in `data-breach-response-plan.md` §4, unabridged).

An incident is entered **whether or not it is notifiable**. The Article 33(1) / Article 34 decisions are themselves fields in the record, and a decision of "no notification" must be recorded with its reasoning — an unrecorded decision is a compliance gap even when the decision is correct.

Severity levels (`Critical` / `High` / `Medium` / `Low`) are defined in `docs/data-breach-response-plan.md` §2. The response procedure, notification templates and ICO contact details are in the same document; this register is the evidence trail, not the procedure.

> **REVIEW (owner): storage location.** This register is committed to the source repository, which also holds the incident's underlying design note (`docs/plans/2026-07-28-competency-attribution-and-session-hardening-design.md`) and the Engineering Log entry — so the data-subject names below are already present in the repo. However, `docs/third-party-dpa.md` records the standing policy that the GitLab/GitHub source repositories hold **code only, no personal data**. Recommendation: either (a) keep the register here and record an explicit, narrow exception to that policy for the incident-record names, or (b) hold the named register in the controller's own records and keep a pseudonymised copy here. Decide and record which.

## Index

| Breach ID | Date discovered | Severity | Summary | ICO notified | Individuals notified | Status |
|---|---|---|---|---|---|---|
| BR-2026-001 | 2026-07-28 | Medium | Certification record filed against the wrong data subject's profile by an administrator (human error) | REVIEW (owner): recommended NO — sign off or overrule | REVIEW (owner): recommended NO — sign off or overrule | Closed (remediation complete 2026-07-29; notification decisions pending sign-off) |

*No other personal data breaches have been recorded. The register was created on 2026-08-26; incidents before that date were reconstructed from the engineering record — see "Register completeness" below.*

## Entries

### BR-2026-001 — Competency record attributed to the wrong data subject

| Field | Detail |
|---|---|
| **Breach ID** | BR-2026-001 |
| **Date discovered** | 2026-07-28 |
| **Date occurred** | 2026-07-28 (discovered and corrected the same day; the misfiled record was created shortly before discovery) |
| **Description** | An administrator, entering competency data on behalf of others, added Ben Wilkes' TOFD Level 2 certificate — including the supporting certificate document — to Richard Biggar's personnel profile. The record was therefore (a) an accidental internal disclosure of one individual's certification data on another individual's profile, and (b) an accuracy/integrity failure on the receiving profile, which briefly showed a qualification the data subject does not hold. Access control behaved exactly as designed: only privileged roles may write competency records on behalf of another user, and the acting administrator held such a role. The failure was in data entry, not in the platform's authorisation model. |
| **Data affected** | One competency record and its attached certificate document: certification type (TOFD Level 2), issuing body, certification identifier, expiry date and the uploaded certificate file. No authentication credentials, contact details, financial data, or Article 9 special category data were involved. |
| **Individuals affected** | 2 data subjects — one whose certification data was placed on another person's profile, and one whose profile briefly carried a certification belonging to someone else. Both are NDT technicians employed within the controller's own organisation. No other organisation's data was involved (no cross-tenant exposure). |
| **Severity** | **Medium** — personal data was involved, but the incident was contained within the same hour and remained inside the controller's own authorised staff. Assessed against `data-breach-response-plan.md` §2: it is not a *Low* "near-miss", because real personal data was genuinely misfiled; it does not reach *High*, because there was no account compromise and no unauthorised party gained access — every person who could see the misfiled record already had a lawful basis to see competency records for workforce management. *Note for the reviewer:* the *High* row's example text mentions "unauthorised access to competency records"; that example describes access by someone **not** entitled to it, which is not what happened here. If the owner reclassifies this as High, the notification decisions below should be revisited. |
| **Containment actions** | The record was identified and corrected the same day: the certificate and its document were removed from the incorrect profile and filed against the correct data subject. A three-agent forensic sweep of the platform was run immediately — covering row-level security policies, session/identity handling, and the edge functions that write personnel data — to establish whether a technical defect could have produced the misattribution. It found none: RLS, session handling and the edge functions all behaved as designed. No credential revocation or system isolation was required, because no system was compromised. |
| **Root cause** | Human error during on-behalf-of data entry, made undetectable by a systems gap: at the time of the incident nothing in the platform recorded *who* performed a competency write, and the activity log recorded the actor but not the subject the action was performed **for**, so a misattribution left no visible trail and could not be spotted by review. The multi-tab session-clobber hypothesis was investigated during the forensic sweep and was not the cause. |
| **ICO notified** | **REVIEW (owner): recommended NO — sign off or overrule.** Recommended decision: no Article 33(1) notification. Reasoning against the statutory threshold ("unless the breach is unlikely to result in a risk to the rights and freedoms of natural persons"): one record and two data subjects were involved; the data stayed inside the controller's own authorised personnel and was never disclosed to any external party, other tenant organisation, or the public; no credentials, contact, financial or special category data were affected; the incorrect record was corrected the same day, before any employment or work-allocation decision could rely on it; and no evidence of onward access or use was found in the forensic sweep. The residual risk — a technician's record briefly showing a qualification they do not hold — is the material one, and it was eliminated by same-day correction. On that basis the breach is **unlikely to result in a risk** to rights and freedoms, so notification is not required and this register entry discharges the Article 33(5) documentation duty. *If the 72-hour window is a live consideration on any future incident, note it runs from awareness, so this decision must be taken and recorded promptly rather than at the next review.* |
| **Individuals notified** | **REVIEW (owner): recommended NO — sign off or overrule.** Recommended decision: no Article 34 notification. Article 34 is engaged only where the breach is likely to result in a **high** risk to the rights and freedoms of individuals; on the assessment above the risk does not reach the ordinary Article 33 threshold, so it does not reach the higher Article 34 one. Recommendation for the owner's consideration: even though formal notification is not required, both individuals were directly involved in the correction of their own records as a matter of ordinary operational handling — record here whether that contact took place, since it is useful evidence of transparency. |
| **Remediation** | Systemic fix delivered and applied to the live database on 2026-07-29 (migrations `20260728130000_competency_attribution.sql` and `20260728131000_fix_storage_insert_super_admin.sql`), designed in `docs/plans/2026-07-28-competency-attribution-and-session-hardening-design.md`:<br>• **Attribution** — `created_by` added to `employee_competencies` and `competency_documents`, set by a tamper-proof `BEFORE INSERT` trigger from the authenticated session, so every competency record now permanently records who created it. Surfaced in the UI as "Added by {name}" on competency cards.<br>• **On-behalf-of auditing** — the audit trigger now records `details.on_behalf_of` whenever an actor writes a row owned by another user; the admin activity log renders "for {name}" and offers an "on-behalf actions only" filter, so exactly the class of action that caused this incident is now reviewable.<br>• **Session-identity hardening** — the signed-in identity is now displayed in the application header (previously it was shown nowhere); a "Signed in as {name} — not you?" banner appears on restored sessions; the stale-identity guard in the auth layer was fixed to detect a *change* of session user rather than only an absent one, with the client-side query cache cleared on identity change; a write-time assertion guards self-service competency writes; and debug logging that emitted user email addresses was removed. |
| **Status** | **Closed** — containment, root-cause analysis and systemic remediation are complete and live. The two notification decisions remain open for owner sign-off; the entry cannot be treated as fully discharged until they are signed. |

## Register completeness

This register was created on 2026-08-26, following the ISO 27001-style posture assessment recorded in `docs/plans/2026-08-26-security-hardening-and-platform-ops-plan.md`, which identified the absence of any breach register as a compliance gap. BR-2026-001 was reconstructed from contemporaneous engineering records (the incident design note and `docs/Engineering Log.md`), which were written on the day of the incident.

Two adjacent points that are **not** breaches and are recorded here only so their absence from the register is deliberate rather than accidental:

- The security and GDPR audit of 2026-08-12 (`docs/security-audit-2026-08-12.md`) identified vulnerabilities — including cross-tenant read paths through the `manager` role and the controlled-documents storage policy — that *could* have permitted unauthorised access to personal data. These were findings from an internal review, not incidents: no evidence of exploitation was found, and they were remediated and deployed. Vulnerabilities are tracked in `docs/risk-register.md`, not here. Should evidence of exploitation ever emerge, an entry must be opened in this register.
- The `GEMINI_API_KEY` exposure (audit finding C1) concerned a third-party service credential, not personal data, and is therefore a security incident rather than a personal data breach.

## Reporting obligations at a glance

| Trigger | Deadline | Where the procedure lives |
|---|---|---|
| Any personal data breach | Enter in this register immediately | `docs/data-breach-response-plan.md` §4 |
| Breach likely to risk rights and freedoms | Notify the ICO within 72 hours of awareness | `docs/data-breach-response-plan.md` §3 Phase 3 |
| Breach likely to result in **high** risk | Notify affected individuals without undue delay | `docs/data-breach-response-plan.md` §3 Phase 4 |

ICO helpline 0303 123 1113 · https://ico.org.uk
