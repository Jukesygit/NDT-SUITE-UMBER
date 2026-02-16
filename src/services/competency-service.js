// Competency Management Service
import supabase, { isSupabaseConfigured } from '../supabase-client.js';
import authManager from '../auth-manager.js';
import { logActivity } from './activity-log-service.ts';

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
            .select(`
                id,
                name,
                description,
                display_order,
                is_active
            `)
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
                id,
                name,
                description,
                field_type,
                category_id,
                display_order,
                is_active,
                requires_document,
                requires_approval,
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
                id,
                user_id,
                competency_id,
                value,
                expiry_date,
                document_url,
                document_name,
                notes,
                status,
                witness_checked,
                witnessed_by,
                witnessed_at,
                witness_notes,
                created_at,
                updated_at,
                competency:competency_definitions!inner(
                    id,
                    name,
                    description,
                    field_type,
                    is_active,
                    category:competency_categories(id, name)
                )
            `)
            .eq('user_id', userId)
            .eq('competency_definitions.is_active', true)
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

        // Determine status: if document is provided and no explicit status, set to pending_approval
        let status = data.status;
        if (!status) {
            // Check if we're adding a new document - set to pending_approval for review
            if (data.documentUrl) {
                status = 'pending_approval';
            } else {
                status = 'active';
            }
        }

        const competencyData = {
            user_id: userId,
            competency_id: competencyId,
            value: data.value || null,
            expiry_date: data.expiryDate || null,
            issuing_body: data.issuingBody || null,
            certification_id: data.certificationId || null,
            document_url: data.documentUrl || null,
            document_name: data.documentName || null,
            notes: data.notes || null,
            status: status,
            // Witness check fields
            witness_checked: data.witnessChecked || false,
            witnessed_by: data.witnessedBy || null,
            witnessed_at: data.witnessedAt || null,
            witness_notes: data.witnessNotes || null
        };

        const { data: result, error } = await supabase
            .from('employee_competencies')
            .upsert(competencyData, {
                onConflict: 'user_id,competency_id'
            })
            .select('*, competency:competency_definitions(name)')
            .single();

        if (error) throw error;

        const competencyName = result.competency?.name || 'Unknown';
        const isNew = result.created_at === result.updated_at;

        // Log competency activity
        logActivity({
            userId,
            actionType: isNew ? 'competency_created' : 'competency_updated',
            actionCategory: 'competency',
            description: `${isNew ? 'Created' : 'Updated'} competency: ${competencyName}`,
            entityType: 'competency',
            entityId: result.id,
            entityName: competencyName,
            details: { competencyId, value: data.value, hasDocument: !!data.documentUrl },
        });

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

        // Fetch the competency name before deleting
        const { data: existing } = await supabase
            .from('employee_competencies')
            .select('competency:competency_definitions(name)')
            .eq('id', competencyId)
            .single();

        const competencyName = existing?.competency?.name || 'Unknown';

        const { error } = await supabase
            .from('employee_competencies')
            .delete()
            .eq('id', competencyId);

        if (error) throw error;

        // Log competency deletion
        logActivity({
            actionType: 'competency_deleted',
            actionCategory: 'competency',
            description: `Deleted competency: ${competencyName}`,
            entityType: 'competency',
            entityId: competencyId,
            entityName: competencyName,
        });

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
            .select('*, competency:competency_definitions(name)')
            .single();

        if (error) throw error;

        const competencyName = data.competency?.name || 'Unknown';

        // Log competency approval/rejection
        logActivity({
            actionType: approved ? 'competency_approved' : 'competency_rejected',
            actionCategory: 'competency',
            description: `${approved ? 'Approved' : 'Rejected'} competency: ${competencyName}${reason ? ` — ${reason}` : ''}`,
            entityType: 'competency',
            entityId: competencyId,
            entityName: competencyName,
            details: { approved, reason },
        });

        return data;
    }

    /**
     * Get all competencies pending document approval
     * Returns competencies with status='pending_approval' that have documents attached
     */
    async getPendingApprovals() {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        // First get the pending competencies
        const { data: competencies, error: compError } = await supabase
            .from('employee_competencies')
            .select(`
                id,
                user_id,
                competency_id,
                value,
                expiry_date,
                document_url,
                document_name,
                notes,
                status,
                created_at,
                updated_at,
                issuing_body,
                certification_id,
                competency:competency_definitions(
                    id,
                    name,
                    description,
                    field_type,
                    category:competency_categories(id, name)
                )
            `)
            .eq('status', 'pending_approval')
            .not('document_url', 'is', null)
            .order('created_at', { ascending: false });

        if (compError) throw compError;
        if (!competencies || competencies.length === 0) return [];

        // Get unique user IDs
        const userIds = [...new Set(competencies.map(c => c.user_id))];

        // Fetch user profiles separately
        const { data: profiles, error: profileError } = await supabase
            .from('profiles')
            .select(`
                id,
                username,
                email,
                avatar_url,
                organization_id,
                organizations(id, name)
            `)
            .in('id', userIds);

        if (profileError) throw profileError;

        // Create a map for quick lookup
        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        // Combine the data
        return competencies.map(comp => ({
            ...comp,
            user: profileMap.get(comp.user_id) || null
        }));
    }

    /**
     * Request changes to a competency (send back to user with comment)
     * @param {string} competencyId - Employee competency ID
     * @param {string} comment - Comment explaining what changes are needed
     */
    async requestChanges(competencyId, comment) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const currentUser = authManager.getCurrentUser();
        if (!currentUser) {
            throw new Error('Not authenticated');
        }

        // Update status and add comment as note
        const { data, error } = await supabase
            .from('employee_competencies')
            .update({
                status: 'changes_requested',
                notes: comment,
                verified_by: currentUser.id,
                verified_at: new Date().toISOString()
            })
            .eq('id', competencyId)
            .select('*, competency:competency_definitions(name)')
            .single();

        if (error) throw error;

        const competencyName = data.competency?.name || 'Unknown';

        // Log changes requested activity
        logActivity({
            actionType: 'competency_rejected',
            actionCategory: 'competency',
            description: `Requested changes on competency: ${competencyName} — ${comment}`,
            entityType: 'competency',
            entityId: competencyId,
            entityName: competencyName,
            details: { action: 'changes_requested', comment },
        });

        return data;
    }

    /**
     * Get expiring competencies
     * @param {number} daysThreshold - Number of days to look ahead (default 30)
     * @param {boolean} includeComments - Include comment information (default false)
     */
    async getExpiringCompetencies(daysThreshold = 30, includeComments = false) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        // Use the enhanced RPC function with comments if requested
        const functionName = includeComments
            ? 'get_expiring_competencies_with_comments'
            : 'get_expiring_competencies';

        const { data, error } = await supabase
            .rpc(functionName, { days_threshold: daysThreshold });

        // If the function doesn't exist, fallback to a query
        if (error && error.message?.includes('function')) {
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
                competency_id: item.id,
                competency_name: item.competency_definitions?.name,
                expiry_date: item.expiry_date,
                days_until_expiry: Math.ceil((new Date(item.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)),
                ...(includeComments && {
                    comment_count: 0,
                    latest_comment: null,
                    latest_comment_type: null,
                    has_renewal_in_progress: false
                })
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
                id,
                user_id,
                competency_id,
                action,
                old_value,
                new_value,
                changed_by,
                created_at,
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

    /**
     * Get comments for a competency
     * @param {string} employeeCompetencyId - Employee competency ID
     */
    async getCompetencyComments(employeeCompetencyId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase
            .from('competency_comments')
            .select(`
                id,
                employee_competency_id,
                comment_text,
                comment_type,
                is_pinned,
                created_by,
                created_at,
                updated_at,
                mentioned_users,
                author:profiles!competency_comments_created_by_fkey(
                    id,
                    username,
                    email,
                    avatar_url
                )
            `)
            .eq('employee_competency_id', employeeCompetencyId)
            .order('is_pinned', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    }

    /**
     * Add a comment to a competency
     * @param {string} employeeCompetencyId - Employee competency ID
     * @param {string} commentText - Comment text
     * @param {string} commentType - Comment type (general, expiry_update, renewal_in_progress, etc.)
     * @param {boolean} isPinned - Whether to pin the comment
     * @param {Array<string>} mentionedUsers - Array of user IDs mentioned in comment
     */
    async addCompetencyComment(employeeCompetencyId, commentText, commentType = 'general', isPinned = false, mentionedUsers = null) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const currentUser = authManager.getCurrentUser();
        if (!currentUser) {
            throw new Error('Not authenticated');
        }

        const { data, error } = await supabase
            .from('competency_comments')
            .insert({
                employee_competency_id: employeeCompetencyId,
                comment_text: commentText,
                comment_type: commentType,
                is_pinned: isPinned,
                created_by: currentUser.id,
                mentioned_users: mentionedUsers
            })
            .select(`
                id,
                employee_competency_id,
                comment_text,
                comment_type,
                is_pinned,
                created_by,
                created_at,
                updated_at,
                mentioned_users,
                author:profiles!competency_comments_created_by_fkey(
                    id,
                    username,
                    email,
                    avatar_url
                )
            `)
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Update a comment
     * @param {string} commentId - Comment ID
     * @param {object} updates - Fields to update
     */
    async updateCompetencyComment(commentId, updates) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase
            .from('competency_comments')
            .update(updates)
            .eq('id', commentId)
            .select(`
                id,
                employee_competency_id,
                comment_text,
                comment_type,
                is_pinned,
                created_by,
                created_at,
                updated_at,
                mentioned_users,
                author:profiles!competency_comments_created_by_fkey(
                    id,
                    username,
                    email,
                    avatar_url
                )
            `)
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Delete a comment
     * @param {string} commentId - Comment ID
     */
    async deleteCompetencyComment(commentId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { error } = await supabase
            .from('competency_comments')
            .delete()
            .eq('id', commentId);

        if (error) throw error;
        return true;
    }

    /**
     * Pin/unpin a comment
     * @param {string} commentId - Comment ID
     * @param {boolean} isPinned - Whether to pin or unpin
     */
    async pinCompetencyComment(commentId, isPinned) {
        return this.updateCompetencyComment(commentId, { is_pinned: isPinned });
    }

    /**
     * Get competencies with recent comments
     * @param {string} userId - Optional user ID to filter by
     * @param {number} daysBack - Number of days to look back (default 7)
     */
    async getCompetenciesWithComments(userId = null, daysBack = 7) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { data, error } = await supabase
            .rpc('get_competencies_with_comments', {
                p_user_id: userId,
                p_days_back: daysBack
            });

        if (error) throw error;
        return data || [];
    }

    // ============================================================
    // ADMIN: Category & Definition Management
    // ============================================================

    /**
     * Check if current user is admin
     * @private
     */
    _requireAdmin() {
        const currentUser = authManager.getCurrentUser();
        if (!currentUser) {
            throw new Error('Not authenticated');
        }
        if (currentUser.role !== 'admin') {
            throw new Error('Admin access required');
        }
        return currentUser;
    }

    /**
     * Get all categories (including inactive) for admin view
     * @param {boolean} includeInactive - Include inactive categories
     */
    async getAllCategories(includeInactive = true) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        let query = supabase
            .from('competency_categories')
            .select('*')
            .order('display_order', { ascending: true });

        if (!includeInactive) {
            query = query.eq('is_active', true);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
    }

    /**
     * Create a new competency category (admin only)
     * @param {object} data - Category data { name, description }
     */
    async createCategory(data) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const currentUser = this._requireAdmin();

        // Get max display_order for new category
        const { data: existing } = await supabase
            .from('competency_categories')
            .select('display_order')
            .order('display_order', { ascending: false })
            .limit(1);

        const maxOrder = existing?.[0]?.display_order ?? 0;

        const { data: result, error } = await supabase
            .from('competency_categories')
            .insert({
                name: data.name,
                description: data.description || null,
                display_order: maxOrder + 1,
                is_active: true
            })
            .select()
            .single();

        if (error) throw error;

        logActivity({
            userId: currentUser.id,
            actionType: 'category_created',
            actionCategory: 'admin',
            description: `Created competency category: ${data.name}`,
            entityType: 'competency_category',
            entityId: result.id,
            details: { name: data.name }
        });

        return result;
    }

    /**
     * Update a competency category (admin only)
     * @param {string} id - Category ID
     * @param {object} data - Fields to update { name?, description?, is_active? }
     */
    async updateCategory(id, data) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const currentUser = this._requireAdmin();

        const updates = {};
        if (data.name !== undefined) updates.name = data.name;
        if (data.description !== undefined) updates.description = data.description;
        if (data.is_active !== undefined) updates.is_active = data.is_active;

        const { data: result, error } = await supabase
            .from('competency_categories')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        logActivity({
            userId: currentUser.id,
            actionType: 'category_updated',
            actionCategory: 'admin',
            description: `Updated competency category: ${result.name}`,
            entityType: 'competency_category',
            entityId: id,
            details: updates
        });

        return result;
    }

    /**
     * Delete (deactivate) a competency category (admin only)
     * @param {string} id - Category ID
     * @param {boolean} hardDelete - Permanently delete if no definitions exist
     */
    async deleteCategory(id, hardDelete = false) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const currentUser = this._requireAdmin();

        // Check if category has definitions
        const { data: definitions } = await supabase
            .from('competency_definitions')
            .select('id')
            .eq('category_id', id)
            .limit(1);

        const hasDefinitions = definitions && definitions.length > 0;

        if (hardDelete && !hasDefinitions) {
            // Hard delete only if no definitions
            const { error } = await supabase
                .from('competency_categories')
                .delete()
                .eq('id', id);

            if (error) throw error;

            logActivity({
                userId: currentUser.id,
                actionType: 'category_deleted',
                actionCategory: 'admin',
                description: 'Permanently deleted competency category',
                entityType: 'competency_category',
                entityId: id
            });
        } else {
            // Soft delete - deactivate
            await this.updateCategory(id, { is_active: false });
        }

        return { success: true, softDeleted: hasDefinitions || !hardDelete };
    }

    /**
     * Reorder categories (admin only)
     * @param {string[]} orderedIds - Array of category IDs in desired order
     */
    async reorderCategories(orderedIds) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        this._requireAdmin();

        // Update each category's display_order based on array position
        const updates = orderedIds.map((id, index) => ({
            id,
            display_order: index + 1
        }));

        for (const update of updates) {
            const { error } = await supabase
                .from('competency_categories')
                .update({ display_order: update.display_order })
                .eq('id', update.id);

            if (error) throw error;
        }

        return { success: true };
    }

    /**
     * Get all competency definitions (including inactive) for admin view
     * @param {boolean} includeInactive - Include inactive definitions
     * @param {string} categoryId - Optional category filter
     */
    async getAllDefinitions(includeInactive = true, categoryId = null) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        let query = supabase
            .from('competency_definitions')
            .select(`
                *,
                category:competency_categories(id, name)
            `)
            .order('display_order', { ascending: true });

        if (!includeInactive) {
            query = query.eq('is_active', true);
        }

        if (categoryId) {
            query = query.eq('category_id', categoryId);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data;
    }

    /**
     * Create a new competency definition (admin only)
     * @param {object} data - Definition data
     */
    async createDefinition(data) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const currentUser = this._requireAdmin();

        // Get max display_order within category
        const { data: existing } = await supabase
            .from('competency_definitions')
            .select('display_order')
            .eq('category_id', data.category_id)
            .order('display_order', { ascending: false })
            .limit(1);

        const maxOrder = existing?.[0]?.display_order ?? 0;

        const { data: result, error } = await supabase
            .from('competency_definitions')
            .insert({
                name: data.name,
                description: data.description || null,
                category_id: data.category_id,
                field_type: data.field_type || 'text',
                requires_document: data.requires_document || false,
                requires_approval: data.requires_approval || false,
                display_order: maxOrder + 1,
                is_active: true
            })
            .select(`
                *,
                category:competency_categories(id, name)
            `)
            .single();

        if (error) throw error;

        logActivity({
            userId: currentUser.id,
            actionType: 'definition_created',
            actionCategory: 'admin',
            description: `Created competency type: ${data.name}`,
            entityType: 'competency_definition',
            entityId: result.id,
            details: { name: data.name, category_id: data.category_id, field_type: data.field_type }
        });

        return result;
    }

    /**
     * Update a competency definition (admin only)
     * @param {string} id - Definition ID
     * @param {object} data - Fields to update
     */
    async updateDefinition(id, data) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const currentUser = this._requireAdmin();

        const updates = {};
        if (data.name !== undefined) updates.name = data.name;
        if (data.description !== undefined) updates.description = data.description;
        if (data.category_id !== undefined) updates.category_id = data.category_id;
        if (data.field_type !== undefined) updates.field_type = data.field_type;
        if (data.requires_document !== undefined) updates.requires_document = data.requires_document;
        if (data.requires_approval !== undefined) updates.requires_approval = data.requires_approval;
        if (data.is_active !== undefined) updates.is_active = data.is_active;

        const { data: result, error } = await supabase
            .from('competency_definitions')
            .update(updates)
            .eq('id', id)
            .select(`
                *,
                category:competency_categories(id, name)
            `)
            .single();

        if (error) throw error;

        logActivity({
            userId: currentUser.id,
            actionType: 'definition_updated',
            actionCategory: 'admin',
            description: `Updated competency type: ${result.name}`,
            entityType: 'competency_definition',
            entityId: id,
            details: updates
        });

        return result;
    }

    /**
     * Delete (deactivate) a competency definition (admin only)
     * @param {string} id - Definition ID
     * @param {boolean} hardDelete - Permanently delete if no employee records exist
     */
    async deleteDefinition(id, hardDelete = false) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const currentUser = this._requireAdmin();

        // Check if definition has employee competencies
        const { data: employeeCompetencies } = await supabase
            .from('employee_competencies')
            .select('id')
            .eq('competency_id', id)
            .limit(1);

        const hasEmployeeRecords = employeeCompetencies && employeeCompetencies.length > 0;

        if (hardDelete && !hasEmployeeRecords) {
            // Hard delete only if no employee records
            const { error } = await supabase
                .from('competency_definitions')
                .delete()
                .eq('id', id);

            if (error) throw error;

            logActivity({
                userId: currentUser.id,
                actionType: 'definition_deleted',
                actionCategory: 'admin',
                description: 'Permanently deleted competency type',
                entityType: 'competency_definition',
                entityId: id
            });
        } else {
            // Soft delete - deactivate
            await this.updateDefinition(id, { is_active: false });
        }

        return { success: true, softDeleted: hasEmployeeRecords || !hardDelete };
    }

    /**
     * Reorder definitions within a category (admin only)
     * @param {string} categoryId - Category ID
     * @param {string[]} orderedIds - Array of definition IDs in desired order
     */
    async reorderDefinitions(categoryId, orderedIds) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        this._requireAdmin();

        // Update each definition's display_order based on array position
        const updates = orderedIds.map((id, index) => ({
            id,
            display_order: index + 1
        }));

        for (const update of updates) {
            const { error } = await supabase
                .from('competency_definitions')
                .update({ display_order: update.display_order })
                .eq('id', update.id)
                .eq('category_id', categoryId);

            if (error) throw error;
        }

        return { success: true };
    }

    /**
     * Get usage count for a definition (how many employees have this cert)
     * @param {string} definitionId - Definition ID
     */
    async getDefinitionUsageCount(definitionId) {
        if (!isSupabaseConfigured()) {
            throw new Error('Supabase not configured');
        }

        const { count, error } = await supabase
            .from('employee_competencies')
            .select('*', { count: 'exact', head: true })
            .eq('competency_id', definitionId);

        if (error) throw error;
        return count || 0;
    }
}

export default new CompetencyService();
