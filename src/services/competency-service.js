// Competency Management Service
import supabase, { isSupabaseConfigured } from '../supabase-client.js';
import authManager from '../auth-manager.js';

/**
 * Service for managing employee competencies, certifications, and qualifications
 */
class CompetencyService {
    /**
     * Get all competency categories
     */
    async getCategories() {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase
            .from('competency_categories')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (error) throw error;
        return data;
    }

    /**
     * Get competency definitions by category
     * @param {string} categoryId - Optional category ID to filter by
     */
    async getCompetencyDefinitions(categoryId = null) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        let query = supabase
            .from('competency_definitions')
            .select(`
                *,
                category:competency_categories(id, name, description)
            `)
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (categoryId) {
            query = query.eq('category_id', categoryId);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
    }

    /**
     * Get competencies for a specific user
     * @param {string} userId - User ID
     */
    async getUserCompetencies(userId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase
            .from('employee_competencies')
            .select(`
                *,
                competency:competency_definitions(
                    id,
                    name,
                    description,
                    field_type,
                    category:competency_categories(id, name)
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    }

    /**
     * Get competencies grouped by category for a user
     * @param {string} userId - User ID
     */
    async getUserCompetenciesByCategory(userId) {
        const competencies = await this.getUserCompetencies(userId);
        const categories = await this.getCategories();

        // Group competencies by category
        const grouped = {};
        categories.forEach(cat => {
            grouped[cat.id] = {
                category: cat,
                competencies: []
            };
        });

        competencies.forEach(comp => {
            const categoryId = comp.competency?.category?.id;
            if (categoryId && grouped[categoryId]) {
                grouped[categoryId].competencies.push(comp);
            }
        });

        return Object.values(grouped);
    }

    /**
     * Create or update a competency for a user
     * @param {string} userId - User ID
     * @param {string} competencyId - Competency definition ID
     * @param {object} data - Competency data
     */
    async upsertCompetency(userId, competencyId, data) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const competencyData = {
            user_id: userId,
            competency_id: competencyId,
            value: data.value || null,
            expiry_date: data.expiryDate || null,
            document_url: data.documentUrl || null,
            document_name: data.documentName || null,
            notes: data.notes || null,
            status: data.status || 'active'
        };

        const { data: result, error } = await supabase
            .from('employee_competencies')
            .upsert(competencyData, {
                onConflict: 'user_id,competency_id'
            })
            .select()
            .single();

        if (error) throw error;
        return result;
    }

    /**
     * Delete a competency
     * @param {string} competencyId - Employee competency ID
     */
    async deleteCompetency(competencyId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { error } = await supabase
            .from('employee_competencies')
            .delete()
            .eq('id', competencyId);

        if (error) throw error;
        return true;
    }

    /**
     * Verify/approve a competency
     * @param {string} competencyId - Employee competency ID
     * @param {boolean} approved - Whether to approve or reject
     * @param {string} reason - Optional reason for rejection
     */
    async verifyCompetency(competencyId, approved, reason = null) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const currentUser = authManager.getCurrentUser();
        if (!currentUser) {
            throw new Error('Not authenticated');
        }

        const updateData = {
            status: approved ? 'active' : 'rejected',
            verified_by: currentUser.id,
            verified_at: new Date().toISOString()
        };

        if (!approved && reason) {
            updateData.notes = reason;
        }

        const { data, error } = await supabase
            .from('employee_competencies')
            .update(updateData)
            .eq('id', competencyId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Get expiring competencies
     * @param {number} daysThreshold - Number of days to look ahead (default 30)
     */
    async getExpiringCompetencies(daysThreshold = 30) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        // Try using the RPC function first
        const { data, error } = await supabase
            .rpc('get_expiring_competencies', { days_threshold: daysThreshold });

        // If the function doesn't exist, fallback to a query
        if (error && error.message?.includes('function')) {
            console.warn('get_expiring_competencies function not found, using fallback query');

            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + daysThreshold);

            const { data: fallbackData, error: fallbackError } = await supabase
                .from('employee_competencies')
                .select(`
                    id,
                    user_id,
                    competency_id,
                    value,
                    expiry_date,
                    status,
                    profiles!employee_competencies_user_id_fkey(username, email),
                    competency_definitions!employee_competencies_competency_id_fkey(name)
                `)
                .not('expiry_date', 'is', null)
                .gte('expiry_date', new Date().toISOString())
                .lte('expiry_date', futureDate.toISOString())
                .eq('status', 'active')
                .order('expiry_date', { ascending: true });

            if (fallbackError) throw fallbackError;

            // Transform to match RPC function output
            return (fallbackData || []).map(item => ({
                user_id: item.user_id,
                username: item.profiles?.username,
                email: item.profiles?.email,
                competency_name: item.competency_definitions?.name,
                expiry_date: item.expiry_date,
                days_until_expiry: Math.ceil((new Date(item.expiry_date) - new Date()) / (1000 * 60 * 60 * 24))
            }));
        }

        if (error) throw error;
        return data || [];
    }

    /**
     * Get competency history for a user
     * @param {string} userId - User ID
     */
    async getCompetencyHistory(userId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase
            .from('competency_history')
            .select(`
                *,
                competency:competency_definitions(name)
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;
        return data;
    }

    /**
     * Upload competency document
     * @param {File} file - File to upload
     * @param {string} userId - User ID
     * @param {string} competencyName - Name of the competency
     */
    async uploadDocument(file, userId, competencyName) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `${userId}/${competencyName.replace(/\s+/g, '_')}_${Date.now()}.${fileExt}`;
        const filePath = `competency-documents/${fileName}`;

        const { data, error } = await supabase.storage
            .from('documents')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) throw error;

