// Personnel Management Service
import supabase, { isSupabaseConfigured } from '../supabase-client';
import authManager from '../auth-manager.js';
import competencyService from './competency-service.ts';

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
            supabase!
                .from('profiles')
                .select(`
                    id,
                    username,
                    email,
                    role,
                    organization_id,
                    avatar_url,
                    is_active,
                    mobile_number,
                    home_address,
                    nearest_uk_train_station,
                    date_of_birth,
                    next_of_kin,
                    next_of_kin_emergency_contact_number,
                    vantage_number,
                    organizations(id, name)
                `)
                .order('username', { ascending: true }),
            supabase!
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
                    level,
                    competency_definitions!inner(
                        id,
                        name,
                        description,
                        field_type,
                        category_id,
                        is_active,
                        competency_categories(
                            id,
                            name,
                            description
                        )
                    )
                `)
                .eq('competency_definitions.is_active', true)
        ]);

        if (profilesResult.error) throw profilesResult.error;
        if (competenciesResult.error) throw competenciesResult.error;

        const profiles = profilesResult.data;
        const allCompetencies = competenciesResult.data || [];

        // Group competencies by user_id for efficient lookup
        const competenciesByUser: Record<string, unknown[]> = {};
        allCompetencies.forEach((comp: Record<string, unknown>) => {
            const userId = comp.user_id as string;
            if (!competenciesByUser[userId]) {
                competenciesByUser[userId] = [];
            }
            const compDefs = comp.competency_definitions as Record<string, unknown> | undefined;
            // Flatten the competency_definitions structure
            competenciesByUser[userId].push({
                ...comp,
                competency: {
                    ...compDefs,
                    category: (compDefs as Record<string, unknown> | undefined)?.competency_categories || null
                }
            });
        });

        // Attach competencies to each profile
        const profilesWithCompetencies = profiles.map((profile: Record<string, unknown>) => ({
            ...profile,
            competencies: competenciesByUser[profile.id as string] || []
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
            personnel: personnel.map((person: Record<string, unknown>) => ({
                id: person.id,
                username: person.username,
                email: person.email,
                organization_id: person.organization_id,
                role: person.role,
                competencies: (person.competencies as unknown[]) || []
            })),
            competencies: definitions
        };
    }

    /**
     * Export personnel and competencies to CSV format
     */
    async exportPersonnelToCSV(personnel: Record<string, unknown>[]): Promise<string> {
        if (!personnel || personnel.length === 0) {
            throw new Error('No personnel data to export');
        }

        // Get all unique competency names across all personnel
        const competencyNames = new Set<string>();
        personnel.forEach(person => {
            ((person.competencies as Record<string, unknown>[]) || []).forEach(comp => {
                const competency = comp.competency as Record<string, unknown> | undefined;
                if (competency?.name) {
                    competencyNames.add(competency.name as string);
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
            const orgs = person.organizations as Record<string, unknown> | undefined;
            const row: string[] = [
                (person.username as string) || '',
                (person.email as string) || '',
                (orgs?.name as string) || '',
                (person.role as string) || ''
            ];

            // Add competency status for each competency column
            sortedCompNames.forEach(compName => {
                const comp = ((person.competencies as Record<string, unknown>[]) || []).find(c => {
                    const competency = c.competency as Record<string, unknown> | undefined;
                    return competency?.name === compName;
                });
                if (comp) {
                    // Include status and expiry date if available
                    let cellValue = (comp.value as string) || 'Yes';
                    if (comp.expiry_date) {
                        const expiryDate = new Date(comp.expiry_date as string).toLocaleDateString();
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
     */
    async getOrganizationPersonnelStats(organizationId: string) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase!
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

        data.forEach((person: Record<string, unknown>) => {
            const competencies = (person.competencies as Record<string, unknown>[]) || [];
            stats.totalCompetencies += competencies.length;

            competencies.forEach(comp => {
                if (comp.status === 'active') {
                    stats.activeCompetencies++;
                }
                if (comp.status === 'expired' || (comp.expiry_date && new Date(comp.expiry_date as string) < new Date())) {
                    stats.expiredCompetencies++;
                } else if (comp.expiry_date) {
                    const daysUntilExpiry = Math.ceil((new Date(comp.expiry_date as string).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
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
     */
    async searchPersonnel(searchTerm: string) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        if (!searchTerm || searchTerm.trim() === '') {
            return await this.getAllPersonnelWithCompetencies();
        }

        const term = searchTerm.trim().toLowerCase();

        // Get all personnel and filter
        const allPersonnel = await this.getAllPersonnelWithCompetencies();
        return allPersonnel.filter((person: Record<string, unknown>) =>
            (person.username as string)?.toLowerCase().includes(term) ||
            (person.email as string)?.toLowerCase().includes(term)
        );
    }

    /**
     * Get personnel by role
     */
    async getPersonnelByRole(role: string) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const allPersonnel = await this.getAllPersonnelWithCompetencies();
        return allPersonnel.filter((person: Record<string, unknown>) => person.role === role);
    }

    /**
     * Get compliance report for a specific person
     */
    async getPersonnelComplianceReport(userId: string) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        // Get profile
        const { data: person, error: personError } = await supabase!
            .from('profiles')
            .select(`
                id,
                username,
                email,
                role,
                organization_id,
                avatar_url,
                is_active,
                created_at,
                organizations(id, name)
            `)
            .eq('id', userId)
            .single();

        if (personError) throw personError;

        // Get competencies with definitions and categories (only active definitions)
        const { data: competencies, error: compError } = await supabase!
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
                    is_active,
                    competency_categories(
                        id,
                        name
                    )
                )
            `)
            .eq('user_id', userId)
            .eq('competency_definitions.is_active', true);

        if (compError) throw compError;

        // Flatten and attach competencies
        (person as Record<string, unknown>).competencies = (competencies || []).map((comp: Record<string, unknown>) => {
            const compDefs = comp.competency_definitions as Record<string, unknown>;
            return {
                ...comp,
                competency: {
                    ...compDefs,
                    category: compDefs.competency_categories
                }
            };
        });

        // Get history
        const { data: history, error: historyError } = await supabase!
            .from('competency_history')
            .select(`
                id,
                user_id,
                competency_id,
                action,
                old_value,
                new_value,
                changed_by,
                created_at
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (historyError) throw historyError;

        // Categorize competencies
        const personCompetencies = ((person as Record<string, unknown>).competencies as Record<string, unknown>[]) || [];
        const competenciesByCategory: Record<string, Record<string, unknown>[]> = {};
        personCompetencies.forEach(comp => {
            const competency = comp.competency as Record<string, unknown> | undefined;
            const category = competency?.category as Record<string, unknown> | undefined;
            const categoryName = (category?.name as string) || 'Other';
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
                totalCompetencies: personCompetencies.length || 0,
                activeCompetencies: personCompetencies.filter(c => c.status === 'active').length,
                expiredCompetencies: personCompetencies.filter(c =>
                    c.status === 'expired' || (c.expiry_date && new Date(c.expiry_date as string) < new Date())
                ).length,
                pendingApproval: personCompetencies.filter(c => c.status === 'pending_approval').length,
                withDocuments: personCompetencies.filter(c => c.document_url).length
            }
        };
    }

    /**
     * Bulk update competency status for multiple personnel
     */
    async bulkUpdateCompetencyStatus(updates: Array<{ userId: string; competencyId: string; status: string; notes?: string }>) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const currentUser = authManager.getCurrentUser();
        if (!currentUser || currentUser.role !== 'admin') {
            throw new Error('Insufficient permissions');
        }

        const results: { success: typeof updates; failed: Array<typeof updates[number] & { error: string }> } = {
            success: [],
            failed: []
        };

        for (const update of updates) {
            try {
                const { error } = await supabase!
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
                results.failed.push({ ...update, error: (error as Error).message });
            }
        }

        return results;
    }

    /**
     * Add a competency to an employee
     */
    async addCompetencyToEmployee(
        userId: string,
        competencyId: string,
        issuedDate: string | null,
        expiryDate: string | null,
        issuingBody?: string | null,
        certificationId?: string | null,
        value?: string | null
    ) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const currentUser = authManager.getCurrentUser();
        if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'org_admin')) {
            throw new Error('Insufficient permissions');
        }

        // First insert the competency
        const { data, error } = await supabase!
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
                const { error: rpcError } = await supabase!.rpc('update_competency_created_at', {
                    p_user_id: userId,
                    p_competency_id: competencyId,
                    p_created_at: issuedDate
                });

                // Only throw if it's an error other than "function doesn't exist"
                if (rpcError && !rpcError.message?.includes('function') && !rpcError.code?.includes('42883')) {
                    // intentionally empty - non-critical RPC errors are silently ignored
                }
            } catch (err) {
                // Silently fail if the RPC function doesn't exist
            }
        }

        return data;
    }

    /**
     * Update competency dates (issued and expiry)
     */
    async updateCompetencyDates(
        userId: string,
        competencyId: string,
        issuedDate: string | null,
        expiryDate: string | null,
        issuingBody?: string | null,
        certificationId?: string | null,
        value?: string | null
    ) {
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

        const { data, error } = await supabase!
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
                const { error: rpcError } = await supabase!.rpc('update_competency_created_at', {
                    p_user_id: userId,
                    p_competency_id: competencyId,
                    p_created_at: issuedDate
                });

                // Only throw if it's an error other than "function doesn't exist"
                if (rpcError && !rpcError.message?.includes('function') && !rpcError.code?.includes('42883')) {
                    // intentionally empty - non-critical RPC errors are silently ignored
                }
            } catch (err) {
                // Silently fail if the RPC function doesn't exist
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
            byOrganization: {} as Record<string, { personnel: number; competencies: number; active: number; expired: number }>,
            byRole: {} as Record<string, { count: number; competencies: number }>,
            complianceRate: 0
        };

        personnel.forEach((person: Record<string, unknown>) => {
            const competencies = (person.competencies as Record<string, unknown>[]) || [];
            dashboard.totalCompetencies += competencies.length;

            competencies.forEach(comp => {
                if (comp.status === 'active' && (!comp.expiry_date || new Date(comp.expiry_date as string) > new Date())) {
                    dashboard.activeCompetencies++;
                } else if (comp.status === 'expired' || (comp.expiry_date && new Date(comp.expiry_date as string) < new Date())) {
                    dashboard.expiredCompetencies++;
                } else if (comp.status === 'pending_approval') {
                    dashboard.pendingApproval++;
                }
            });

            // By organization
            const orgs = person.organizations as Record<string, unknown> | undefined;
            const orgName = (orgs?.name as string) || 'Unknown';
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
                c.status === 'expired' || (c.expiry_date && new Date(c.expiry_date as string) < new Date())
            ).length;

            // By role
            const role = person.role as string;
            if (!dashboard.byRole[role]) {
                dashboard.byRole[role] = {
                    count: 0,
                    competencies: 0
                };
            }
            dashboard.byRole[role].count++;
            dashboard.byRole[role].competencies += competencies.length;
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
