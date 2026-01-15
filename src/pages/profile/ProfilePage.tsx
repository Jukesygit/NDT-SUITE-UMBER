/**
 * ProfilePage - User profile page using React Query
 *
 * This is the modernized version of ProfilePageNew.jsx
 * Uses React Query for data fetching and extracted components
 */

import { useState, useEffect, useCallback } from 'react';
import { createModernHeader } from '../../components/modern-header.js';

// React Query hooks
import { useProfile } from '../../hooks/queries/useProfile';
import { useCompetencies, useCompetencyDefinitions, useCompetencyCategories } from '../../hooks/queries/useCompetencies';
import { useUpdateProfile, useUploadAvatar, useCreateCompetency, useUpdateCompetency, useDeleteCompetency, useUploadCompetencyDocument } from '../../hooks/mutations';

// Components
import { PageSpinner, ErrorDisplay, Modal } from '../../components/ui';
import { ProfileAvatar } from './ProfileAvatar';
import { ProfilePersonalDetails, ProfileFormData } from './ProfilePersonalDetails';
import { CompetenciesSection } from './CompetenciesSection';
import { EditCompetencyModal, CompetencyFormData } from './EditCompetencyModal';
import type { Competency, CompetencyDefinition } from './CompetencyCard';

// Auth - ES module import
import authManager from '../../auth-manager.js';

/**
 * ProfilePage component
 */
