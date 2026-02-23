/**
 * Privacy Policy Page
 * Publicly accessible (no auth required) - GDPR Articles 13/14
 */

export default function PrivacyPolicyPage() {
    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: 'var(--surface-base, #0a0a0a)',
            color: 'var(--text-primary, #ffffff)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
            <div style={{
                maxWidth: '800px',
                margin: '0 auto',
                padding: '48px 24px',
                lineHeight: '1.7',
            }}>
                {/* Header */}
                <div style={{ marginBottom: '48px' }}>
                    <a
                        href="/login"
                        style={{
                            color: 'var(--text-secondary, #9ca3af)',
                            textDecoration: 'none',
                            fontSize: '14px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginBottom: '24px',
                        }}
                    >
                        &larr; Back to login
                    </a>
                    <h1 style={{ fontSize: '32px', fontWeight: '700', marginBottom: '8px' }}>
                        Privacy Policy
                    </h1>
                    <p style={{ color: 'var(--text-secondary, #9ca3af)', fontSize: '14px' }}>
                        Last updated: 20 February 2026
                    </p>
                </div>

                {/* Content */}
                <div style={{ color: 'var(--text-secondary, #d1d5db)', fontSize: '15px' }}>
                    <Section title="1. Who We Are">
                        <p>
                            NDT Suite is a workforce competency and certification management platform
                            for the non-destructive testing industry. Your organisation is the data
                            controller responsible for your personal data. NDT Suite provides the
                            software platform under which your data is processed.
                        </p>
                    </Section>

                    <Section title="2. What Data We Collect">
                        <p>We collect and process the following categories of personal data:</p>
                        <ul style={listStyle}>
                            <li><strong>Account information</strong>: username, email address, hashed password</li>
                            <li><strong>Profile information</strong>: mobile number, home address, date of birth, nearest UK train station</li>
                            <li><strong>Emergency contacts</strong>: next of kin name, emergency contact number</li>
                            <li><strong>Competency records</strong>: qualifications, certifications, issuing bodies, expiry dates, supporting documents</li>
                            <li><strong>Employment information</strong>: organisation, role, Vantage number</li>
                            <li><strong>Activity data</strong>: login timestamps, actions performed within the platform, IP address</li>
                            <li><strong>Profile photo</strong>: optional avatar image</li>
                        </ul>
                    </Section>

                    <Section title="3. Why We Process Your Data">
                        <p>We process your personal data on the following lawful bases:</p>
                        <ul style={listStyle}>
                            <li>
                                <strong>Legal obligation (Article 6(1)(c))</strong>: NDT industry regulations
                                (PED 2014/68/EU, EN ISO 9712, ASME) require employers to maintain records
                                of technician qualifications and certifications.
                            </li>
                            <li>
                                <strong>Legitimate interest (Article 6(1)(f))</strong>: your employer has a
                                legitimate interest in managing workforce competency, ensuring workplace safety,
                                and maintaining contact information for operational purposes.
                            </li>
                            <li>
                                <strong>Contract performance (Article 6(1)(b))</strong>: processing necessary
                                to manage your employment or contractor relationship.
                            </li>
                        </ul>
                    </Section>

                    <Section title="4. How Long We Keep Your Data">
                        <ul style={listStyle}>
                            <li><strong>Profile data</strong>: duration of employment plus 6 years (Limitation Act 1980)</li>
                            <li><strong>Competency records</strong>: expiry date plus 6 years</li>
                            <li><strong>Activity logs</strong>: 3 years from creation</li>
                            <li><strong>Account requests</strong>: 90 days after resolution</li>
                        </ul>
                        <p>
                            Full retention schedule available in our internal documentation.
                            Inactive accounts are flagged after 2 years and deactivated after 3 years.
                        </p>
                    </Section>

                    <Section title="5. Who Has Access to Your Data">
                        <ul style={listStyle}>
                            <li><strong>You</strong>: full access to your own profile and competency records</li>
                            <li><strong>Your managers</strong>: access to personnel records (with PII masking and audit logging)</li>
                            <li><strong>Organisation administrators</strong>: full personnel management access</li>
                            <li><strong>Supabase Inc.</strong>: our data processor for hosting and storage (DPA in place)</li>
                        </ul>
                        <p>
                            We do not share your data with any other third parties. We do not use analytics
                            services, advertising networks, or tracking technologies.
                        </p>
                    </Section>

                    <Section title="6. Your Rights">
                        <p>Under UK GDPR, you have the following rights:</p>
                        <ul style={listStyle}>
                            <li>
                                <strong>Right of access</strong> (Article 15): request a copy of all personal
                                data we hold about you. Use the &ldquo;Download My Data&rdquo; feature on your profile page.
                            </li>
                            <li>
                                <strong>Right to rectification</strong> (Article 16): correct inaccurate personal
                                data via your profile settings.
                            </li>
                            <li>
                                <strong>Right to erasure</strong> (Article 17): request deletion of your account
                                and personal data. Use the &ldquo;Delete My Account&rdquo; feature on your profile page.
                                Note: some records may be retained in anonymised form for audit compliance.
                            </li>
                            <li>
                                <strong>Right to data portability</strong> (Article 20): export your data in
                                machine-readable format (JSON/CSV) via the &ldquo;Download My Data&rdquo; feature.
                            </li>
                            <li>
                                <strong>Right to object</strong> (Article 21): contact your organisation&apos;s
                                administrator to object to processing based on legitimate interest.
                            </li>
                            <li>
                                <strong>Right to restrict processing</strong> (Article 18): contact your
                                organisation&apos;s administrator to request restricted processing.
                            </li>
                        </ul>
                    </Section>

                    <Section title="7. Data Security">
                        <p>We implement the following security measures:</p>
                        <ul style={listStyle}>
                            <li>Passwords hashed with bcrypt</li>
                            <li>Rate limiting on authentication (5 attempts per 15 minutes)</li>
                            <li>Row-Level Security enforcing multi-tenant data isolation</li>
                            <li>Role-based access control (5 permission levels)</li>
                            <li>Content Security Policy and security headers</li>
                            <li>TLS encryption for all data in transit</li>
                            <li>AES-256 encryption for data at rest</li>
                            <li>PII masking on personnel views with audit-logged reveals</li>
                        </ul>
                    </Section>

                    <Section title="8. International Data Transfers">
                        <p>
                            Your data is processed by Supabase Inc., which may store data outside the UK.
                            Appropriate safeguards are in place via our Data Processing Agreement with
                            Supabase, which includes Standard Contractual Clauses where applicable.
                        </p>
                    </Section>

                    <Section title="9. Complaints">
                        <p>
                            If you are unhappy with how your personal data is being processed, you have
                            the right to lodge a complaint with the Information Commissioner&apos;s Office (ICO):
                        </p>
                        <ul style={listStyle}>
                            <li>Website: <a href="https://ico.org.uk" style={linkStyle}>ico.org.uk</a></li>
                            <li>Helpline: 0303 123 1113</li>
                        </ul>
                    </Section>

                    <Section title="10. Changes to This Policy">
                        <p>
                            We may update this privacy policy from time to time. Material changes will
                            be communicated via the platform. The &ldquo;last updated&rdquo; date at the top of
                            this page indicates when the policy was last revised.
                        </p>
                    </Section>
                </div>
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section style={{ marginBottom: '36px' }}>
            <h2 style={{
                fontSize: '20px',
                fontWeight: '600',
                color: 'var(--text-primary, #ffffff)',
                marginBottom: '12px',
            }}>
                {title}
            </h2>
            {children}
        </section>
    );
}

const listStyle: React.CSSProperties = {
    paddingLeft: '20px',
    marginTop: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
};

const linkStyle: React.CSSProperties = {
    color: 'var(--accent-primary, #3b82f6)',
    textDecoration: 'underline',
};
