/**
 * useExportMyData - React Query mutation for GDPR data export
 * Opens a formatted HTML report in a new tab (human-readable)
 * with a JSON download link for machine-readable portability (Article 20).
 */

import { useMutation } from '@tanstack/react-query';
import { exportUserData, type UserDataExport } from '../../services/gdpr-service';
import { logActivity } from '../../services/activity-log-service';

function formatDate(value: unknown): string {
    if (!value || typeof value !== 'string') return '-';
    try {
        return new Date(value).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'long', year: 'numeric',
        });
    } catch {
        return String(value);
    }
}

function formatDateTime(value: unknown): string {
    if (!value || typeof value !== 'string') return '-';
    try {
        return new Date(value).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    } catch {
        return String(value);
    }
}

function val(v: unknown): string {
    if (v === null || v === undefined || v === '') return '-';
    return String(v);
}

function buildHtmlReport(data: UserDataExport): string {
    const p = data.profile as Record<string, unknown> | null;
    const jsonBlob = JSON.stringify(data, null, 2);
    const jsonDataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonBlob);

    const profileRows = p ? [
        ['Username', val(p.username)],
        ['Email', val(p.email)],
        ['Contact Email', val(p.email_address)],
        ['Mobile Number', val(p.mobile_number)],
        ['Home Address', val(p.home_address)],
        ['Nearest UK Train Station', val(p.nearest_uk_train_station)],
        ['Date of Birth', formatDate(p.date_of_birth)],
        ['Next of Kin', val(p.next_of_kin)],
        ['Emergency Contact', val(p.next_of_kin_emergency_contact_number)],
        ['Vantage Number', val(p.vantage_number)],
        ['Role', val(p.role)],
        ['Account Created', formatDateTime(p.created_at)],
        ['Last Updated', formatDateTime(p.updated_at)],
    ] : [];

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My Data Export — NDT Suite</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8f9fa; color: #1a1a1a; line-height: 1.6; padding: 32px 20px; }
  .container { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 28px; margin-bottom: 4px; }
  .subtitle { color: #6b7280; font-size: 14px; margin-bottom: 32px; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 28px; margin-bottom: 24px; }
  .card h2 { font-size: 18px; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #f0f0f0; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid #f0f0f0; }
  th { font-weight: 600; color: #374151; background: #f9fafb; white-space: nowrap; width: 200px; }
  td { color: #4b5563; word-break: break-word; }
  .data-table th { width: auto; }
  .data-table tr:hover { background: #f9fafb; }
  .empty { color: #9ca3af; font-style: italic; padding: 20px; text-align: center; }
  .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 500; text-decoration: none; cursor: pointer; border: 1px solid #d1d5db; background: #fff; color: #374151; transition: background 0.15s; }
  .btn:hover { background: #f3f4f6; }
  .btn-primary { background: #2563eb; color: #fff; border-color: #2563eb; }
  .btn-primary:hover { background: #1d4ed8; }
  .count { display: inline-block; background: #e5e7eb; color: #374151; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 10px; margin-left: 8px; }
  @media print { body { padding: 0; background: #fff; } .card { border: none; box-shadow: none; } .actions { display: none; } }
  @media (max-width: 640px) { th { width: 120px; } .card { padding: 16px; } }
</style>
</head>
<body>
<div class="container">
  <h1>Your Personal Data</h1>
  <p class="subtitle">Exported from NDT Suite on ${formatDateTime(data.exportedAt)}. This document contains all personal data held about you.</p>

  <div class="actions" style="margin-bottom: 24px;">
    <button class="btn" onclick="window.print()">Print / Save as PDF</button>
    <a class="btn btn-primary" href="${jsonDataUri}" download="ndt-suite-my-data-${new Date().toISOString().split('T')[0]}.json">Download as JSON</a>
  </div>

  <div class="card">
    <h2>Personal Details</h2>
    ${p ? `<table>${profileRows.map(([label, value]) =>
        `<tr><th>${label}</th><td>${value}</td></tr>`
    ).join('')}</table>` : '<p class="empty">No profile data found.</p>'}
  </div>

  <div class="card">
    <h2>Competencies & Certifications <span class="count">${data.competencies.length}</span></h2>
    ${data.competencies.length > 0 ? `
    <table class="data-table">
      <thead><tr><th>Certification ID</th><th>Issuing Body</th><th>Status</th><th>Expiry Date</th><th>Notes</th></tr></thead>
      <tbody>${data.competencies.map((c) => `
        <tr>
          <td>${val(c.certification_id)}</td>
          <td>${val(c.issuing_body)}</td>
          <td>${val(c.status)}</td>
          <td>${formatDate(c.expiry_date)}</td>
          <td>${val(c.notes)}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<p class="empty">No competency records.</p>'}
  </div>

  <div class="card">
    <h2>Competency Change History <span class="count">${data.competencyHistory.length}</span></h2>
    ${data.competencyHistory.length > 0 ? `
    <table class="data-table">
      <thead><tr><th>Date</th><th>Field</th><th>Old Value</th><th>New Value</th><th>Reason</th></tr></thead>
      <tbody>${data.competencyHistory.slice(0, 100).map((h) => `
        <tr>
          <td>${formatDateTime(h.created_at)}</td>
          <td>${val(h.field_name)}</td>
          <td>${val(h.old_value)}</td>
          <td>${val(h.new_value)}</td>
          <td>${val(h.change_reason)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    ${data.competencyHistory.length > 100 ? `<p style="color:#6b7280;font-size:13px;margin-top:12px;">Showing first 100 of ${data.competencyHistory.length} entries. Download JSON for the full dataset.</p>` : ''}
    ` : '<p class="empty">No change history.</p>'}
  </div>

  <div class="card">
    <h2>Activity Log <span class="count">${data.activityLogs.length}</span></h2>
    ${data.activityLogs.length > 0 ? `
    <table class="data-table">
      <thead><tr><th>Date</th><th>Action</th><th>Description</th></tr></thead>
      <tbody>${data.activityLogs.slice(0, 50).map((a) => `
        <tr>
          <td style="white-space:nowrap">${formatDateTime(a.created_at)}</td>
          <td>${val(a.action_type)}</td>
          <td>${val(a.description)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    ${data.activityLogs.length > 50 ? `<p style="color:#6b7280;font-size:13px;margin-top:12px;">Showing most recent 50 of ${data.activityLogs.length} entries. Download JSON for the full dataset.</p>` : ''}
    ` : '<p class="empty">No activity logs.</p>'}
  </div>

  ${data.permissionRequests.length > 0 ? `
  <div class="card">
    <h2>Permission Requests <span class="count">${data.permissionRequests.length}</span></h2>
    <table class="data-table">
      <thead><tr><th>Date</th><th>Requested Role</th><th>Previous Role</th><th>Status</th><th>Message</th></tr></thead>
      <tbody>${data.permissionRequests.map((r) => `
        <tr>
          <td>${formatDateTime(r.created_at)}</td>
          <td>${val(r.requested_role)}</td>
          <td>${val(r.user_current_role)}</td>
          <td>${val(r.status)}</td>
          <td>${val(r.message)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  <div class="card" style="background:#f9fafb;">
    <h2>About This Export</h2>
    <p style="font-size:14px;color:#6b7280;">
      This document was generated in response to your data access request under <strong>UK GDPR Article 15</strong> (Right of Access).
      The JSON download is provided for data portability under <strong>Article 20</strong>.
      If you believe any information is inaccurate, you can correct it in your profile settings (Article 16 — Right to Rectification).
      To request deletion of your account, use the "Delete My Account" option on your profile page (Article 17 — Right to Erasure).
    </p>
  </div>
</div>
</body>
</html>`;
}

export function useExportMyData() {
    return useMutation({
        mutationFn: async (userId: string) => {
            const data = await exportUserData(userId);

            logActivity({
                userId,
                actionType: 'data_exported',
                actionCategory: 'profile',
                description: 'User exported their personal data (GDPR Article 15/20)',
            });

            // Open formatted HTML report in a new tab
            const html = buildHtmlReport(data);
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            // Revoke after a delay to allow the tab to load
            setTimeout(() => URL.revokeObjectURL(url), 10000);

            return data;
        },
    });
}
