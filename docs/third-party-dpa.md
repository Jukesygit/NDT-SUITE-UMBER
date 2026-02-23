# Third-Party Data Processing Agreements

> **Last updated**: 2026-02-20

## Supabase Inc.

| Field | Detail |
|---|---|
| **Processor** | Supabase Inc. |
| **Services** | Database hosting (PostgreSQL), user authentication, file storage (S3-compatible), Edge Functions |
| **DPA Location** | https://supabase.com/legal/dpa |
| **DPA Status** | Pending — download, review, and countersign |
| **Data Processed** | All application data: user profiles, competencies, documents, activity logs, authentication credentials |
| **Sub-processors** | AWS (infrastructure), as listed in Supabase's sub-processor list |
| **Data Location** | Per Supabase project region configuration |
| **Encryption** | At rest (AES-256), in transit (TLS 1.2+) |
| **Deletion** | Data deleted within 30 days of project deletion per Supabase terms |

### Action Required

1. Download DPA from https://supabase.com/legal/dpa
2. Review clauses against UK GDPR requirements (Articles 28, 32)
3. Verify sub-processor list is acceptable
4. Countersign and file with organisation records
5. Set calendar reminder for annual review

## No Other Third-Party Processors

NDT Suite does not use any other third-party services that process personal data:
- No analytics services (no Google Analytics, no Mixpanel)
- No tracking pixels or advertising
- No third-party error tracking (errors stored locally)
- No CDN for user-uploaded content (served via Supabase storage)
- No email service for transactional emails beyond Supabase Auth
