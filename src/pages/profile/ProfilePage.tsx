/**
 * ProfilePage - User profile page using React Query
 *
 * This is the modernized version of ProfilePageNew.jsx
 * Uses React Query for data fetching and extracted components
 */

import { useState, useEffect, useCallback } from 'react';
import './profile.css';

// React Query hooks
import { useProfile } from '../../hooks/queries/useProfile';
import { useCompetencies, useCompetencyDefinitions, useCompetencyCategories } from '../../hooks/queries/useCompetencies';
import { useUpdateProfile, useUploadAvatar, useCreateCompetency, useUpdateCompetency, useDeleteCompetency, useUploadCompetencyDocument, useExportMyData, useDeleteMyAccount } from '../../hooks/mutations';

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

    // GDPR mutations
    const exportMyData = useExportMyData();
    const deleteMyAccount = useDeleteMyAccount();

    // Delete account confirmation state
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

    // Handle avatar upload
    const handleAvatarUpload = useCallback(
        (file: File) => {
            if (!user?.id) return;
            uploadAvatarMutation.mutate(
                { userId: user.id, file },
                {
                    onError: (error) => {
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
            // Use mutateAsync instead of wrapping mutate in a Promise
            // This avoids stale callback issues when the component re-renders during upload
            return uploadDocumentMutation.mutateAsync({
                userId: user.id,
                competencyName: editingCompetency.definition?.name || 'certificate',
                file,
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
                    onError: () => {
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
                        onError: () => {
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
                        onError: () => {
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
                    onError: () => {
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
        vantage_number: profileQuery.data?.vantage_number || '',
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
            {/* Content */}
            <div className="flex-1 overflow-y-auto glass-scrollbar" style={{ padding: '32px 40px' }}>
                <div style={{ maxWidth: '960px', margin: '0 auto' }}>
                    {/* Custom Header */}
                    <div className="pf-header">
                        <div className="pf-header-left">
                            <div className="pf-logo">
                                <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            </div>
                            <div className="pf-header-text">
                                <h1>Profile Settings</h1>
                                <p>Manage your profile, competencies, and personal information</p>
                            </div>
                        </div>
                    </div>

                    {/* Profile Card with Avatar + Personal Details */}
                    <div className="pf-content-card" style={{ marginBottom: '20px' }}>
                        <ProfileAvatar
                            avatarUrl={profileQuery.data?.avatar_url ?? undefined}
                            username={user?.username || ''}
                            email={user?.email || ''}
                            isUploading={uploadAvatarMutation.isPending}
                            onUpload={handleAvatarUpload}
                        />

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

                    {/* Privacy & Data Section - GDPR Articles 15, 17, 20 */}
                    <div className="pf-content-card" style={{ marginTop: '20px' }}>
                        <div className="pf-section-header">
                            <h2 className="pf-section-title">Privacy & Data</h2>
                        </div>
                        <p style={{ color: 'var(--text-secondary, #9ca3af)', fontSize: '14px', marginBottom: '16px', lineHeight: '1.5' }}>
                            Manage your personal data in accordance with UK GDPR.
                            You can download a copy of all your data or permanently delete your account.
                        </p>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button
                                className="pf-btn"
                                onClick={() => user?.id && exportMyData.mutate(user.id)}
                                disabled={exportMyData.isPending}
                            >
                                {exportMyData.isPending ? 'Exporting...' : 'Download My Data'}
                            </button>
                            <button
                                className="pf-btn"
                                style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                                onClick={() => setShowDeleteConfirm(true)}
                            >
                                Delete My Account
                            </button>
                            <a
                                href="/privacy"
                                style={{ color: 'var(--text-tertiary, #6b7280)', fontSize: '13px', textDecoration: 'underline' }}
                            >
                                Privacy Policy
                            </a>
                        </div>
                        {exportMyData.isSuccess && (
                            <p style={{ color: '#10b981', fontSize: '13px', marginTop: '12px' }}>
                                Your data has been downloaded.
                            </p>
                        )}
                        {exportMyData.isError && (
                            <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '12px' }}>
                                Failed to export data. Please try again.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Delete Account Confirmation Modal */}
            <Modal
                isOpen={showDeleteConfirm}
                onClose={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                title="Delete Your Account"
                size="medium"
            >
                <div style={{ color: 'var(--text-secondary, #d1d5db)', lineHeight: '1.6' }}>
                    <p style={{ marginBottom: '16px', fontWeight: '600', color: '#ef4444' }}>
                        This action is permanent and cannot be undone.
                    </p>
                    <p style={{ marginBottom: '12px' }}>Deleting your account will:</p>
                    <ul style={{ paddingLeft: '20px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px' }}>
                        <li>Remove your profile and all personal information</li>
                        <li>Delete all your competency records and certificates</li>
                        <li>Remove your uploaded documents</li>
                        <li>Anonymise your activity history (for audit compliance)</li>
                    </ul>
                    <p style={{ marginBottom: '8px', fontSize: '14px' }}>
                        We recommend downloading your data first. Type <strong>DELETE</strong> to confirm:
                    </p>
                    <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="Type DELETE"
                        autoComplete="off"
                        style={{
                            width: '100%',
                            padding: '10px 14px',
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '8px',
                            color: 'var(--text-primary, #fff)',
                            fontSize: '14px',
                            marginBottom: '20px',
                        }}
                    />
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        <button
                            className="pf-btn"
                            onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                            disabled={deleteMyAccount.isPending}
                        >
                            Cancel
                        </button>
                        <button
                            className="pf-btn"
                            style={{
                                backgroundColor: deleteConfirmText === 'DELETE' ? '#ef4444' : 'rgba(239, 68, 68, 0.2)',
                                color: '#fff',
                                borderColor: 'rgba(239, 68, 68, 0.5)',
                            }}
                            disabled={deleteConfirmText !== 'DELETE' || deleteMyAccount.isPending}
                            onClick={() => user?.id && deleteMyAccount.mutate(user.id)}
                        >
                            {deleteMyAccount.isPending ? 'Deleting...' : 'Delete My Account'}
                        </button>
                    </div>
                    {deleteMyAccount.isError && (
                        <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '12px', textAlign: 'center' }}>
                            {deleteMyAccount.error instanceof Error ? deleteMyAccount.error.message : 'Failed to delete account. Please try again.'}
                        </p>
                    )}
                </div>
            </Modal>

            {/* Competency Type Picker Modal */}
            <Modal
                isOpen={showCompetencyPicker}
                onClose={() => setShowCompetencyPicker(false)}
                title="Add Certification"
                size="large"
            >
                {/* Search */}
                <div className="pf-search" style={{ marginBottom: '16px' }}>
                    <svg viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input
                        type="text"
                        placeholder="Search certifications..."
                        value={pickerSearchTerm}
                        onChange={(e) => setPickerSearchTerm(e.target.value)}
                    />
                </div>

                {/* Category Filter */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setPickerCategory('all')}
                        className={`pf-filter-chip${pickerCategory === 'all' ? ' active' : ''}`}
                    >
                        All
                    </button>
                    {(categoriesQuery.data || [])
                        .filter((cat: { name: string }) => !cat.name.toLowerCase().includes('personal details'))
                        .map((cat: { id: string; name: string }) => (
                            <button
                                key={cat.id}
                                onClick={() => setPickerCategory(cat.id)}
                                className={`pf-filter-chip${pickerCategory === cat.id ? ' active' : ''}`}
                            >
                                {cat.name}
                            </button>
                        ))}
                </div>

                {/* Competency List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }} className="glass-scrollbar">
                    {((definitionsQuery.data as CompetencyDefinition[]) || [])
                        .filter((def) => {
                            const categoryName = typeof def.category === 'object' ? def.category?.name : def.category;
                            if (categoryName?.toLowerCase().includes('personal details')) return false;

                            if (pickerCategory !== 'all') {
                                const defCategoryId = typeof def.category === 'object' ? def.category?.id : null;
                                if (defCategoryId !== pickerCategory) return false;
                            }

                            if (pickerSearchTerm) {
                                const search = pickerSearchTerm.toLowerCase();
                                if (!def.name.toLowerCase().includes(search)) return false;
                            }

                            return true;
                        })
                        .map((def) => (
                            <div
                                key={def.id}
                                className="pf-picker-item"
                                onClick={() => handleSelectCompetencyType(def)}
                            >
                                <div>
                                    <div className="pf-picker-name">{def.name}</div>
                                    {def.description && (
                                        <div className="pf-picker-desc">{def.description}</div>
                                    )}
                                </div>
                                <svg className="pf-picker-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
