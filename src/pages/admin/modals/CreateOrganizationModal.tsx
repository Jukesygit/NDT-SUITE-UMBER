/**
 * CreateOrganizationModal - Modal for creating new organizations
 *
 * Features:
 * - Organization name input with validation
 * - Client-side form validation
 * - API error handling
 * - Auto-close on success
 */

import { useState, FormEvent } from 'react';
import Modal from '../../../components/ui/Modal/Modal';
import FormField from '../../../components/ui/Form/FormField';
import { useCreateOrganization } from '../../../hooks/mutations/useOrganizationMutations';
import { RandomMatrixSpinner } from '../../../components/MatrixSpinners';

export interface CreateOrganizationModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface FormErrors {
    name?: string;
    api?: string;
}

/**
 * CreateOrganizationModal component
 */
export function CreateOrganizationModal({ isOpen, onClose }: CreateOrganizationModalProps) {
    // Mutation hook
    const createOrganization = useCreateOrganization();

    // Form state
    const [name, setName] = useState('');
    const [errors, setErrors] = useState<FormErrors>({});

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

        // Submit mutation
        try {
            const result = await createOrganization.mutateAsync(trimmedName);

            if (result.success) {
                // Reset form
                setName('');
                setErrors({});
                onClose();
            } else {
                setErrors({ api: result.error || 'Failed to create organization' });
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
        setName('');
        setErrors({});
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Create New Organization"
            size="small"
            footer={
                <>
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={createOrganization.isPending}
                        className="btn btn-secondary"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="create-organization-form"
                        disabled={createOrganization.isPending}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        {createOrganization.isPending && <RandomMatrixSpinner size={16} />}
                        {createOrganization.isPending ? 'Creating...' : 'Create Organization'}
                    </button>
                </>
            }
        >
            <form id="create-organization-form" onSubmit={handleSubmit}>
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

export default CreateOrganizationModal;
