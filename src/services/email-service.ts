/**
 * Email Service
 * Sends emails via Supabase Edge Function (which uses Resend)
 */

import supabase from '../supabase-client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface SendEmailOptions {
    to: string | string[];
    subject: string;
    html: string;
    from?: string;
    cc?: string | string[];
    replyTo?: string;
    /** Custom headers forwarded to Resend (e.g. List-Unsubscribe for bulk mail). */
    headers?: Record<string, string>;
}

interface SendEmailResult {
    success: boolean;
    id?: string;
    error?: string;
}

/**
 * Send an email via the Edge Function
 */
export async function sendEmail({ to, subject, html, from, cc, replyTo, headers }: SendEmailOptions): Promise<SendEmailResult> {
    const { data: { session } } = await supabase!.auth.getSession();

    if (!session) {
        throw new Error('User must be authenticated to send emails');
    }

    const payload: Record<string, unknown> = { to, subject, html };
    if (from) payload.from = from;
    if (cc) payload.cc = cc;
    if (replyTo) payload.replyTo = replyTo;
    if (headers) payload.headers = headers;

    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Failed to send email');
    }

    return data;
}

export default {
    sendEmail,
};
