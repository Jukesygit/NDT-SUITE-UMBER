/**
 * ProfilePage - User profile page using React Query
 * Industrial instrument theme: chassis > panel > wells
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

// 2FA
import { useTwoFactorStatus } from '../../hooks/queries/useTwoFactor';
import { TwoFactorSetupWizard } from '../../components/two-factor/TwoFactorSetupWizard';

export default function ProfilePage() {
    const [user, setUser] = useState<{ id: string; username: string | null; email: string | null; role?: string; organizationId?: string | null; isActive?: boolean } | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => {
        const currentUser = authManager.getCurrentUser();
        if (!currentUser) {
            window.location.href = '/login';
            return;
        }
        setUser(currentUser);
        setIsInitialized(true);
    }, []);

    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [showCompetencyPicker, setShowCompetencyPicker] = useState(false);
    const [pickerSearchTerm, setPickerSearchTerm] = useState('');
    const [pickerCategory, setPickerCategory] = useState('all');
    const [editingCompetency, setEditingCompetency] = useState<{
        competency?: Competency;
        definition?: CompetencyDefinition;
        isNew: boolean;
    } | null>(null);

    const [show2FASetup, setShow2FASetup] = useState(false);
    const [isDisabling2FA, setIsDisabling2FA] = useState(false);
    const twoFactorStatus = useTwoFactorStatus();

    const handleDisable2FA = async () => {
        if (!twoFactorStatus.data?.factorId) return;
        if (!window.confirm('Are you sure you want to disable two-factor authentication?')) return;
        setIsDisabling2FA(true);
        try {
            await (await import('../../services/two-factor-service')).twoFactorService.unenroll(twoFactorStatus.data.factorId);
            twoFactorStatus.refetch();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : 'Failed to disable 2FA');
        } finally {
            setIsDisabling2FA(false);
        }
    };

    const profileQuery = useProfile(user?.id);
    const competenciesQuery = useCompetencies(user?.id);
    const definitionsQuery = useCompetencyDefinitions();
    const categoriesQuery = useCompetencyCategories();

    const updateProfileMutation = useUpdateProfile();
    const uploadAvatarMutation = useUploadAvatar();
    const createCompetencyMutation = useCreateCompetency();
    const updateCompetencyMutation = useUpdateCompetency();
    const deleteCompetencyMutation = useDeleteCompetency();
    const uploadDocumentMutation = useUploadCompetencyDocument();
    const exportMyData = useExportMyData();
    const deleteMyAccount = useDeleteMyAccount();

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

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

    const handleDocumentUpload = useCallback(
        async (file: File): Promise<{ url: string; name: string }> => {
            if (!user?.id || !editingCompetency?.definition?.name) {
                throw new Error('User or competency not available');
            }
            return uploadDocumentMutation.mutateAsync({
                userId: user.id,
                competencyName: editingCompetency.definition?.name || 'certificate',
                file,
            });
        },
        [user?.id, editingCompetency?.definition?.name, uploadDocumentMutation]
    );

    const handleProfileSave = useCallback(
        (data: ProfileFormData) => {
            if (!user?.id) return;
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
                    onSuccess: () => { setIsEditingProfile(false); },
                    onError: () => {},
                }
            );
        },
        [user?.id, updateProfileMutation]
    );

    const handleAddCompetency = useCallback(() => {
        setPickerSearchTerm('');
        setPickerCategory('all');
        setShowCompetencyPicker(true);
    }, []);

    const handleSelectCompetencyType = useCallback((definition: CompetencyDefinition) => {
        setShowCompetencyPicker(false);
        setEditingCompetency({ definition, isNew: true });
    }, []);

    const handleEditCompetency = useCallback(
        (competency: Competency) => {
            const definition = definitionsQuery.data?.find(
                (d: CompetencyDefinition) => d.id === competency.competency_id
            );
            setEditingCompetency({ competency, definition, isNew: false });
        },
        [definitionsQuery.data]
    );

    const handleSaveCompetency = useCallback(
        (data: CompetencyFormData) => {
            if (!user?.id) return;
            if (editingCompetency?.isNew) {
                createCompetencyMutation.mutate(
                    { userId: user.id, data },
                    {
                        onSuccess: () => { setEditingCompetency(null); },
                        onError: () => { alert('Failed to save competency. Please try again.'); },
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
                        onSuccess: () => { setEditingCompetency(null); },
                        onError: () => { alert('Failed to save competency. Please try again.'); },
                    }
                );
            }
        },
        [user?.id, editingCompetency, createCompetencyMutation, updateCompetencyMutation]
    );

    const handleDeleteCompetency = useCallback(
        (competency: Competency) => {
            if (!user?.id) return;
            const definition = definitionsQuery.data?.find(
                (d: CompetencyDefinition) => d.id === competency.competency_id
            );
            const name = definition?.name || 'this certification';
            if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
            deleteCompetencyMutation.mutate(
                { competencyId: competency.id, userId: user.id },
                {
                    onError: () => { alert('Failed to delete competency. Please try again.'); },
                }
            );
        },
        [user?.id, deleteCompetencyMutation, definitionsQuery.data]
    );

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

    if (!isInitialized || profileQuery.isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <PageSpinner message="Loading profile..." />
            </div>
        );
    }

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
        <div className="h-full overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
            <div className="pf-chassis">
                <div className="pf-panel">
                    {/* Header */}
                    <div className="pf-header">
                        <div className="pf-header-left">
                            <div className="pf-logo" />
                            <div className="pf-header-text">
                                <h1>Profile Settings</h1>
                                <p>Manage profile, competencies and personal information</p>
                            </div>
                        </div>
                    </div>

                    <div className="pf-groove" />

                    {/* Avatar Section */}
                    <ProfileAvatar
                        avatarUrl={profileQuery.data?.avatar_url ?? undefined}
                        username={user?.username || ''}
                        email={user?.email || ''}
                        isUploading={uploadAvatarMutation.isPending}
                        onUpload={handleAvatarUpload}
                    />

                    <div className="pf-groove" />

                    {/* Personal Details */}
                    <ProfilePersonalDetails
                        data={profileFormData}
                        isEditing={isEditingProfile}
                        isSaving={updateProfileMutation.isPending}
                        onEditToggle={() => setIsEditingProfile(!isEditingProfile)}
                        onSave={handleProfileSave}
                        onCancel={() => setIsEditingProfile(false)}
                    />

                    <div className="pf-groove" />

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

                    <div className="pf-groove" />

                    {/* Security Section - 2FA */}
                    <div className="pf-info-block">
                        <div className="pf-section-header">
                            <h2 className="pf-section-title">Security</h2>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '200px' }}>
                                <span className="pf-info-label">Two-Factor Authentication</span>
                                <p className="pf-info-text" style={{ marginTop: '4px' }}>
                                    {twoFactorStatus.isLoading ? (
                                        'Checking status...'
                                    ) : twoFactorStatus.data?.isEnabled ? (
                                        <span className="pf-status-active">
                                            <span className="pf-led active" style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                            Enabled — account protected with TOTP
                                        </span>
                                    ) : (
                                        'Add an extra layer of security to your account'
                                    )}
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="pf-btn sm" onClick={() => setShow2FASetup(true)}>
                                    {twoFactorStatus.data?.isEnabled ? 'Reconfigure' : 'Set Up 2FA'}
                                </button>
                                {twoFactorStatus.data?.isEnabled && (
                                    <button
                                        className="pf-btn sm danger"
                                        onClick={handleDisable2FA}
                                        disabled={isDisabling2FA}
                                    >
                                        {isDisabling2FA ? 'Disabling...' : 'Disable'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <TwoFactorSetupWizard
                        isOpen={show2FASetup}
                        onClose={() => setShow2FASetup(false)}
                        onComplete={() => {
                            setShow2FASetup(false);
                            twoFactorStatus.refetch();
                        }}
                    />

                    <div className="pf-groove" />

                    {/* Privacy & Data Section */}
                    <div className="pf-info-block">
                        <div className="pf-section-header">
                            <h2 className="pf-section-title">Privacy & Data</h2>
                        </div>
                        <p className="pf-info-text">
                            Manage your personal data in accordance with UK GDPR.
                            You can download a copy of all your data or permanently delete your account.
                        </p>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button
                                className="pf-btn sm"
                                onClick={() => user?.id && exportMyData.mutate(user.id)}
                                disabled={exportMyData.isPending}
                            >
                                {exportMyData.isPending ? 'Exporting...' : 'Download My Data'}
                            </button>
                            <button
                                className="pf-btn sm danger"
                                onClick={() => setShowDeleteConfirm(true)}
                            >
                                Delete My Account
                            </button>
                            <a
                                href="/privacy"
                                className="pf-btn sm ghost"
                            >
                                Privacy Policy
                            </a>
                        </div>
                        {exportMyData.isSuccess && (
                            <p className="pf-info-text pf-status-active" style={{ marginTop: '10px' }}>
                                Your data has been downloaded.
                            </p>
                        )}
                        {exportMyData.isError && (
                            <p className="pf-info-text pf-status-danger" style={{ marginTop: '10px' }}>
                                Failed to export data. Please try again.
                            </p>
                        )}
                    </div>

                    {/* Nameplate */}
                    <div className="pf-groove" />
                    <div className="pf-nameplate-bar">
                        <span className="pf-nameplate">Matrix Portal</span>
                        <span className="pf-nameplate-model">Profile Settings</span>
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
                <div style={{ lineHeight: '1.6' }}>
                    <p className="pf-info-text pf-status-danger" style={{ fontWeight: '600', marginBottom: '12px' }}>
                        This action is permanent and cannot be undone.
                    </p>
                    <p className="pf-info-text" style={{ marginBottom: '10px' }}>Deleting your account will:</p>
                    <ul style={{ paddingLeft: '20px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <li className="pf-info-text" style={{ margin: 0 }}>Remove your profile and all personal information</li>
                        <li className="pf-info-text" style={{ margin: 0 }}>Delete all your competency records and certificates</li>
                        <li className="pf-info-text" style={{ margin: 0 }}>Remove your uploaded documents</li>
                        <li className="pf-info-text" style={{ margin: 0 }}>Anonymise your activity history (for audit compliance)</li>
                    </ul>
                    <p className="pf-info-text" style={{ marginBottom: '8px' }}>
                        We recommend downloading your data first. Type <strong>DELETE</strong> to confirm:
                    </p>
                    <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="Type DELETE"
                        autoComplete="off"
                        className="pf-inline-input"
                        style={{ marginBottom: '16px' }}
                    />
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button
                            className="pf-btn sm"
                            onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                            disabled={deleteMyAccount.isPending}
                        >
                            Cancel
                        </button>
                        <button
                            className="pf-btn sm danger"
                            disabled={deleteConfirmText !== 'DELETE' || deleteMyAccount.isPending}
                            onClick={() => user?.id && deleteMyAccount.mutate(user.id)}
                        >
                            {deleteMyAccount.isPending ? 'Deleting...' : 'Delete My Account'}
                        </button>
                    </div>
                    {deleteMyAccount.isError && (
                        <p className="pf-info-text pf-status-danger" style={{ marginTop: '10px', textAlign: 'center' }}>
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
                <div className="pf-search" style={{ marginBottom: '12px' }}>
                    <svg viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input
                        type="text"
                        placeholder="Search certifications..."
                        value={pickerSearchTerm}
                        onChange={(e) => setPickerSearchTerm(e.target.value)}
                    />
                </div>

                <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '400px', overflowY: 'auto' }}>
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
