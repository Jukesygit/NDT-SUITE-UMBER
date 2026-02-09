/**
 * CreateUserModal - Modal for creating new users
 *
 * Features:
 * - Username, email, password input with validation
 * - Organization selection
 * - Role selection
 * - Client-side form validation
 * - API error handling
 */

import { useState, FormEvent } from 'react';
import Modal from '../../../components/ui/Modal/Modal';
import FormField from '../../../components/ui/Form/FormField';
import FormSelect from '../../../components/ui/Form/FormSelect';
import { RandomMatrixSpinner } from '../../../components/MatrixSpinners';
import { useCreateUser } from '../../../hooks/mutations/useUserMutations';
import { useOrganizations } from '../../../hooks/queries/useAdminOrganizations';
import type { UserRole as AdminUserRole } from '../../../types/admin';

export interface CreateUserModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface FormData {
    username: string;
    email: string;
    password: string;
    organizationId: string;
    role: AdminUserRole;
}

interface FormErrors {
    username?: string;
    email?: string;
    password?: string;
    organizationId?: string;
    role?: string;
    api?: string;
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validate form data
 */
function validateForm(data: FormData): FormErrors {
    const errors: FormErrors = {};

    // Username validation
    if (!data.username.trim()) {
        errors.username = 'Username is required';
    } else if (data.username.length < 3) {
        errors.username = 'Username must be at least 3 characters';
    }

    // Email validation
    if (!data.email.trim()) {
        errors.email = 'Email is required';
    } else if (!isValidEmail(data.email)) {
        errors.email = 'Please enter a valid email address';
    }

    // Password validation
    if (!data.password) {
        errors.password = 'Password is required';
    } else if (data.password.length < 8) {
        errors.password = 'Password must be at least 8 characters';
    }

    // Organization validation
    if (!data.organizationId) {
        errors.organizationId = 'Organization is required';
    }

    // Role validation
    if (!data.role) {
        errors.role = 'Role is required';
    }

    return errors;
}

/**
 * CreateUserModal component
 */
export function CreateUserModal({ isOpen, onClose }: CreateUserModalProps) {
    // Query hooks
    const { data: organizations = [], isLoading: isLoadingOrgs } = useOrganizations();
    const createUser = useCreateUser();

    // Form state
    const [formData, setFormData] = useState<FormData>({
        username: '',
        email: '',
        password: '',
        organizationId: '',
        role: 'viewer',
    });

    const [errors, setErrors] = useState<FormErrors>({});

    /**
     * Handle form field changes
     */
    const handleChange = (field: keyof FormData, value: string | AdminUserRole) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        // Clear error for this field when user starts typing
        if (errors[field]) {
            setErrors((prev) => {
                const newErrors = { ...prev };
                delete newErrors[field];
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
        const validationErrors = validateForm(formData);
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            return;
        }

        // Submit mutation
        try {
            const result = await createUser.mutateAsync({
                username: formData.username.trim(),
                email: formData.email.trim(),
                password: formData.password,
                role: formData.role as any, // Type coercion needed due to enum vs string union
                organizationId: formData.organizationId,
            });

            if (result.success) {
                // Reset form
                setFormData({
                    username: '',
                    email: '',
                    password: '',
                    organizationId: '',
                    role: 'viewer',
                });
                setErrors({});
                onClose();
            } else {
                setErrors({ api: result.error || 'Failed to create user' });
            }
        } catch (error: unknown) {
            setErrors({ api: error instanceof Error ? error.message : 'An unexpected error occurred' });
        }
    };

    /**
     * Handle modal close
     */
    const handleClose = () => {
        // Reset form when closing
        setFormData({
            username: '',
            email: '',
            password: '',
            organizationId: '',
            role: 'viewer',
        });
        setErrors({});
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Create New User"
            size="medium"
            footer={
                <>
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={createUser.isPending}
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
                        form="create-user-form"
                        disabled={createUser.isPending}
                        className="
                            px-4 py-2 rounded-lg
                            bg-blue-600 hover:bg-blue-700
                            text-white font-medium
                            transition-colors
                            disabled:opacity-50 disabled:cursor-not-allowed
                            flex items-center gap-2
                        "
                    >
                        {createUser.isPending && <RandomMatrixSpinner size={16} />}
                        {createUser.isPending ? 'Creating...' : 'Create User'}
                    </button>
                </>
            }
        >
            <form id="create-user-form" onSubmit={handleSubmit}>
                {/* API Error Message */}
                {errors.api && (
                    <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/50">
                        <p className="text-sm text-red-400">{errors.api}</p>
                    </div>
                )}

                {/* Username */}
                <FormField
                    label="Username"
                    type="text"
                    value={formData.username}
                    onChange={(e) => handleChange('username', e.target.value)}
                    error={errors.username}
                    required
                    placeholder="Enter username"
                    autoComplete="off"
                />

                {/* Email */}
                <FormField
                    label="Email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    error={errors.email}
                    required
                    placeholder="user@example.com"
                    autoComplete="off"
                />

                {/* Password */}
                <FormField
                    label="Password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => handleChange('password', e.target.value)}
                    error={errors.password}
                    required
                    placeholder="Minimum 8 characters"
                    helperText="Password must be at least 8 characters long"
                    autoComplete="new-password"
                />

                {/* Organization */}
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

                {/* Role */}
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
            </form>
        </Modal>
    );
}

export default CreateUserModal;