export default function ProfilePage() {
    // Get current user from auth manager
    const [user, setUser] = useState<{ id: string; username: string; email: string } | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);

    // Initialize user on mount
    useEffect(() => {
        const currentUser = authManager.getCurrentUser();
        if (!currentUser) {
            window.location.href = '/login';
            return;
        }
        setUser(currentUser);
        setIsInitialized(true);
    }, []);

    // Profile editing state
    const [isEditingProfile, setIsEditingProfile] = useState(false);

    // Competency picker modal state
    const [showCompetencyPicker, setShowCompetencyPicker] = useState(false);
    const [pickerSearchTerm, setPickerSearchTerm] = useState('');
    const [pickerCategory, setPickerCategory] = useState('all');

    // Competency editing state
    const [editingCompetency, setEditingCompetency] = useState<{
        competency?: Competency;
        definition?: CompetencyDefinition;
        isNew: boolean;
    } | null>(null);

    // React Query hooks - only enabled when user is loaded (hooks handle enabled internally)
    const profileQuery = useProfile(user?.id);
    const competenciesQuery = useCompetencies(user?.id);
    const definitionsQuery = useCompetencyDefinitions();
    const categoriesQuery = useCompetencyCategories();

    // Mutations
    const updateProfileMutation = useUpdateProfile();
    const uploadAvatarMutation = useUploadAvatar();
    const createCompetencyMutation = useCreateCompetency();
    const updateCompetencyMutation = useUpdateCompetency();
    const deleteCompetencyMutation = useDeleteCompetency();
    const uploadDocumentMutation = useUploadCompetencyDocument();

    // Header setup
    useEffect(() => {
        const container = document.getElementById('profile-header');
        if (container && container.children.length === 0) {
            const header = createModernHeader(
                'Profile Settings',
                'Manage your profile, competencies, and personal information',
                {
                    showParticles: true,
                    particleCount: 20,
                    gradientColors: ['#34d399', '#60a5fa'],
                    height: '100px',
                    showLogo: false,
                }
            );
            container.appendChild(header);
        }
    }, []);

    // Handle avatar upload
    const handleAvatarUpload = useCallback(
        (file: File) => {
            if (!user?.id) return;
            uploadAvatarMutation.mutate(
                { userId: user.id, file },
                {
                    onError: (error) => {
                        console.error('Avatar upload failed:', error);
                        alert(error instanceof Error ? error.message : 'Failed to upload avatar. Please try again.');
                    },
                }
            );
        },
        [user?.id, uploadAvatarMutation]
    );

    // Handle document upload for competencies
    const handleDocumentUpload = useCallback(
        async (file: File): Promise<{ url: string; name: string }> => {
            if (!user?.id || !editingCompetency?.definition?.name) {
                throw new Error('User or competency not available');
            }
            return new Promise((resolve, reject) => {
                uploadDocumentMutation.mutate(
                    {
                        userId: user.id,
                        competencyName: editingCompetency.definition?.name || 'certificate',
                        file,
                    },
                    {
                        onSuccess: (result) => resolve(result),
                        onError: (error) => reject(error),
                    }
                );
            });
        },
        [user?.id, editingCompetency?.definition?.name, uploadDocumentMutation]
    );

    // Handle profile save
    const handleProfileSave = useCallback(
        (data: ProfileFormData) => {
            if (!user?.id) return;

            // Filter out fields that shouldn't be sent to the profiles table
            // email and username are read-only (email is in auth.users, username is set separately)
            const profileUpdateData = {
                mobile_number: data.mobile_number,
                email_address: data.email_address,
                home_address: data.home_address,
                nearest_uk_train_station: data.nearest_uk_train_station,
                next_of_kin: data.next_of_kin,
                next_of_kin_emergency_contact_number: data.next_of_kin_emergency_contact_number,
                date_of_birth: data.date_of_birth || undefined,
            };

            updateProfileMutation.mutate(
                { userId: user.id, data: profileUpdateData },
                {
                    onSuccess: () => {
                        setIsEditingProfile(false);
                    },
                    onError: (error) => {
                        console.error('Failed to update profile:', error);
                    },
                }
            );
        },
        [user?.id, updateProfileMutation]
    );

    // Handle add competency - show picker
    const handleAddCompetency = useCallback(() => {
        setPickerSearchTerm('');
        setPickerCategory('all');
        setShowCompetencyPicker(true);
    }, []);

    // Handle selecting a competency type from picker
    const handleSelectCompetencyType = useCallback((definition: CompetencyDefinition) => {
        setShowCompetencyPicker(false);
        setEditingCompetency({ definition, isNew: true });
    }, []);

    // Handle edit competency
    const handleEditCompetency = useCallback(
        (competency: Competency) => {
            const definition = definitionsQuery.data?.find(
                (d: CompetencyDefinition) => d.id === competency.competency_id
            );
            setEditingCompetency({ competency, definition, isNew: false });
        },
        [definitionsQuery.data]
    );

    // Handle save competency
    const handleSaveCompetency = useCallback(
        (data: CompetencyFormData) => {
            if (!user?.id) return;

            if (editingCompetency?.isNew) {
                createCompetencyMutation.mutate(
                    { userId: user.id, data },
                    {
                        onSuccess: () => {
                            setEditingCompetency(null);
                        },
                        onError: (error) => {
                            console.error('Failed to create competency:', error);
                            alert('Failed to save competency. Please try again.');
                        },
                    }
                );
            } else if (editingCompetency?.competency) {
                updateCompetencyMutation.mutate(
                    {
                        competencyId: data.competency_id || editingCompetency.competency.competency_id,
                        userId: user.id,
                        data,
                    },
                    {
                        onSuccess: () => {
                            setEditingCompetency(null);
                        },
                        onError: (error) => {
                            console.error('Failed to update competency:', error);
                            alert('Failed to save competency. Please try again.');
                        },
                    }
                );
            }
        },
        [user?.id, editingCompetency, createCompetencyMutation, updateCompetencyMutation]
    );

    // Handle delete competency
    const handleDeleteCompetency = useCallback(
        (competency: Competency) => {
            if (!user?.id) return;
            // Find the definition name for the confirm message
            const definition = definitionsQuery.data?.find(
                (d: CompetencyDefinition) => d.id === competency.competency_id
            );
            const name = definition?.name || 'this certification';
            if (!window.confirm(`Are you sure you want to delete "${name}"?`)) {
                return;
            }
            deleteCompetencyMutation.mutate(
                { competencyId: competency.id, userId: user.id },
                {
                    onError: (error) => {
                        console.error('Failed to delete competency:', error);
                        alert('Failed to delete competency. Please try again.');
                    },
                }
            );
        },
        [user?.id, deleteCompetencyMutation, definitionsQuery.data]
    );

    // Build profile form data
    const profileFormData: ProfileFormData = {
        username: user?.username || '',
        email: user?.email || '',
        mobile_number: profileQuery.data?.mobile_number || '',
        email_address: profileQuery.data?.email_address || user?.email || '',
        home_address: profileQuery.data?.home_address || '',
        nearest_uk_train_station: profileQuery.data?.nearest_uk_train_station || '',
        next_of_kin: profileQuery.data?.next_of_kin || '',
        next_of_kin_emergency_contact_number: profileQuery.data?.next_of_kin_emergency_contact_number || '',
        date_of_birth: profileQuery.data?.date_of_birth || '',
    };

    // Loading state
    if (!isInitialized || profileQuery.isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <PageSpinner message="Loading profile..." />
            </div>
        );
    }

    // Error state
    if (profileQuery.error) {
        return (
            <div className="h-full flex items-center justify-center p-6">
                <ErrorDisplay
                    error={profileQuery.error}
                    title="Failed to load profile"
                    onRetry={() => profileQuery.refetch()}
                />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div id="profile-header" style={{ flexShrink: 0 }} />

            {/* Content */}
            <div className="flex-1 overflow-y-auto glass-scrollbar p-6">
                <div className="max-w-4xl mx-auto space-y-6">
                    {/* Profile Card with Avatar */}
                    <div className="glass-card" style={{ padding: '24px' }}>
                        <ProfileAvatar
                            avatarUrl={profileQuery.data?.avatar_url ?? undefined}
                            username={user?.username || ''}
                            email={user?.email || ''}
                            isUploading={uploadAvatarMutation.isPending}
                            onUpload={handleAvatarUpload}
                        />

                        {/* Personal Details (inline in same card) */}
                        <ProfilePersonalDetails
                            data={profileFormData}
                            isEditing={isEditingProfile}
                            isSaving={updateProfileMutation.isPending}
                            onEditToggle={() => setIsEditingProfile(!isEditingProfile)}
                            onSave={handleProfileSave}
                            onCancel={() => setIsEditingProfile(false)}
                        />
                    </div>

                    {/* Competencies Section */}
                    <CompetenciesSection
                        competencies={(competenciesQuery.data as Competency[]) || []}
                        definitions={(definitionsQuery.data as CompetencyDefinition[]) || []}
                        categories={categoriesQuery.data || []}
                        isLoading={competenciesQuery.isLoading}
                        onAdd={handleAddCompetency}
                        onEdit={handleEditCompetency}
                        onDelete={handleDeleteCompetency}
                    />
                </div>
            </div>

            {/* Competency Type Picker Modal */}
            <Modal
                isOpen={showCompetencyPicker}
                onClose={() => setShowCompetencyPicker(false)}
                title="Add Certification"
                size="large"
            >
                {/* Search */}
                <div style={{ marginBottom: '16px' }}>
                    <input
                        type="text"
                        className="glass-input"
                        placeholder="Search certifications..."
                        value={pickerSearchTerm}
                        onChange={(e) => setPickerSearchTerm(e.target.value)}
                        style={{ width: '100%' }}
                    />
                </div>

                {/* Category Filter */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setPickerCategory('all')}
                        className={pickerCategory === 'all' ? 'btn btn--primary btn--sm' : 'btn btn--secondary btn--sm'}
                    >
                        All
                    </button>
                    {(categoriesQuery.data || [])
                        .filter((cat: { name: string }) => !cat.name.toLowerCase().includes('personal details'))
                        .map((cat: { id: string; name: string }) => (
                            <button
                                key={cat.id}
                                onClick={() => setPickerCategory(cat.id)}
                                className={pickerCategory === cat.id ? 'btn btn--primary btn--sm' : 'btn btn--secondary btn--sm'}
                            >
                                {cat.name}
                            </button>
                        ))}
                </div>

                {/* Competency List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }} className="glass-scrollbar">
                    {((definitionsQuery.data as CompetencyDefinition[]) || [])
                        .filter((def) => {
                            // Filter out personal details
                            const categoryName = typeof def.category === 'object' ? def.category?.name : def.category;
                            if (categoryName?.toLowerCase().includes('personal details')) return false;

                            // Category filter
                            if (pickerCategory !== 'all') {
                                const defCategoryId = typeof def.category === 'object' ? def.category?.id : null;
                                if (defCategoryId !== pickerCategory) return false;
                            }

                            // Search filter
                            if (pickerSearchTerm) {
                                const search = pickerSearchTerm.toLowerCase();
                                if (!def.name.toLowerCase().includes(search)) return false;
                            }

                            return true;
                        })
                        .map((def) => (
                            <div
                                key={def.id}
                                onClick={() => handleSelectCompetencyType(def)}
                                style={{
                                    padding: '14px 16px',
                                    background: 'rgba(255, 255, 255, 0.03)',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255, 255, 255, 0.1)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                                    e.currentTarget.style.borderColor = 'var(--accent-primary)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                                }}
                            >
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: '500', color: '#ffffff', marginBottom: '2px' }}>
                                        {def.name}
                                    </div>
                                    {def.description && (
                                        <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                            {def.description}
                                        </div>
                                    )}
                                </div>
                                <svg style={{ width: '18px', height: '18px', color: 'var(--accent-primary)', flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                </svg>
                            </div>
                        ))}
                </div>
            </Modal>

            {/* Edit Competency Modal */}
            {editingCompetency && (
                <EditCompetencyModal
                    isOpen={!!editingCompetency}
                    onClose={() => setEditingCompetency(null)}
                    onSave={handleSaveCompetency}
                    onDelete={editingCompetency.competency ? () => {
                        handleDeleteCompetency(editingCompetency.competency!);
                        setEditingCompetency(null);
                    } : undefined}
                    isNew={editingCompetency.isNew}
                    initialData={editingCompetency.competency}
                    definition={editingCompetency.definition}
                    isSaving={createCompetencyMutation.isPending || updateCompetencyMutation.isPending}
                    isDeleting={deleteCompetencyMutation.isPending}
                    onDocumentUpload={handleDocumentUpload}
                    isUploadingDocument={uploadDocumentMutation.isPending}
                />
            )}
        </div>
    );
}
