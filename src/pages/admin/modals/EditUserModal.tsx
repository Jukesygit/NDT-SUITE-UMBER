/**
 * EditUserModal - Modal for editing existing user's role, organization, and status
 *
 * Features:
 * - Role selection
 * - Organization reassignment
 * - Active status toggle
 * - Display read-only user information
 * - Pre-populated with current values
 * - API error handling
 */

import { useState, useEffect, FormEvent } from 'react';
import Modal from '../../../components/ui/Modal/Modal';
import FormSelect from '../../../components/ui/Form/FormSelect';
import FormCheckbox from '../../../components/ui/Form/FormCheckbox';
import { RandomMatrixSpinner } from '../../../components/MatrixSpinners';
import { useUpdateUser } from '../../../hooks/mutations/useUserMutations';
import { useOrganizations } from '../../../hooks/queries/useAdminOrganizations';
import type { AdminUser, UserRole as AdminUserRole } from '../../../types/admin';

export interface EditUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: AdminUser;
}

interface FormData {
    role: AdminUserRole;
    organizationId: string;
    isActive: boolean;
}

interface FormErrors {
    role?: string;
    organizationId?: string;
    api?: string;
}

/**
 * EditUserModal component
 */
export function EditUserModal({ isOpen, onClose, user }: EditUserModalProps) {
    // Query hooks
    const { data: organizations = [], isLoading: isLoadingOrgs } = useOrganizations();

    // Mutation hook
    const updateUser = useUpdateUser();

    // Form state
    const [formData, setFormData] = useState<FormData>({
        role: user.role,
        organizationId: user.organization_id || '',
        isActive: user.is_active,
    });

    const [errors, setErrors] = useState<FormErrors>({});

    // Pre-populate form when user changes
    useEffect(() => {
        if (user) {
            setFormData({
                role: user.role,
                organizationId: user.organization_id || '',
                isActive: user.is_active,
            });
            setErrors({});
        }
    }, [user]);

    /**
     * Handle form field changes
     */
    const handleChange = (field: keyof FormData, value: AdminUserRole | boolean | string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        // Clear error for this field
        if (errors[field as keyof FormErrors]) {
            setErrors((prev) => {
                const newErrors = { ...prev };
                delete newErrors[field as keyof FormErrors];
                return newErrors;
            });
        }
    };

    /**
     * Handle form submission
     */
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        // Clear previous API errors
        setErrors((prev) => {
            const { api, ...rest } = prev;
            return rest;
        });

        // Validate form
        const validationErrors: FormErrors = {};
        if (!formData.role) {
            validationErrors.role = 'Role is required';
        }
        if (!formData.organizationId) {
            validationErrors.organizationId = 'Organization is required';
        }
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            return;
        }

        // Submit mutation
        try {
            const result = await updateUser.mutateAsync({
                id: user.id,
                data: {
                    role: formData.role as any, // Type coercion needed due to enum vs string union
                    organizationId: formData.organizationId,
                    isActive: formData.isActive,
                },
            });

            if (result.success) {
                onClose();
            } else {
                setErrors({ api: result.error || 'Failed to update user' });
            }
        } catch (error: unknown) {
            setErrors({ api: error instanceof Error ? error.message : 'An unexpected error occurred' });
        }
    };

    /**
     * Handle modal close
     */
    const handleClose = () => {
        // Reset to original values
        setFormData({
            role: user.role,
            organizationId: user.organization_id || '',
            isActive: user.is_active,
        });
        setErrors({});
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Edit User"
            size="medium"
            footer={
                <>
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={updateUser.isPending}
                        className="
                            px-4 py-2 rounded-lg
                            bg-white/5 hover:bg-white/10
                            border border-white/10
                            text-white/80
                            transition-colors
                            disabled:opacity-50 disabled:cursor-not-allowed
                        "
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="edit-user-form"
                        disabled={updateUser.isPending}
                        className="
                            px-4 py-2 rounded-lg
                            bg-blue-600 hover:bg-blue-700
                            text-white font-medium
                            transition-colors
                            disabled:opacity-50 disabled:cursor-not-allowed
                            flex items-center gap-2
                        "
                    >
                        {updateUser.isPending && <RandomMatrixSpinner size={16} />}
                        {updateUser.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                </>
            }
        >
            <form id="edit-user-form" onSubmit={handleSubmit}>
                {/* API Error Message */}
                {errors.api && (
                    <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/50">
                        <p className="text-sm text-red-400">{errors.api}</p>
                    </div>
                )}

                {/* Read-only User Information */}
                <div className="mb-6 p-4 rounded-lg bg-white/5 border border-white/10">
                    <h3 className="text-sm font-medium text-white/60 mb-3">User Information</h3>

                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span className="text-sm text-white/40">Username:</span>
                            <span className="text-sm text-white font-medium">{user.username}</span>
                        </div>

                        <div className="flex justify-between">
                            <span className="text-sm text-white/40">Email:</span>
                            <span className="text-sm text-white font-medium">{user.email}</span>
                        </div>
                    </div>
                </div>

                {/* Organization Selection */}
                <FormSelect
                    label="Organization"
                    value={formData.organizationId}
                    onChange={(e) => handleChange('organizationId', e.target.value)}
                    error={errors.organizationId}
                    required
                    placeholder="Select an organization"
                    disabled={isLoadingOrgs}
                    options={organizations.map((org) => ({
                        value: org.id,
                        label: org.name,
                    }))}
                />

                {/* Role Selection */}
                <FormSelect
                    label="Role"
                    value={formData.role}
                    onChange={(e) => handleChange('role', e.target.value as AdminUserRole)}
                    error={errors.role}
                    required
                    options={[
                        { value: 'viewer', label: 'Viewer - Read-only access (Data Hub, Tools, Profile)' },
                        { value: 'editor', label: 'Editor - Can create and edit (Data Hub, Tools, Profile)' },
                        { value: 'org_admin', label: 'Org Admin - Manage organization (Data Hub, Tools, Profile)' },
                        { value: 'manager', label: 'Manager - Full access except Admin tools' },
                        { value: 'admin', label: 'Admin - Full system access' },
                    ]}
                />

                {/* Active Status */}
                <FormCheckbox
                    label="Active User"
                    checked={formData.isActive}
                    onChange={(e) => handleChange('isActive', e.target.checked)}
                    helperText="Inactive users cannot log in to the system"
                />
            </form>
        </Modal>
    );
}

export default EditUserModal;
