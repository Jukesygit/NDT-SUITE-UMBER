/**
 * Notification Email Service
 * Handles sending custom admin notification emails and audit logging
 */

import type { SupabaseClient } from '@supabase/supabase-js';
// @ts-ignore - JS module without type declarations
import * as supabaseModule from '../supabase-client.js';
// @ts-ignore - accessing property from untyped module
const supabase: SupabaseClient | null = supabaseModule.supabase;

import { sendEmail } from './email-service.js';

// ============================================================================
// Types
// ============================================================================

export interface NotificationEmailLog {
    id: string;
    sent_by: string;
    sent_by_email: string | null;
    sent_by_name: string | null;
    subject: string;
    body: string;
    recipient_ids: string[];
    recipient_count: number;
    successful_count: number;
    failed_count: number;
    status: 'pending' | 'sending' | 'completed' | 'failed';
    error_message: string | null;
    filters_used: Record<string, unknown> | null;
    created_at: string;
    completed_at: string | null;
}

export interface NotificationRecipient {
    id: string;
    notification_id: string;
    recipient_id: string | null;
    recipient_email: string;
    recipient_name: string | null;
    status: 'pending' | 'sent' | 'failed';
    error_message: string | null;
    sent_at: string | null;
}

export interface RecipientInput {
    id: string;
    user_id: string;
    username: string;
    email: string;
}

export interface SendNotificationParams {
    subject: string;
    body: string;
    recipients: RecipientInput[];
    filters?: {
        organizationId?: string;
        role?: string;
        searchTerm?: string;
    };
    /** If true, body is treated as raw HTML and sent directly without wrapper template */
    isHtmlTemplate?: boolean;
}

export interface SendNotificationResult {
    notificationId: string;
    totalRecipients: number;
    successful: number;
    failed: number;
}

export interface NotificationLogFilters {
    startDate?: string;
    endDate?: string;
    status?: string;
}

