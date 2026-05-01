/**
 * Privacy Policy Page
 * Publicly accessible (no auth required) - GDPR Articles 13/14
 * Industrial instrument theme: chassis > panel > well for content
 */

export default function PrivacyPolicyPage() {
    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(180deg, var(--chassis-inner, #2a2826) 0%, var(--chassis, #1e1c1a) 100%)',
            padding: '32px 24px',
        }}>
            <div style={{
                maxWidth: '860px',
                margin: '0 auto',
                borderRadius: '14px',
                padding: '10px',
                background: 'linear-gradient(180deg, var(--chassis-inner) 0%, var(--chassis) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.20), 0 12px 40px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.25)',
            }}>
                <div style={{
                    borderRadius: '8px',
                    padding: '28px 32px 24px',
                    position: 'relative',
                    overflow: 'hidden',
                    background: 'linear-gradient(180deg, var(--panel-top) 0%, var(--panel-mid) 45%, var(--panel-bot) 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(0,0,0,0.08)',
                }}>
                    {/* Header */}
                    <div style={{ position: 'relative', zIndex: 1, marginBottom: '0' }}>
                        <a
                            href="/login"
                            style={{
                                fontFamily: 'var(--font-label)',
                                fontSize: '10px',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.10em',
                                color: 'var(--color-neutral-400)',
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                marginBottom: '16px',
                                textShadow: '0 1px 0 rgba(255,255,255,0.35)',
                            }}
                        >
                            &larr; Back to login
                        </a>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '8px', height: '8px', borderRadius: '50%',
                                background: 'radial-gradient(circle at 35% 30%, #5ec87a, var(--green) 55%, var(--green-dark))',
                                boxShadow: '0 0 4px var(--green-glow), 0 0 14px var(--green-glow-soft)',
                                flexShrink: 0,
                            }} />
                            <div>
                                <h1 style={{
                                    fontFamily: 'var(--font-label)', fontSize: '17px', fontWeight: 700,
                                    textTransform: 'uppercase', letterSpacing: '0.16em',
                                    color: 'var(--color-neutral-700)', textShadow: '0 1px 0 rgba(255,255,255,0.50)', margin: 0,
                                }}>Privacy Policy</h1>
                                <p style={{
                                    fontFamily: 'var(--font-label)', fontSize: '11px', fontWeight: 600,
                                    textTransform: 'uppercase', letterSpacing: '0.12em',
                                    color: 'var(--color-neutral-400)', textShadow: '0 1px 0 rgba(255,255,255,0.35)', margin: 0,
                                }}>Last updated: 20 February 2026</p>
                            </div>
                        </div>
                    </div>

                    {/* Groove */}
                    <div style={{
                        height: '2px', margin: '22px -8px',
                        background: 'linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.10) 50%, rgba(255,255,255,0.40) 100%)',
                        boxShadow: '0 1px 0 rgba(255,255,255,0.18), 0 -1px 0 rgba(0,0,0,0.06)',
                    }} />

                    {/* Content Well */}
                    <div style={{
                        borderRadius: '7px', padding: '4px', position: 'relative', zIndex: 1,
                        background: 'radial-gradient(ellipse at 50% 95%, rgba(255,255,255,0.02) 0%, transparent 50%), linear-gradient(180deg, var(--well-mid) 0%, var(--well-deep) 30%, var(--well-floor) 100%)',
                        boxShadow: 'inset 0 5px 14px rgba(0,0,0,0.38), inset 0 2px 4px rgba(0,0,0,0.28), inset 0 -2px 5px rgba(255,255,255,0.03), 0 1px 0 rgba(255,255,255,0.32)',
                    }}>
                        <div style={{
                            borderRadius: '4px', padding: '24px 28px',
                            background: 'linear-gradient(180deg, #131210 0%, #0c0b0a 100%)',
                            fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: '1.8',
                            color: 'rgba(53, 160, 88, 0.55)',
                        }}>
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
                                    <li><strong style={strongStyle}>Account information</strong>: username, email address, hashed password</li>
                                    <li><strong style={strongStyle}>Profile information</strong>: mobile number, home address, date of birth, nearest UK train station</li>
                                    <li><strong style={strongStyle}>Emergency contacts</strong>: next of kin name, emergency contact number</li>
                                    <li><strong style={strongStyle}>Competency records</strong>: qualifications, certifications, issuing bodies, expiry dates, supporting documents</li>
                                    <li><strong style={strongStyle}>Employment information</strong>: organisation, role, Vantage number</li>
                                    <li><strong style={strongStyle}>Activity data</strong>: login timestamps, actions performed within the platform, IP address</li>
                                    <li><strong style={strongStyle}>Profile photo</strong>: optional avatar image</li>
                                </ul>
                            </Section>

                            <Section title="3. Why We Process Your Data">
                                <p>We process your personal data on the following lawful bases:</p>
                                <ul style={listStyle}>
                                    <li><strong style={strongStyle}>Legal obligation (Article 6(1)(c))</strong>: NDT industry regulations (PED 2014/68/EU, EN ISO 9712, ASME) require employers to maintain records of technician qualifications and certifications.</li>
                                    <li><strong style={strongStyle}>Legitimate interest (Article 6(1)(f))</strong>: your employer has a legitimate interest in managing workforce competency, ensuring workplace safety, and maintaining contact information for operational purposes.</li>
                                    <li><strong style={strongStyle}>Contract performance (Article 6(1)(b))</strong>: processing necessary to manage your employment or contractor relationship.</li>
                                </ul>
                            </Section>

                            <Section title="4. How Long We Keep Your Data">
                                <ul style={listStyle}>
                                    <li><strong style={strongStyle}>Profile data</strong>: duration of employment plus 6 years (Limitation Act 1980)</li>
                                    <li><strong style={strongStyle}>Competency records</strong>: expiry date plus 6 years</li>
                                    <li><strong style={strongStyle}>Activity logs</strong>: 3 years from creation</li>
                                    <li><strong style={strongStyle}>Account requests</strong>: 90 days after resolution</li>
                                </ul>
                                <p>Full retention schedule available in our internal documentation. Inactive accounts are flagged after 2 years and deactivated after 3 years.</p>
                            </Section>

                            <Section title="5. Who Has Access to Your Data">
                                <ul style={listStyle}>
                                    <li><strong style={strongStyle}>You</strong>: full access to your own profile and competency records</li>
                                    <li><strong style={strongStyle}>Your managers</strong>: access to personnel records (with PII masking and audit logging)</li>
                                    <li><strong style={strongStyle}>Organisation administrators</strong>: full personnel management access</li>
                                    <li><strong style={strongStyle}>Supabase Inc.</strong>: our data processor for hosting and storage (DPA in place)</li>
                                </ul>
                                <p>We do not share your data with any other third parties. We do not use analytics services, advertising networks, or tracking technologies.</p>
                            </Section>

                            <Section title="6. Your Rights">
                                <p>Under UK GDPR, you have the following rights:</p>
                                <ul style={listStyle}>
                                    <li><strong style={strongStyle}>Right of access</strong> (Article 15): request a copy of all personal data we hold about you. Use the &ldquo;Download My Data&rdquo; feature on your profile page.</li>
                                    <li><strong style={strongStyle}>Right to rectification</strong> (Article 16): correct inaccurate personal data via your profile settings.</li>
                                    <li><strong style={strongStyle}>Right to erasure</strong> (Article 17): request deletion of your account and personal data. Use the &ldquo;Delete My Account&rdquo; feature on your profile page. Note: some records may be retained in anonymised form for audit compliance.</li>
                                    <li><strong style={strongStyle}>Right to data portability</strong> (Article 20): export your data in machine-readable format (JSON/CSV) via the &ldquo;Download My Data&rdquo; feature.</li>
                                    <li><strong style={strongStyle}>Right to object</strong> (Article 21): contact your organisation&apos;s administrator to object to processing based on legitimate interest.</li>
                                    <li><strong style={strongStyle}>Right to restrict processing</strong> (Article 18): contact your organisation&apos;s administrator to request restricted processing.</li>
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
                                <p>Your data is processed by Supabase Inc., which may store data outside the UK. Appropriate safeguards are in place via our Data Processing Agreement with Supabase, which includes Standard Contractual Clauses where applicable.</p>
                            </Section>

                            <Section title="9. Complaints">
                                <p>If you are unhappy with how your personal data is being processed, you have the right to lodge a complaint with the Information Commissioner&apos;s Office (ICO):</p>
                                <ul style={listStyle}>
                                    <li>Website: <a href="https://ico.org.uk" style={{ color: 'rgba(53, 160, 88, 0.70)', textShadow: '0 0 6px var(--green-glow-soft)' }}>ico.org.uk</a></li>
                                    <li>Helpline: 0303 123 1113</li>
                                </ul>
                            </Section>

                            <Section title="10. Changes to This Policy">
                                <p>We may update this privacy policy from time to time. Material changes will be communicated via the platform. The &ldquo;last updated&rdquo; date at the top of this page indicates when the policy was last revised.</p>
                            </Section>
                        </div>
                    </div>

                    {/* Groove + Nameplate */}
                    <div style={{
                        height: '2px', margin: '22px -8px',
                        background: 'linear-gradient(180deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.10) 50%, rgba(255,255,255,0.40) 100%)',
                        boxShadow: '0 1px 0 rgba(255,255,255,0.18), 0 -1px 0 rgba(0,0,0,0.06)',
                    }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 8px', position: 'relative', zIndex: 1 }}>
                        <span style={{
                            fontFamily: 'var(--font-label)', fontWeight: 700, fontSize: '15px',
                            textTransform: 'uppercase', letterSpacing: '0.18em',
                            color: 'var(--color-neutral-500)', textShadow: '0 1px 0 rgba(255,255,255,0.40)',
                        }}>Matrix Portal</span>
                        <span style={{
                            fontFamily: 'var(--font-label)', fontWeight: 600, fontSize: '11px',
                            textTransform: 'uppercase', letterSpacing: '0.12em',
                            color: 'var(--color-neutral-400)', textShadow: '0 1px 0 rgba(255,255,255,0.35)',
                        }}>Privacy Policy</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section style={{ marginBottom: '28px' }}>
            <h2 style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                fontWeight: 600,
                color: 'rgba(53, 160, 88, 0.70)',
                textShadow: '0 0 6px var(--green-glow-soft)',
                marginBottom: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
            }}>
                {title}
            </h2>
            {children}
        </section>
    );
}

const listStyle: React.CSSProperties = {
    paddingLeft: '18px',
    marginTop: '6px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
};

const strongStyle: React.CSSProperties = {
    color: 'rgba(53, 160, 88, 0.65)',
    fontWeight: 600,
};
