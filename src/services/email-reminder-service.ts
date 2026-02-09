/**
 * Email Reminder Service
 * Manages certification expiration email reminder settings and logs
 */

import { supabase } from '../supabase-client.js';
import environmentConfig from '../config/environment.js';

// Get Supabase URL from environment config
const SUPABASE_URL = environmentConfig.get('supabase.url') as string;

// Types
export interface EmailReminderSettings {
    id: string | null;
    is_enabled: boolean;
    thresholds_months: number[];
    manager_emails: string[];
    sender_email: string;
    sender_name: string;
    created_at: string | null;
    updated_at: string | null;
    updated_by: string | null;
}

export interface EmailReminderLog {
    id: string;
    user_id: string;
    threshold_months: number;
    competency_ids: string[];
    sent_at: string;
    email_sent_to: string;
    managers_cc: string[] | null;
    status: 'sent' | 'failed' | 'bounced';
    error_message: string | null;
    profiles?: {
        username: string;
        email: string;
    };
}

export interface UpdateSettingsData {
    is_enabled?: boolean;
    thresholds_months?: number[];
    manager_emails?: string[];
    sender_email?: string;
    sender_name?: string;
}

export interface TriggerRemindersResult {
    message: string;
    sent: number;
    failed: number;
    details?: Array<{
        threshold: number;
        user: string;
        email: string;
        status: 'sent' | 'failed';
        error?: string;
    }>;
}

export interface SendTestReminderResult {
    success: boolean;
    message: string;
}

/**
 * Get email reminder settings
 */
export async function getEmailReminderSettings(): Promise<EmailReminderSettings> {
    const { data, error } = await supabase!
        .from('email_reminder_settings')
        .select('*')
        .single();

    if (error) {
        // If no settings exist yet, return defaults
        if (error.code === 'PGRST116') {
            return {
                id: null,
                is_enabled: true,
                thresholds_months: [6, 3, 1, 0],
                manager_emails: [],
                sender_email: 'notifications@updates.matrixportal.io',
                sender_name: 'Matrix Portal',
                created_at: null,
                updated_at: null,
                updated_by: null,
            };
        }
        throw error;
    }

    return data as EmailReminderSettings;
}

/**
 * Update email reminder settings
 */
export async function updateEmailReminderSettings(settings: UpdateSettingsData): Promise<EmailReminderSettings> {
    const { data: existingData } = await supabase!
        .from('email_reminder_settings')
        .select('id')
        .single();

    const { data: userData } = await supabase!.auth.getUser();

    const updateData = {
        is_enabled: settings.is_enabled,
        thresholds_months: settings.thresholds_months,
        manager_emails: settings.manager_emails,
        sender_email: settings.sender_email,
        sender_name: settings.sender_name,
        updated_by: userData.user?.id,
    };

    let result;

    if (existingData?.id) {
        // Update existing settings
        result = await supabase!
            .from('email_reminder_settings')
            .update(updateData)
            .eq('id', existingData.id)
            .select()
            .single();
    } else {
        // Insert new settings
        result = await supabase!
            .from('email_reminder_settings')
            .insert(updateData)
            .select()
            .single();
    }

    if (result.error) {
        throw result.error;
    }

    return result.data as EmailReminderSettings;
}

/**
 * Get email reminder logs
 */
export async function getEmailReminderLogs(options?: { userId?: string; limit?: number }): Promise<EmailReminderLog[]> {
    const limit = options?.limit ?? 100;

    let query = supabase!
        .from('email_reminder_log')
        .select(`
            *,
            profiles:user_id (
                username,
                email
            )
        `)
        .order('sent_at', { ascending: false })
        .limit(limit);

    if (options?.userId) {
        query = query.eq('user_id', options.userId);
    }

    const { data, error } = await query;

    if (error) {
        throw error;
    }

    return data as EmailReminderLog[];
}

/**
 * Manually trigger expiration reminders
 */
export async function triggerExpirationReminders(): Promise<TriggerRemindersResult> {
    const { data: { session } } = await supabase!.auth.getSession();

    if (!session) {
        throw new Error('User must be authenticated to trigger reminders');
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-expiration-reminders`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
        },
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Failed to trigger reminders');
    }

    return data as TriggerRemindersResult;
}

/**
 * Send expiry reminder to a specific user
 * Useful for testing or sending targeted reminders
 */
export async function sendExpiryReminderToUser(userId: string): Promise<TriggerRemindersResult> {
    const { data: { session } } = await supabase!.auth.getSession();

    if (!session) {
        throw new Error('User must be authenticated to send reminders');
    }

    const url = `${SUPABASE_URL}/functions/v1/send-expiration-reminders`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ targetUserId: userId }),
    });

    let data;
    try {
        data = await response.json();
    } catch (parseError) {
        throw new Error(`HTTP ${response.status}: Failed to parse response`);
    }

    if (!response.ok) {
        const errorMsg = data?.error || data?.message || `HTTP ${response.status}`;
        throw new Error(errorMsg);
    }

    return data as TriggerRemindersResult;
}

/**
 * Send a test reminder email to a specific user
 */
export async function sendTestReminder(userId: string, email: string): Promise<SendTestReminderResult> {
    // Get user's expiring competencies
    const { data: competencies, error: compError } = await supabase!
        .rpc('get_expiring_competencies', { days_threshold: 180 });

    if (compError) {
        throw compError;
    }

    // Filter to just this user's competencies
    const userCompetencies = (competencies || []).filter((c: { user_id: string }) => c.user_id === userId);

    if (userCompetencies.length === 0) {
        return { success: false, message: 'No expiring competencies found for this user' };
    }

    // Import email service dynamically to avoid circular deps
    const { sendEmail } = await import('./email-service.js');

    // Generate a simple test email
    const html = generateTestEmailHtml(userCompetencies, email);

    await sendEmail({
        to: email,
        subject: '[TEST] Certification Expiration Reminder',
        html,
    });

    return { success: true, message: `Test email sent to ${email}` };
}

/**
 * Generate simple test email HTML
 */
function generateTestEmailHtml(
    competencies: Array<{ competency_name: string; days_until_expiry: number }>,
    recipientEmail: string
): string {
    const competencyList = competencies
        .map(c => `<li>${c.competency_name} - expires in ${c.days_until_expiry} days</li>`)
        .join('');

    return `
        <div style="font-family: sans-serif; padding: 20px; background: #1e293b; color: #e2e8f0;">
            <h2 style="color: #60a5fa;">Test Reminder Email</h2>
            <p>This is a test email to verify the reminder system is working.</p>
            <p>Recipient: ${recipientEmail}</p>
            <h3>Expiring Certifications:</h3>
            <ul>${competencyList}</ul>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">
                This is a test email from NDT Suite. No action required.
            </p>
        </div>
    `;
}

export default {
    getEmailReminderSettings,
    updateEmailReminderSettings,
    getEmailReminderLogs,
    triggerExpirationReminders,
    sendExpiryReminderToUser,
    sendTestReminder,
};