export interface PaginatedNotificationLogs {
    data: NotificationEmailLog[];
    count: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export interface NotificationDetail {
    notification: NotificationEmailLog;
    recipients: NotificationRecipient[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * HTML-escape a string to prevent XSS
 */
function escapeHtml(str: string): string {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

/**
 * Generate notification email HTML template
 */
function generateNotificationEmailHtml(body: string, recipientName: string): string {
    const safeName = escapeHtml(recipientName);
    // Body is expected to be plain text or simple HTML from the admin
    // We don't escape it since it's admin-provided content

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Notification - NDT Suite</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0f172a; color: #e2e8f0;">
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #0f172a;">
        <tr>
            <td align="center" style="padding: 40px 20px;">
                <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background: linear-gradient(135deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.95) 100%); border: 1px solid rgba(148, 163, 184, 0.1); border-radius: 16px; overflow: hidden;">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 30px; text-align: center; background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(99, 102, 241, 0.05) 100%);">
                            <div style="width: 64px; height: 64px; margin: 0 auto 20px; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 16px; display: flex; align-items: center; justify-content: center;">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" style="display: block; margin: 16px auto;">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #f8fafc; letter-spacing: -0.5px;">NDT Suite</h1>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 30px 40px 40px;">
                            <h2 style="margin: 0 0 16px; font-size: 18px; font-weight: 600; color: #f8fafc;">
                                Hi ${safeName},
                            </h2>
                            <div style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                                ${body}
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
                                &copy; ${new Date().getFullYear()} Matrix Inspection Services. All rights reserved.
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

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Send custom notification emails to selected recipients
 */
export async function sendNotificationEmails(
    params: SendNotificationParams
): Promise<SendNotificationResult> {
    const { subject, body, recipients, filters, isHtmlTemplate } = params;

    if (!supabase) throw new Error('Supabase not configured');
    if (!recipients.length) throw new Error('No recipients selected');

    // Get current user info
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: profile } = await supabase
        .from('profiles')
        .select('username, email')
        .eq('id', user.id)
        .single();

    // Create notification log entry
    const { data: logEntry, error: logError } = await supabase
        .from('notification_email_log')
        .insert({
            sent_by: user.id,
            sent_by_email: profile?.email || user.email,
            sent_by_name: profile?.username || 'Admin',
            subject,
            body,
            recipient_ids: recipients.map((r) => r.user_id),
            recipient_count: recipients.length,
            status: 'sending',
            filters_used: filters || null,
        })
        .select()
        .single();

    if (logError || !logEntry) {
        throw new Error(`Failed to create notification log: ${logError?.message}`);
    }

    // Create recipient entries
    const recipientEntries = recipients.map((r) => ({
        notification_id: logEntry.id,
        recipient_id: r.user_id,
        recipient_email: r.email,
        recipient_name: r.username,
        status: 'pending',
    }));

    await supabase.from('notification_email_recipients').insert(recipientEntries);

    // Send emails in batches to avoid rate limiting
    const BATCH_SIZE = 2; // Send 2 emails at a time
    const DELAY_MS = 1000; // Wait 1 second between batches

    const allResults: { success: boolean; recipientId: string; error?: string }[] = [];

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const batch = recipients.slice(i, i + BATCH_SIZE);

        const batchPromises = batch.map(async (recipient) => {
            try {
                // Use raw HTML if template provided, otherwise wrap in default template
                const html = isHtmlTemplate ? body : generateNotificationEmailHtml(body, recipient.username);
                await sendEmail({ to: recipient.email, subject, html });

                // Update individual recipient status
                await supabase
                    .from('notification_email_recipients')
                    .update({ status: 'sent', sent_at: new Date().toISOString() })
                    .eq('notification_id', logEntry.id)
                    .eq('recipient_id', recipient.user_id);

                return { success: true, recipientId: recipient.user_id };
            } catch (error: unknown) {
                const errorMessage =
                    error instanceof Error ? error.message : 'Unknown error';

                // Update individual recipient status with error
                await supabase
                    .from('notification_email_recipients')
                    .update({ status: 'failed', error_message: errorMessage })
                    .eq('notification_id', logEntry.id)
                    .eq('recipient_id', recipient.user_id);

                return { success: false, recipientId: recipient.user_id, error: errorMessage };
            }
        });

        const batchResults = await Promise.all(batchPromises);
        allResults.push(...batchResults);

        // Delay between batches (except for the last batch)
        if (i + BATCH_SIZE < recipients.length) {
            await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
        }
    }

    const successful = allResults.filter((r) => r.success).length;
    const failed = recipients.length - successful;

    // Update notification log with results
    await supabase
        .from('notification_email_log')
        .update({
            successful_count: successful,
            failed_count: failed,
            status: failed === recipients.length ? 'failed' : 'completed',
            completed_at: new Date().toISOString(),
        })
        .eq('id', logEntry.id);

    return {
        notificationId: logEntry.id,
        totalRecipients: recipients.length,
        successful,
        failed,
    };
}

/**
 * Fetch notification email logs with pagination
 */
export async function getNotificationLogs(
    filters: NotificationLogFilters = {},
    page = 1,
    pageSize = 25
): Promise<PaginatedNotificationLogs> {
    if (!supabase) throw new Error('Supabase not configured');

    let query = supabase
        .from('notification_email_log')
        .select('*', { count: 'exact' });

    // Apply filters
    if (filters.startDate) {
        query = query.gte('created_at', filters.startDate);
    }
    if (filters.endDate) {
        query = query.lte('created_at', filters.endDate);
    }
    if (filters.status) {
        query = query.eq('status', filters.status);
    }

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) throw error;

    return {
        data: (data as NotificationEmailLog[]) || [],
        count: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
    };
}

/**
 * Get notification details with recipients
 */
export async function getNotificationDetail(
    notificationId: string
): Promise<NotificationDetail> {
    if (!supabase) throw new Error('Supabase not configured');

    const { data: notification, error: notificationError } = await supabase
        .from('notification_email_log')
        .select('*')
        .eq('id', notificationId)
        .single();

    if (notificationError) throw notificationError;

    const { data: recipients, error: recipientsError } = await supabase
        .from('notification_email_recipients')
        .select('*')
        .eq('notification_id', notificationId)
        .order('recipient_name');

    if (recipientsError) throw recipientsError;

    return {
        notification: notification as NotificationEmailLog,
        recipients: (recipients as NotificationRecipient[]) || [],
    };
}

export default {
    sendNotificationEmails,
    getNotificationLogs,
    getNotificationDetail,
};
