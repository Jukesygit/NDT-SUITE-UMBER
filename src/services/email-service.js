/**
 * Email Service
 * Sends emails via Supabase Edge Function (which uses Resend)
 */

import { supabase } from '../supabaseClient';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/**
 * Send an email via the Edge Function
 * @param {Object} options - Email options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export async function sendEmail({ to, subject, html }) {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        throw new Error('User must be authenticated to send emails');
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ to, subject, html }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Failed to send email');
    }

    return data;
}

/**
 * Send competency expiration notification email
 * @param {Object} options - Notification options
 * @param {string} options.recipientEmail - User's email
 * @param {string} options.recipientName - User's name
 * @param {Object} options.competency - Competency details
 * @param {string} options.competency.name - Competency name
 * @param {string} options.competency.expiryDate - Expiry date (ISO string)
 * @param {number} options.daysUntilExpiry - Days until expiry
 */
export async function sendCompetencyExpirationNotification({
    recipientEmail,
    recipientName,
    competency,
    daysUntilExpiry,
}) {
    const expiryDate = new Date(competency.expiryDate).toLocaleDateString('en-AU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    const urgencyColor = daysUntilExpiry <= 7 ? '#ef4444' : daysUntilExpiry <= 30 ? '#f59e0b' : '#3b82f6';
    const urgencyText = daysUntilExpiry <= 7 ? 'Expiring Very Soon' : daysUntilExpiry <= 30 ? 'Expiring Soon' : 'Upcoming Expiry';

    const html = generateCompetencyExpirationEmail({
        recipientName,
        competencyName: competency.name,
        expiryDate,
        daysUntilExpiry,
        urgencyColor,
        urgencyText,
    });

    return sendEmail({
        to: recipientEmail,
        subject: `⚠️ ${competency.name} - ${urgencyText} (${daysUntilExpiry} days)`,
        html,
    });
}

/**
 * Send bulk expiration notifications
 * @param {Array} notifications - Array of notification objects
 */
export async function sendBulkExpirationNotifications(notifications) {
    const results = await Promise.allSettled(
        notifications.map(notification => sendCompetencyExpirationNotification(notification))
    );

    return {
        sent: results.filter(r => r.status === 'fulfilled').length,
        failed: results.filter(r => r.status === 'rejected').length,
        results,
    };
}

/**
 * Generate the HTML email template for competency expiration
 */
function generateCompetencyExpirationEmail({
    recipientName,
    competencyName,
    expiryDate,
    daysUntilExpiry,
    urgencyColor,
    urgencyText,
}) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Competency Expiration Notice - NDT Suite</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a; color: #e2e8f0;">
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #0f172a;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background: linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%); border: 1px solid rgba(148, 163, 184, 0.1); border-radius: 16px; overflow: hidden;">

                    <!-- Header with Logo -->
                    <tr>
                        <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(99, 102, 241, 0.05) 100%);">
                            <div style="width: 64px; height: 64px; margin: 0 auto 20px; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" style="display: block; margin: 16px auto;">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                </svg>
                            </div>
                            <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #f8fafc; letter-spacing: -0.5px;">NDT Suite</h1>
                        </td>
                    </tr>

                    <!-- Urgency Banner -->
                    <tr>
                        <td style="padding: 0 40px;">
                            <div style="padding: 12px 20px; background: ${urgencyColor}20; border: 1px solid ${urgencyColor}40; border-radius: 8px; text-align: center;">
                                <span style="font-size: 14px; font-weight: 600; color: ${urgencyColor}; text-transform: uppercase; letter-spacing: 0.5px;">
                                    ⚠️ ${urgencyText}
                                </span>
                            </div>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 30px 40px 40px;">
                            <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #f8fafc;">
                                Hi ${recipientName},
                            </h2>

                            <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                                This is a reminder that one of your competencies is expiring soon and requires attention.
                            </p>

                            <!-- Competency Details Card -->
                            <div style="padding: 24px; background: rgba(15, 23, 42, 0.5); border: 1px solid rgba(148, 163, 184, 0.1); border-radius: 12px; margin: 24px 0;">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 8px 0; border-bottom: 1px solid rgba(148, 163, 184, 0.1);">
                                            <span style="font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Competency</span>
                                        </td>
                                        <td style="padding: 8px 0; border-bottom: 1px solid rgba(148, 163, 184, 0.1); text-align: right;">
                                            <span style="font-size: 15px; font-weight: 600; color: #f8fafc;">${competencyName}</span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0; border-bottom: 1px solid rgba(148, 163, 184, 0.1);">
                                            <span style="font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Expiry Date</span>
                                        </td>
                                        <td style="padding: 8px 0; border-bottom: 1px solid rgba(148, 163, 184, 0.1); text-align: right;">
                                            <span style="font-size: 15px; font-weight: 600; color: #f8fafc;">${expiryDate}</span>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 8px 0;">
                                            <span style="font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Days Remaining</span>
                                        </td>
                                        <td style="padding: 8px 0; text-align: right;">
                                            <span style="display: inline-block; padding: 4px 12px; font-size: 14px; font-weight: 600; color: ${urgencyColor}; background: ${urgencyColor}20; border-radius: 20px;">
                                                ${daysUntilExpiry} days
                                            </span>
                                        </td>
                                    </tr>
                                </table>
                            </div>

                            <p style="margin: 24px 0; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                                Please ensure you renew this competency before the expiry date to maintain compliance.
                            </p>

                            <!-- CTA Button -->
                            <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 32px 0;">
                                <tr>
                                    <td align="center">
                                        <a href="${import.meta.env.VITE_APP_URL || 'https://ndtsuite.com'}/profile" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 600; color: #ffffff; background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); border-radius: 10px; text-decoration: none; box-shadow: 0 4px 20px rgba(59, 130, 246, 0.3);">
                                            View My Competencies
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <!-- Info Notice -->
                            <div style="margin-top: 24px; padding: 16px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px;">
                                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #60a5fa;">
                                    💡 <strong>Tip:</strong> Keep your competencies up to date to ensure you remain compliant and can continue working on projects that require these qualifications.
                                </p>
                            </div>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; text-align: center; border-top: 1px solid rgba(148, 163, 184, 0.1);">
                            <p style="margin: 0 0 8px; font-size: 13px; color: #64748b;">
                                Need help? Contact support at
                                <a href="mailto:support@matrixinspectionservices.com" style="color: #60a5fa; text-decoration: none;">support@matrixinspectionservices.com</a>
                            </p>
                            <p style="margin: 8px 0 0; font-size: 12px; color: #475569;">
                                © ${new Date().getFullYear()} Matrix Inspection Services. All rights reserved.
                            </p>
                            <p style="margin: 12px 0 0; font-size: 11px; color: #475569;">
                                You received this email because you have competencies tracked in NDT Suite.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

export default {
    sendEmail,
    sendCompetencyExpirationNotification,
    sendBulkExpirationNotifications,
};