        // Store the file path (not a URL) - we'll generate signed URLs when needed
        return {
            url: filePath, // Store path, not URL
            name: file.name,
            path: filePath
        };
    }

    /**
     * Get signed URL for a competency document (valid for 1 hour)
     * @param {string} filePath - Storage file path
     */
    async getDocumentUrl(filePath) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        // If filePath is already a full URL, return it
        if (filePath.startsWith('http')) {
            return filePath;
        }

        const { data, error } = await supabase.storage
            .from('documents')
            .createSignedUrl(filePath, 3600); // Valid for 1 hour

        if (error) throw error;
        return data.signedUrl;
    }

    /**
     * Delete a document from storage
     * @param {string} filePath - Storage file path
     */
    async deleteDocument(filePath) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { error } = await supabase.storage
            .from('documents')
            .remove([filePath]);

        if (error) throw error;
        return true;
    }

    /**
     * Check if current user can manage competencies for target user
     * @param {string} targetUserId - Target user ID
     */
    async canManageCompetencies(targetUserId) {
        const currentUser = authManager.getCurrentUser();
        if (!currentUser) return false;

        // Admins can manage all
        if (currentUser.role === 'admin') return true;

        // Users can manage their own
        if (currentUser.id === targetUserId) return true;

        // Org admins can manage users in their org
        if (currentUser.role === 'org_admin') {
            const { data: targetProfile } = await supabase
                .from('profiles')
                .select('organization_id')
                .eq('id', targetUserId)
                .single();

            return targetProfile?.organization_id === currentUser.organizationId;
        }

        return false;
    }

    /**
     * Get all competency definitions (without category filter)
     */
    async getAllCompetencyDefinitions() {
        return this.getCompetencyDefinitions(null);
    }

    /**
     * Bulk create competencies
     * @param {Array} competencies - Array of competency objects
     */
    async bulkCreateCompetencies(competencies) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        if (!Array.isArray(competencies) || competencies.length === 0) {
            throw new Error('Competencies array is required');
        }

        const { data, error } = await supabase
            .from('employee_competencies')
            .upsert(competencies, {
                onConflict: 'user_id,competency_id'
            })
            .select();

        if (error) throw error;
        return data;
    }

    /**
     * Bulk import competencies from CSV data
     * @param {string} userId - User ID
     * @param {object} csvData - Parsed CSV data
     */
    async bulkImportCompetencies(userId, csvData) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const definitions = await this.getCompetencyDefinitions();
        const competenciesToImport = [];

        // Map CSV fields to competency definitions
        for (const [fieldName, value] of Object.entries(csvData)) {
            if (!value || value === '') continue;

            const definition = definitions.find(def =>
                def.name.toLowerCase() === fieldName.toLowerCase()
            );

            if (definition) {
                competenciesToImport.push({
                    user_id: userId,
                    competency_id: definition.id,
                    value: value.toString(),
                    expiry_date: definition.field_type === 'expiry_date' ? value : null,
                    status: 'active'
                });
            }
        }

        if (competenciesToImport.length === 0) {
            throw new Error('No matching competencies found in CSV data');
        }

        const { data, error } = await supabase
            .from('employee_competencies')
            .upsert(competenciesToImport, {
                onConflict: 'user_id,competency_id'
            })
            .select();

        if (error) throw error;
        return data;
    }
}

export default new CompetencyService();
