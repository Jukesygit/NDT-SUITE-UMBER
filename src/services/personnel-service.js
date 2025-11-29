// Personnel Management Service
import supabase, { isSupabaseConfigured } from '../supabase-client.js';
import authManager from '../auth-manager.js';
import competencyService from './competency-service.js';

/**
 * Service for managing personnel and their competencies
 */
class PersonnelService {
    /**
     * Get all personnel with their competencies
     */
    async getAllPersonnelWithCompetencies() {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        // Fetch profiles and all competencies in parallel (2 queries instead of N+1)
        const [profilesResult, competenciesResult] = await Promise.all([
            supabase
                .from('profiles')
                .select(`
                    *,
                    organizations(id, name)
                `)
                .order('username', { ascending: true }),
            supabase
                .from('employee_competencies')
                .select(`
                    id,
                    user_id,
                    value,
                    expiry_date,
                    status,
                    document_url,
                    document_name,
                    notes,
                    competency_id,
                    created_at,
                    issuing_body,
                    certification_id,
                    witness_checked,
                    witnessed_by,
                    witnessed_at,
                    witness_notes,
                    competency_definitions!inner(
                        id,
                        name,
                        description,
                        field_type,
                        category_id,
                        competency_categories(
                            id,
                            name,
                            description
                        )
                    )
                `)
        ]);

        if (profilesResult.error) throw profilesResult.error;
        if (competenciesResult.error) throw competenciesResult.error;

        const profiles = profilesResult.data;
        const allCompetencies = competenciesResult.data || [];

        // Group competencies by user_id for efficient lookup
        const competenciesByUser = {};
        allCompetencies.forEach(comp => {
            if (!competenciesByUser[comp.user_id]) {
                competenciesByUser[comp.user_id] = [];
            }
            // Flatten the competency_definitions structure
            competenciesByUser[comp.user_id].push({
                ...comp,
                competency: {
                    ...comp.competency_definitions,
                    category: comp.competency_definitions?.competency_categories || null
                }
            });
        });

        // Attach competencies to each profile
        const profilesWithCompetencies = profiles.map(profile => ({
            ...profile,
            competencies: competenciesByUser[profile.id] || []
        }));

        return profilesWithCompetencies;
    }

    /**
     * Get competency matrix showing all personnel vs all competencies
     */
    async getCompetencyMatrix() {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        // Get all personnel with their competencies
        const personnel = await this.getAllPersonnelWithCompetencies();

        // Get all competency definitions
        const definitions = await competencyService.getCompetencyDefinitions();

        // Build matrix
        return {
            personnel: personnel.map(person => ({
                id: person.id,
                username: person.username,
                email: person.email,
                organization_id: person.organization_id,
                role: person.role,
                competencies: person.competencies || []
            })),
            competencies: definitions
        };
    }

    /**
     * Export personnel and competencies to CSV format
     * @param {Array} personnel - Array of personnel objects with competencies
     */
    async exportPersonnelToCSV(personnel) {
        if (!personnel || personnel.length === 0) {
            throw new Error('No personnel data to export');
        }

        // Get all unique competency names across all personnel
        const competencyNames = new Set();
        personnel.forEach(person => {
            (person.competencies || []).forEach(comp => {
                if (comp.competency?.name) {
                    competencyNames.add(comp.competency.name);
                }
            });
        });

        const sortedCompNames = Array.from(competencyNames).sort();

        // Build CSV header
        const header = [
            'Name',
            'Email',
            'Organization',
            'Role',
            ...sortedCompNames
        ];

        // Build CSV rows
        const rows = personnel.map(person => {
            const row = [
                person.username || '',
                person.email || '',
                person.organizations?.name || '',
                person.role || ''
            ];

            // Add competency status for each competency column
            sortedCompNames.forEach(compName => {
                const comp = (person.competencies || []).find(c => c.competency?.name === compName);
                if (comp) {
                    // Include status and expiry date if available
                    let cellValue = comp.value || 'Yes';
                    if (comp.expiry_date) {
                        const expiryDate = new Date(comp.expiry_date).toLocaleDateString();
                        cellValue += ` (Exp: ${expiryDate})`;
                    }
                    if (comp.status === 'expired') {
                        cellValue += ' [EXPIRED]';
                    } else if (comp.status === 'pending_approval') {
                        cellValue += ' [PENDING]';
                    }
                    row.push(cellValue);
                } else {
                    row.push('');
                }
            });

            return row;
        });

        // Convert to CSV string
        const csvRows = [header, ...rows];
        const csvString = csvRows.map(row =>
            row.map(cell => {
                // Escape quotes and wrap in quotes if contains comma, quote, or newline
                const cellStr = String(cell);
                if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                    return `"${cellStr.replace(/"/g, '""')}"`;
                }
                return cellStr;
            }).join(',')
        ).join('\n');

