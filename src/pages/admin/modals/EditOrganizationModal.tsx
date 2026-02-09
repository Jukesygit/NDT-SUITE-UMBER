/**
 * EditOrganizationModal - Modal for editing existing organizations
 *
 * Features:
 * - Organization name input with validation
 * - Pre-populated with current org name
 * - Client-side form validation
 * - API error handling
 * - Auto-close on success
 */

import { useState, useEffect, FormEvent } from 'react';
import Modal from '../../../components/ui/Modal/Modal';
import FormField from '../../../components/ui/Form/FormField';
import { useUpdateOrganization } from '../../../hooks/mutations/useOrganizationMutations';
import { RandomMatrixSpinner } from '../../../components/MatrixSpinners';
import type { OrganizationStats } from '../../../services/admin-service';

export interface EditOrganizationModalProps {
    isOpen: boolean;
    onClose: () => void;
    organization: OrganizationStats | null;
}

interface FormErrors {
    name?: string;
    api?: string;
}

/**
 * EditOrganizationModal component
 */
export function EditOrganizationModal({ isOpen, onClose, organization }: EditOrganizationModalProps) {
    // Mutation hook
    const updateOrganization = useUpdateOrganization();

    // Form state
    const [name, setName] = useState('');
    const [errors, setErrors] = useState<FormErrors>({});

    // Pre-populate form when organization changes
    useEffect(() => {
        if (organization) {
            setName(organization.organization.name);
            setErrors({});
        }
    }, [organization]);

    /**
     * Handle name field change
     */
    const handleNameChange = (value: string) => {
        setName(value);
        // Clear error when user starts typing
        if (errors.name || errors.api) {
            setErrors({});
        }
    };

    /**
     * Handle form submission
     */
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        if (!organization) return;

        // Validate name
        const trimmedName = name.trim();
        if (!trimmedName) {
            setErrors({ name: 'Organization name is required' });
            return;
        }

        if (trimmedName.length < 2) {
            setErrors({ name: 'Organization name must be at least 2 characters' });
            return;
        }

        // Don't submit if name hasn't changed
        if (trimmedName === organization.organization.name) {
            onClose();
            return;
        }

        // Submit mutation
        try {
            const result = await updateOrganization.mutateAsync({
                id: organization.organization.id,
                name: trimmedName,
            });

            if (result.success) {
                setErrors({});
                onClose();
            } else {
                setErrors({ api: result.error || 'Failed to update organization' });
            }
        } catch (error: unknown) {
            setErrors({ api: error instanceof Error ? error.message : 'An unexpected error occurred' });
        }
    };

    /**
     * Handle modal close
     */
    const handleClose = () => {
        // Reset form to original values when closing
        if (organization) {
            setName(organization.organization.name);
        }
        setErrors({});
        onClose();
    };

    if (!organization) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Edit Organization"
            size="small"
            footer={
                <>
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={updateOrganization.isPending}
                        className="btn btn-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="edit-organization-form"
                        disabled={updateOrganization.isPending}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        {updateOrganization.isPending && <RandomMatrixSpinner size={16} />}
                        {updateOrganization.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                </>
            }
        >
            <form id="edit-organization-form" onSubmit={handleSubmit}>
                {/* API Error Message */}
                {errors.api && (
                    <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/50">
                        <p className="text-sm text-red-400">{errors.api}</p>
                    </div>
                )}

                {/* Organization Name */}
                <FormField
                    label="Organization Name"
                    type="text"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    error={errors.name}
                    required
                    placeholder="Enter organization name"
                    autoComplete="off"
                    autoFocus
                />
            </form>
        </Modal>
    );
}

export default EditOrganizationModal;