        return csvString;
    }

    /**
     * Get personnel statistics for a given organization
     * @param {string} organizationId - Organization ID
     */
    async getOrganizationPersonnelStats(organizationId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase
            .from('profiles')
            .select(`
                id,
                username,
                competencies:employee_competencies(
                    id,
                    status,
                    expiry_date
                )
            `)
            .eq('organization_id', organizationId);

        if (error) throw error;

        const stats = {
            totalPersonnel: data.length,
            totalCompetencies: 0,
            activeCompetencies: 0,
            expiringCompetencies: 0,
            expiredCompetencies: 0
        };

        data.forEach(person => {
            const competencies = person.competencies || [];
            stats.totalCompetencies += competencies.length;

            competencies.forEach(comp => {
                if (comp.status === 'active') {
                    stats.activeCompetencies++;
                }
                if (comp.status === 'expired' || (comp.expiry_date && new Date(comp.expiry_date) < new Date())) {
                    stats.expiredCompetencies++;
                } else if (comp.expiry_date) {
                    const daysUntilExpiry = Math.ceil((new Date(comp.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
                    if (daysUntilExpiry > 0 && daysUntilExpiry <= 30) {
                        stats.expiringCompetencies++;
                    }
                }
            });
        });

        return stats;
    }

    /**
     * Search personnel by name, email, or competency
     * @param {string} searchTerm - Search term
     */
    async searchPersonnel(searchTerm) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        if (!searchTerm || searchTerm.trim() === '') {
            return await this.getAllPersonnelWithCompetencies();
        }

        const term = searchTerm.trim().toLowerCase();

        // Get all personnel and filter
        const allPersonnel = await this.getAllPersonnelWithCompetencies();
        return allPersonnel.filter(person =>
            person.username?.toLowerCase().includes(term) ||
            person.email?.toLowerCase().includes(term)
        );
    }

    /**
     * Get personnel by role
     * @param {string} role - Role to filter by
     */
    async getPersonnelByRole(role) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const allPersonnel = await this.getAllPersonnelWithCompetencies();
        return allPersonnel.filter(person => person.role === role);
    }

    /**
     * Get compliance report for a specific person
     * @param {string} userId - User ID
     */
    async getPersonnelComplianceReport(userId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        // Get profile
        const { data: person, error: personError } = await supabase
            .from('profiles')
            .select(`
                *,
                organizations(id, name)
            `)
            .eq('id', userId)
            .single();

        if (personError) throw personError;

        // Get competencies with definitions and categories
        const { data: competencies, error: compError } = await supabase
            .from('employee_competencies')
            .select(`
                id,
                value,
                expiry_date,
                status,
                document_url,
                document_name,
                notes,
                verified_by,
                verified_at,
                created_at,
                updated_at,
                competency_id,
                competency_definitions!inner(
                    id,
                    name,
                    description,
                    field_type,
                    requires_document,
                    requires_approval,
                    category_id,
                    competency_categories(
                        id,
                        name
                    )
                )
            `)
            .eq('user_id', userId);

        if (compError) throw compError;

        // Flatten and attach competencies
        person.competencies = (competencies || []).map(comp => ({
            ...comp,
            competency: {
                ...comp.competency_definitions,
                category: comp.competency_definitions.competency_categories
            }
        }));

        // Get history
        const { data: history, error: historyError } = await supabase
            .from('competency_history')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (historyError) throw historyError;

        // Categorize competencies
        const competenciesByCategory = {};
        (person.competencies || []).forEach(comp => {
            const categoryName = comp.competency?.category?.name || 'Other';
            if (!competenciesByCategory[categoryName]) {
                competenciesByCategory[categoryName] = [];
            }
            competenciesByCategory[categoryName].push(comp);
        });

        return {
            person,
            competenciesByCategory,
            history,
            summary: {
                totalCompetencies: person.competencies?.length || 0,
                activeCompetencies: (person.competencies || []).filter(c => c.status === 'active').length,
                expiredCompetencies: (person.competencies || []).filter(c =>
                    c.status === 'expired' || (c.expiry_date && new Date(c.expiry_date) < new Date())
                ).length,
                pendingApproval: (person.competencies || []).filter(c => c.status === 'pending_approval').length,
                withDocuments: (person.competencies || []).filter(c => c.document_url).length
            }
        };
    }

    /**
     * Bulk update competency status for multiple personnel
     * @param {Array} updates - Array of {userId, competencyId, status, notes}
     */
    async bulkUpdateCompetencyStatus(updates) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const currentUser = authManager.getCurrentUser();
        if (!currentUser || currentUser.role !== 'admin') {
            throw new Error('Insufficient permissions');
        }

        const results = {
            success: [],
            failed: []
        };

        for (const update of updates) {
            try {
                const { error } = await supabase
                    .from('employee_competencies')
                    .update({
                        status: update.status,
                        notes: update.notes || null,
                        verified_by: currentUser.id,
                        verified_at: new Date().toISOString()
                    })
                    .eq('user_id', update.userId)
                    .eq('competency_id', update.competencyId);

                if (error) {
                    results.failed.push({ ...update, error: error.message });
                } else {
                    results.success.push(update);
                }
            } catch (error) {
                results.failed.push({ ...update, error: error.message });
            }
        }

        return results;
    }

    /**
     * Add a competency to an employee
     * @param {string} userId - User ID
     * @param {string} competencyId - Competency definition ID
     * @param {string} issuedDate - Issued date (ISO string or null)
     * @param {string} expiryDate - Expiry date (ISO string or null)
     */
    async addCompetencyToEmployee(userId, competencyId, issuedDate, expiryDate, issuingBody, certificationId, value) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const currentUser = authManager.getCurrentUser();
        if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'org_admin')) {
            throw new Error('Insufficient permissions');
        }

        // First insert the competency
        const { data, error } = await supabase
            .from('employee_competencies')
            .insert({
                user_id: userId,
                competency_id: competencyId,
                status: 'active',
                expiry_date: expiryDate || null,
                issuing_body: issuingBody || null,
                certification_id: certificationId || null,
                value: value || null,
                verified_by: currentUser.id,
                verified_at: new Date().toISOString(),
                witness_checked: false,
                witnessed_by: null,
                witnessed_at: null,
                witness_notes: null
            })
            .select()
            .single();

        if (error) throw error;

        // If we need to update the issued date (created_at), try to use the RPC function
        // This is optional - if the function doesn't exist, we just won't update created_at
        if (issuedDate) {
            try {
                const { error: rpcError } = await supabase.rpc('update_competency_created_at', {
                    p_user_id: userId,
                    p_competency_id: competencyId,
                    p_created_at: issuedDate
                });

                // Only throw if it's an error other than "function doesn't exist"
                if (rpcError && !rpcError.message?.includes('function') && !rpcError.code?.includes('42883')) {
                    console.warn('Failed to update issued date (created_at):', rpcError.message);
                }
            } catch (err) {
                // Silently fail if the RPC function doesn't exist
                console.warn('RPC function update_competency_created_at not available:', err);
            }
        }

        return data;
    }

    /**
     * Update competency dates (issued and expiry)
     * @param {string} userId - User ID
     * @param {string} competencyId - Competency definition ID
     * @param {string} issuedDate - Issued date (ISO string or null)
     * @param {string} expiryDate - Expiry date (ISO string or null)
     * @param {string} issuingBody - Issuing body/organization (for certifications)
     * @param {string} certificationId - Certification ID/number
     * @param {string} value - General value field
     */
    async updateCompetencyDates(userId, competencyId, issuedDate, expiryDate, issuingBody, certificationId, value) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const currentUser = authManager.getCurrentUser();
        if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'org_admin')) {
            throw new Error('Insufficient permissions');
        }

        const updateData = {
            expiry_date: expiryDate || null,
            issuing_body: issuingBody || null,
            certification_id: certificationId || null,
            value: value || null
        };

        // Note: created_at cannot be directly updated through normal updates due to database constraints
        // If we need to update the issued date, we need to use a custom function or raw SQL
        // For now, we'll focus on updating the expiry_date and use created_at as the issued date

        const { data, error } = await supabase
            .from('employee_competencies')
            .update(updateData)
            .eq('user_id', userId)
            .eq('competency_id', competencyId)
            .select()
            .single();

        if (error) throw error;

        // If we need to update the issued date (created_at), try to use the RPC function
        // This is optional - if the function doesn't exist, we just won't update created_at
        if (issuedDate) {
            try {
                const { error: rpcError } = await supabase.rpc('update_competency_created_at', {
                    p_user_id: userId,
                    p_competency_id: competencyId,
                    p_created_at: issuedDate
                });

                // Only throw if it's an error other than "function doesn't exist"
                if (rpcError && !rpcError.message?.includes('function') && !rpcError.code?.includes('42883')) {
                    console.warn('Failed to update issued date (created_at):', rpcError.message);
                }
            } catch (err) {
                // Silently fail if the RPC function doesn't exist
                console.warn('RPC function update_competency_created_at not available:', err);
            }
        }

        return data;
    }

    /**
     * Generate compliance dashboard data
     */
    async getComplianceDashboard() {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const [personnel, expiringData] = await Promise.all([
            this.getAllPersonnelWithCompetencies(),
            competencyService.getExpiringCompetencies(30)
        ]);

        const dashboard = {
            totalPersonnel: personnel.length,
            totalCompetencies: 0,
            activeCompetencies: 0,
            expiringCompetencies: expiringData.length,
            expiredCompetencies: 0,
            pendingApproval: 0,
            byOrganization: {},
            byRole: {},
            complianceRate: 0
        };

        personnel.forEach(person => {
            const competencies = person.competencies || [];
            dashboard.totalCompetencies += competencies.length;

            competencies.forEach(comp => {
                if (comp.status === 'active' && (!comp.expiry_date || new Date(comp.expiry_date) > new Date())) {
                    dashboard.activeCompetencies++;
                } else if (comp.status === 'expired' || (comp.expiry_date && new Date(comp.expiry_date) < new Date())) {
                    dashboard.expiredCompetencies++;
                } else if (comp.status === 'pending_approval') {
                    dashboard.pendingApproval++;
                }
            });

            // By organization
            const orgName = person.organizations?.name || 'Unknown';
            if (!dashboard.byOrganization[orgName]) {
                dashboard.byOrganization[orgName] = {
                    personnel: 0,
                    competencies: 0,
                    active: 0,
                    expired: 0
                };
            }
            dashboard.byOrganization[orgName].personnel++;
            dashboard.byOrganization[orgName].competencies += competencies.length;
            dashboard.byOrganization[orgName].active += competencies.filter(c => c.status === 'active').length;
            dashboard.byOrganization[orgName].expired += competencies.filter(c =>
                c.status === 'expired' || (c.expiry_date && new Date(c.expiry_date) < new Date())
            ).length;

            // By role
            if (!dashboard.byRole[person.role]) {
                dashboard.byRole[person.role] = {
                    count: 0,
                    competencies: 0
                };
            }
            dashboard.byRole[person.role].count++;
            dashboard.byRole[person.role].competencies += competencies.length;
        });

        // Calculate compliance rate
        if (dashboard.totalCompetencies > 0) {
            dashboard.complianceRate = Math.round(
                (dashboard.activeCompetencies / dashboard.totalCompetencies) * 100
            );
        }

        return dashboard;
    }
}

export default new PersonnelService();
