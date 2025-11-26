import React, { useState, useEffect } from 'react';
import { createModernHeader } from '../components/modern-header.js';
import authManager, { ROLES } from '../auth-manager.js';
import supabase, { isSupabaseConfigured } from '../supabase-client.js';
import competencyService from '../services/competency-service.js';
import { shouldShowCertificationFields, shouldShowDateFields, getInputType, getPlaceholder, filterOutPersonalDetails, getPersonalDetails, formatValue } from '../utils/competency-field-utils.js';
import { themes, saveTheme, getCurrentTheme } from '../themes.js';
import { MatrixLogoRacer } from '../components/MatrixLogoLoader';

export default function ProfilePageNew() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [organization, setOrganization] = useState(null);
    const [competencies, setCompetencies] = useState([]);
    const [competencyDefinitions, setCompetencyDefinitions] = useState([]);
    const [editingCompetency, setEditingCompetency] = useState(null);
    const [editFormData, setEditFormData] = useState({});
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [categories, setCategories] = useState([]);

    // Profile fields editing
    const [editingProfile, setEditingProfile] = useState(false);
    const [profileFormData, setProfileFormData] = useState({
        username: '',
        email: '',
        mobile_number: '',
        email_address: '',
        home_address: '',
        nearest_uk_train_station: '',
        next_of_kin: '',
        next_of_kin_emergency_contact_number: '',
        date_of_birth: '',
        avatar_url: ''
    });
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [uploadingDocument, setUploadingDocument] = useState(false);

    // Theme state
    const [currentTheme, setCurrentTheme] = useState(getCurrentTheme());

    // Permission request state
    const [permissionRequests, setPermissionRequests] = useState([]);
    const [requestedRole, setRequestedRole] = useState('');
    const [requestMessage, setRequestMessage] = useState('');
    const [submittingRequest, setSubmittingRequest] = useState(false);
    const [requestError, setRequestError] = useState('');
    const [requestSuccess, setRequestSuccess] = useState('');

    useEffect(() => {
        loadData();
        loadPermissionRequests();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const currentUser = authManager.getCurrentUser();
            const currentProfile = authManager.getCurrentProfile();

            console.log('[ProfilePage] Current user:', currentUser);
            console.log('[ProfilePage] Current profile:', currentProfile);

            if (!currentUser) {
                window.location.href = '/login';
                return;
            }

            setUser(currentUser);
            setProfile(currentProfile);
            setProfileFormData({
                username: currentUser.username || '',
                email: currentUser.email || '',
                mobile_number: currentProfile?.mobile_number || '',
                email_address: currentProfile?.email_address || currentUser.email || '',
                home_address: currentProfile?.home_address || '',
                nearest_uk_train_station: currentProfile?.nearest_uk_train_station || '',
                next_of_kin: currentProfile?.next_of_kin || '',
                next_of_kin_emergency_contact_number: currentProfile?.next_of_kin_emergency_contact_number || '',
                date_of_birth: currentProfile?.date_of_birth || '',
                avatar_url: currentProfile?.avatar_url || ''
            });

            // Load organization
            if (currentProfile?.organization_id) {
                const org = await authManager.getOrganization(currentProfile.organization_id);
                console.log('[ProfilePage] Organization:', org);
                setOrganization(org);
            }

            // Load competencies
            if (isSupabaseConfigured()) {
                console.log('[ProfilePage] Loading competencies for user:', currentUser.id);
                const userComps = await competencyService.getUserCompetencies(currentUser.id);
                console.log('[ProfilePage] User competencies:', userComps);
                setCompetencies(userComps);

                const compDefs = await competencyService.getCompetencyDefinitions();
                console.log('[ProfilePage] Competency definitions:', compDefs);
                setCompetencyDefinitions(compDefs);

                const cats = await competencyService.getCategories();
                console.log('[ProfilePage] Categories:', cats);
                setCategories(cats);

                // Debug: Check personal details
                const personalDetails = getPersonalDetails(userComps);
                console.log('[ProfilePage] Personal details:', personalDetails);

                // Debug: Check certifications
                const certifications = userComps.filter(c => {
                    const def = compDefs.find(d => d.id === c.competency_id);
                    return shouldShowCertificationFields(def);
                });
                console.log('[ProfilePage] Certifications:', certifications);
            } else {
                console.warn('[ProfilePage] Supabase is not configured');
            }
        } catch (error) {
            console.error('[ProfilePage] Error loading profile data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAvatarUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) {
            console.log('[ProfilePage] No file selected');
            return;
        }

        console.log('[ProfilePage] Avatar upload started:', {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size
        });

        // Validate file type
        if (!file.type.startsWith('image/')) {
            console.error('[ProfilePage] Invalid file type:', file.type);
            alert('Please upload an image file');
            return;
        }

        // Validate file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            console.error('[ProfilePage] File too large:', file.size);
            alert('Image must be less than 2MB');
            return;
        }

        setUploadingAvatar(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}-${Date.now()}.${fileExt}`;
            const filePath = `${user.id}/${fileName}`;

            console.log('[ProfilePage] Uploading to storage:', filePath);

            // Upload to Supabase storage
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: true
                });

            console.log('[ProfilePage] Upload response:', { uploadData, uploadError });

            if (uploadError) {
                console.error('[ProfilePage] Upload error:', uploadError);
                throw uploadError;
            }

            // Get public URL
            const { data: urlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            const avatarUrl = urlData.publicUrl;
            console.log('[ProfilePage] Public URL:', avatarUrl);

            // Update profile
            console.log('[ProfilePage] Updating profile with avatar URL...');
            const { data: updateData, error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: avatarUrl })
                .eq('id', user.id)
                .select();

            console.log('[ProfilePage] Profile update response:', { updateData, updateError });

            if (updateError) {
                console.error('[ProfilePage] Profile update error:', updateError);
                throw updateError;
            }

            setProfileFormData({ ...profileFormData, avatar_url: avatarUrl });
            await loadData();
            alert('Profile picture updated successfully!');
        } catch (error) {
            console.error('[ProfilePage] Error uploading avatar:', error);
            console.error('[ProfilePage] Error details:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
                statusCode: error.statusCode
            });
            alert('Failed to upload profile picture: ' + error.message);
        } finally {
            console.log('[ProfilePage] Avatar upload complete');
            setUploadingAvatar(false);
        }
    };

    const handleSaveProfile = async () => {
        if (!user) {
            console.error('[ProfilePage] No user found');
            return;
        }

        console.log('[ProfilePage] Starting profile save for user:', user.id);
        console.log('[ProfilePage] Profile data to save:', profileFormData);

        setSaving(true);
        try {
            console.log('[ProfilePage] Updating profiles table...');
            const { data, error } = await supabase
                .from('profiles')
                .update({
                    username: profileFormData.username,
                    email: profileFormData.email,
                    mobile_number: profileFormData.mobile_number,
                    email_address: profileFormData.email_address,
                    home_address: profileFormData.home_address,
                    nearest_uk_train_station: profileFormData.nearest_uk_train_station,
                    next_of_kin: profileFormData.next_of_kin,
                    next_of_kin_emergency_contact_number: profileFormData.next_of_kin_emergency_contact_number,
                    date_of_birth: profileFormData.date_of_birth
                })
                .eq('id', user.id)
                .select();

            console.log('[ProfilePage] Update response:', { data, error });

            if (error) {
                console.error('[ProfilePage] Supabase error:', error);
                throw error;
            }

            console.log('[ProfilePage] Profile updated successfully, refreshing user data...');

            // Reload data
            await loadData();
            setEditingProfile(false);
            alert('Profile updated successfully!');
        } catch (error) {
            console.error('[ProfilePage] Error updating profile:', error);
            console.error('[ProfilePage] Error details:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
            });
            alert('Failed to update profile: ' + error.message);
        } finally {
            console.log('[ProfilePage] Save complete, setting saving to false');
            setSaving(false);
        }
    };

    const handleEditCompetency = (comp) => {
        const definition = competencyDefinitions.find(d => d.id === comp.competency_id);
        setEditingCompetency(comp);
        setEditFormData({
            value: comp.value || '',
            issuing_body: comp.issuing_body || '',
            certification_id: comp.certification_id || '',
            expiry_date: comp.expiry_date ? new Date(comp.expiry_date).toISOString().split('T')[0] : '',
            issued_date: comp.created_at ? new Date(comp.created_at).toISOString().split('T')[0] : '',
            notes: comp.notes || '',
            document_url: comp.document_url || null,
            document_name: comp.document_name || null,
            definition
        });
    };

    const handleSaveCompetency = async () => {
        if (!editingCompetency || !user) return;

        setSaving(true);
        try {
            const dataToSave = {
                value: editFormData.value || null,
                issuing_body: editFormData.issuing_body || null,
                certification_id: editFormData.certification_id || null,
                expiry_date: editFormData.expiry_date || null,
                notes: editFormData.notes || null,
                document_url: editFormData.document_url || null,
                document_name: editFormData.document_name || null
            };

            // Set status - use 'pending_approval' if document was just added (new or changed)
            const documentJustAdded = editFormData.document_url &&
                (editingCompetency.isNew || editFormData.document_url !== editingCompetency.document_url);

            if (documentJustAdded) {
                dataToSave.status = 'pending_approval';
            } else if (editingCompetency.isNew) {
                // New competency without document
                dataToSave.status = 'active';
            }
            // For existing competencies without document changes, don't modify status

            // If it's a date field, update created_at as well
            if (editFormData.issued_date) {
                dataToSave.created_at = editFormData.issued_date;
            }

            // Check if this is a new competency or an update
            if (editingCompetency.isNew || !editingCompetency.id) {
                // Insert new competency
                const { error } = await supabase
                    .from('employee_competencies')
                    .insert({
                        user_id: user.id,
                        competency_id: editingCompetency.competency_id,
                        status: 'active',
                        ...dataToSave
                    });

                if (error) throw error;
            } else {
                // Update existing competency
                const { error } = await supabase
                    .from('employee_competencies')
                    .update(dataToSave)
                    .eq('id', editingCompetency.id);

                if (error) throw error;
            }

            await loadData();
            setEditingCompetency(null);
            setEditFormData({});
        } catch (error) {
            console.error('Error saving competency:', error);
            alert('Failed to save: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const getCompetencyByType = (fieldType) => {
        return competencies.filter(c => {
            const def = competencyDefinitions.find(d => d.id === c.competency_id);
            return def?.field_type === fieldType;
        });
    };

    const handleAddCompetency = (definitionId) => {
        if (!user) return;

        const definition = competencyDefinitions.find(d => d.id === definitionId);
        if (!definition) return;

        // Check if user already has this competency
        const existing = competencies.find(c => c.competency_id === definitionId);
        if (existing) {
            alert('You already have this competency. You can edit it from the list below.');
            setShowAddModal(false);
            return;
        }

        // Close modal and open edit form for a new competency (not yet saved to DB)
        setShowAddModal(false);
        setEditingCompetency({ id: null, competency_id: definitionId, isNew: true });
        setEditFormData({
            value: '',
            issuing_body: '',
            certification_id: '',
            expiry_date: '',
            issued_date: '',
            notes: '',
            document_url: null,
            document_name: null,
            definition
        });
    };

    const handleDeleteCompetency = async (compId) => {
        if (!confirm('Are you sure you want to delete this competency?')) return;

        setSaving(true);
        try {
            const { error } = await supabase
                .from('employee_competencies')
                .delete()
                .eq('id', compId);

            if (error) throw error;

            await loadData();
        } catch (error) {
            console.error('Error deleting competency:', error);
            alert('Failed to delete: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    // Handle document upload for competencies
    const handleDocumentUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file || !user || !editFormData.definition) {
            console.log('[DocumentUpload] Missing required data:', { file: !!file, user: !!user, definition: !!editFormData.definition });
            return;
        }

        console.log('[DocumentUpload] Starting upload:', {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            userId: user.id,
            competencyName: editFormData.definition.name
        });

        // Validate file type - images and PDFs supported
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            alert('Please upload an image (JPG, PNG, GIF, WebP) or PDF file.');
            return;
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            alert('File must be less than 10MB');
            return;
        }

        setUploadingDocument(true);
        try {
            // Upload directly using supabase storage - use 'avatars' bucket which we know works
            const fileExt = file.name.split('.').pop();
            const competencySlug = editFormData.definition.name.replace(/\s+/g, '_').toLowerCase();
            const fileName = `cert_${competencySlug}_${Date.now()}.${fileExt}`;
            const filePath = `${user.id}/certificates/${fileName}`;

            console.log('[DocumentUpload] Uploading to path:', filePath);

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: true
                });

            console.log('[DocumentUpload] Upload response:', { uploadData, uploadError });

            if (uploadError) {
                throw uploadError;
            }

            // Get public URL
            const { data: urlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            console.log('[DocumentUpload] Public URL:', urlData.publicUrl);

            setEditFormData({
                ...editFormData,
                document_url: urlData.publicUrl,
                document_name: file.name
            });

            console.log('[DocumentUpload] Success!');
        } catch (error) {
            console.error('[DocumentUpload] Error:', error);
            console.error('[DocumentUpload] Error details:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
                statusCode: error.statusCode
            });
            alert('Failed to upload document: ' + (error.message || 'Unknown error'));
        } finally {
            setUploadingDocument(false);
        }
    };

    // Remove document from form
    const handleRemoveDocument = () => {
        setEditFormData({
            ...editFormData,
            document_url: null,
            document_name: null
        });
    };

    // Theme change handler
    const handleThemeChange = (themeId) => {
        saveTheme(themeId);
        setCurrentTheme(themeId);
    };

    // Load permission requests
    const loadPermissionRequests = async () => {
        if (!isSupabaseConfigured()) return;

        try {
            const currentUser = authManager.getCurrentUser();
            if (!currentUser) return;

            const { data: requests, error } = await supabase
                .from('permission_requests')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error loading permission requests:', error);
                return;
            }

            setPermissionRequests(requests || []);
        } catch (error) {
            console.error('Error loading permission requests:', error);
        }
    };

    // Get available roles for upgrade
    const getAvailableRoles = () => {
        if (!user) return [];

        const roleHierarchy = {
            [ROLES.VIEWER]: ['editor', 'org_admin', 'admin'],
            [ROLES.EDITOR]: ['org_admin', 'admin'],
            [ROLES.ORG_ADMIN]: ['admin'],
            [ROLES.ADMIN]: []
        };

        return roleHierarchy[user.role] || [];
    };

    // Submit permission request
    const handleSubmitPermissionRequest = async (e) => {
        e.preventDefault();
        setRequestError('');
        setRequestSuccess('');

        if (!requestedRole) {
            setRequestError('Please select a role');
            return;
        }

        if (!requestMessage.trim()) {
            setRequestError('Please provide a reason for your request');
            return;
        }

        if (!isSupabaseConfigured()) {
            setRequestError('Permission requests require Supabase backend');
            return;
        }

        setSubmittingRequest(true);

        try {
            // Check for existing pending request
            const { data: existingRequests } = await supabase
                .from('permission_requests')
                .select('id')
                .eq('user_id', user.id)
                .eq('status', 'pending');

            if (existingRequests && existingRequests.length > 0) {
                setRequestError('You already have a pending permission request');
                return;
            }

            // Create permission request
            const { error } = await supabase
                .from('permission_requests')
                .insert({
                    user_id: user.id,
                    requested_role: requestedRole,
                    user_current_role: user.role,
                    message: requestMessage.trim()
                });

            if (error) throw error;

            setRequestSuccess('Permission request submitted successfully! An admin will review it shortly.');
            setRequestedRole('');
            setRequestMessage('');
            await loadPermissionRequests();
        } catch (error) {
            console.error('Error submitting permission request:', error);
            setRequestError(error.message || 'Failed to submit request');
        } finally {
            setSubmittingRequest(false);
        }
    };

    const getFilteredDefinitions = () => {
        // Filter out personal details - only show certifications/qualifications
        let filtered = filterOutPersonalDetails(competencyDefinitions).filter(def => {
            // Don't show competencies user already has
            return !competencies.some(c => c.competency_id === def.id);
        });

        // Filter by category
        if (selectedCategory !== 'all') {
            filtered = filtered.filter(def => def.category_id === selectedCategory);
        }

        // Filter by search term
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(def =>
                def.name.toLowerCase().includes(term) ||
                (def.description && def.description.toLowerCase().includes(term))
            );
        }

        return filtered;
    };

    if (loading) {
        return (
            <div className="h-full flex flex-col items-center justify-center gap-4">
                <MatrixLogoRacer size={160} duration={4} />
                <div className="text-gray-400 animate-pulse">Loading profile...</div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="h-full flex items-center justify-center">
                <div style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Please log in to view your profile.</div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div id="profile-header" style={{ flexShrink: 0 }}>
                {typeof window !== 'undefined' && (() => {
                    const container = document.getElementById('profile-header');
                    if (container && container.children.length === 0) {
                        const header = createModernHeader(
                            'Profile Settings',
                            'Manage your profile, competencies, and personal information',
                            {
                                showParticles: true,
                                particleCount: 20,
                                gradientColors: ['#34d399', '#60a5fa'],
                                height: '100px'
                            }
                        );
                        container.appendChild(header);
                    }
                    return null;
                })()}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto glass-scrollbar p-6">
                <div className="max-w-4xl mx-auto space-y-6">
                    {/* Basic Profile Information */}
                    <div className="glass-card" style={{ padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', margin: 0 }}>Personal Details</h2>
                            {!editingProfile && (
                                <button onClick={() => setEditingProfile(true)} className="btn btn--secondary btn--sm">
                                    <svg style={{ width: '14px', height: '14px', marginRight: '4px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    Edit
                                </button>
                            )}
                        </div>

                        {/* Profile Picture Section */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            <div style={{ position: 'relative' }}>
                                <div style={{
                                    width: '120px',
                                    height: '120px',
                                    borderRadius: '50%',
                                    overflow: 'hidden',
                                    border: '3px solid rgba(255, 255, 255, 0.2)',
                                    background: 'linear-gradient(135deg, rgba(52, 211, 153, 0.2), rgba(96, 165, 250, 0.2))',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {profileFormData.avatar_url ? (
                                        <img src={profileFormData.avatar_url} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <svg style={{ width: '60px', height: '60px', color: 'rgba(255, 255, 255, 0.5)' }} fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                                        </svg>
                                    )}
                                </div>
                                {uploadingAvatar && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '120px',
                                        height: '120px',
                                        borderRadius: '50%',
                                        background: 'rgba(0, 0, 0, 0.7)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <div className="spinner" style={{ width: '30px', height: '30px' }}></div>
                                    </div>
                                )}
                            </div>
                            <div>
                                <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#ffffff', margin: '0 0 8px 0' }}>{user.username}</h3>
                                <p style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.6)', margin: '0 0 12px 0' }}>{user.email}</p>
                                <label className="btn btn--secondary btn--sm" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                                    <svg style={{ width: '14px', height: '14px', marginRight: '6px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    {uploadingAvatar ? 'Uploading...' : 'Change Photo'}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleAvatarUpload}
                                        disabled={uploadingAvatar}
                                        style={{ display: 'none' }}
                                    />
                                </label>
                            </div>
                        </div>

                        {/* Profile Fields Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                            {/* Mobile Number */}
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '6px' }}>Mobile Number</label>
                                {editingProfile ? (
                                    <input
                                        type="tel"
                                        className="glass-input"
                                        placeholder="+44 7700 900000"
                                        value={profileFormData.mobile_number}
                                        onChange={(e) => setProfileFormData({ ...profileFormData, mobile_number: e.target.value })}
                                    />
                                ) : (
                                    <div style={{ color: '#ffffff', fontSize: '15px' }}>{profileFormData.mobile_number || '-'}</div>
                                )}
                            </div>

                            {/* Email Address */}
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '6px' }}>Email Address</label>
                                {editingProfile ? (
                                    <input
                                        type="email"
                                        className="glass-input"
                                        placeholder="example@company.com"
                                        value={profileFormData.email_address}
                                        onChange={(e) => setProfileFormData({ ...profileFormData, email_address: e.target.value })}
                                    />
                                ) : (
                                    <div style={{ color: '#ffffff', fontSize: '15px' }}>{profileFormData.email_address || '-'}</div>
                                )}
                            </div>

                            {/* Home Address */}
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '6px' }}>Home Address</label>
                                {editingProfile ? (
                                    <input
                                        type="text"
                                        className="glass-input"
                                        placeholder="Street, City, Postcode"
                                        value={profileFormData.home_address}
                                        onChange={(e) => setProfileFormData({ ...profileFormData, home_address: e.target.value })}
                                    />
                                ) : (
                                    <div style={{ color: '#ffffff', fontSize: '15px' }}>{profileFormData.home_address || '-'}</div>
                                )}
                            </div>

                            {/* Nearest UK Train Station */}
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '6px' }}>Nearest UK Train Station</label>
                                {editingProfile ? (
                                    <input
                                        type="text"
                                        className="glass-input"
                                        placeholder="Station name"
                                        value={profileFormData.nearest_uk_train_station}
                                        onChange={(e) => setProfileFormData({ ...profileFormData, nearest_uk_train_station: e.target.value })}
                                    />
                                ) : (
                                    <div style={{ color: '#ffffff', fontSize: '15px' }}>{profileFormData.nearest_uk_train_station || '-'}</div>
                                )}
                            </div>

                            {/* Date of Birth */}
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '6px' }}>Date of Birth</label>
                                {editingProfile ? (
                                    <input
                                        type="date"
                                        className="glass-input"
                                        value={profileFormData.date_of_birth}
                                        onChange={(e) => setProfileFormData({ ...profileFormData, date_of_birth: e.target.value })}
                                    />
                                ) : (
                                    <div style={{ color: '#ffffff', fontSize: '15px' }}>
                                        {profileFormData.date_of_birth ? new Date(profileFormData.date_of_birth).toLocaleDateString('en-GB') : '-'}
                                    </div>
                                )}
                            </div>

                            {/* Next of Kin */}
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '6px' }}>Next of Kin</label>
                                {editingProfile ? (
                                    <input
                                        type="text"
                                        className="glass-input"
                                        placeholder="Full name of emergency contact"
                                        value={profileFormData.next_of_kin}
                                        onChange={(e) => setProfileFormData({ ...profileFormData, next_of_kin: e.target.value })}
                                    />
                                ) : (
                                    <div style={{ color: '#ffffff', fontSize: '15px' }}>{profileFormData.next_of_kin || '-'}</div>
                                )}
                            </div>

                            {/* Next of Kin Emergency Contact Number */}
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '6px' }}>Next of Kin / Emergency Contact Number</label>
                                {editingProfile ? (
                                    <input
                                        type="tel"
                                        className="glass-input"
                                        placeholder="+44 7700 900000"
                                        value={profileFormData.next_of_kin_emergency_contact_number}
                                        onChange={(e) => setProfileFormData({ ...profileFormData, next_of_kin_emergency_contact_number: e.target.value })}
                                    />
                                ) : (
                                    <div style={{ color: '#ffffff', fontSize: '15px' }}>{profileFormData.next_of_kin_emergency_contact_number || '-'}</div>
                                )}
                            </div>

                            {/* Organization (Read-only) */}
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '6px' }}>Organization</label>
                                <div style={{ color: '#ffffff', fontSize: '15px' }}>{organization?.name || '-'}</div>
                            </div>

                            {/* Role (Read-only) */}
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '6px' }}>Role</label>
                                <div><span className="glass-badge">{user.role}</span></div>
                            </div>
                        </div>

                        {editingProfile && (
                            <div style={{ display: 'flex', gap: '12px', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', justifyContent: 'flex-end' }}>
                                <button onClick={() => setEditingProfile(false)} className="btn btn--secondary" disabled={saving}>
                                    Cancel
                                </button>
                                <button onClick={handleSaveProfile} className="btn btn--primary" disabled={saving}>
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Theme Settings */}
                    <div className="glass-card" style={{ padding: '24px' }}>
                        <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', margin: 0 }}>Theme Settings</h2>
                            <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px', marginTop: '8px', marginBottom: 0 }}>
                                Choose your preferred color scheme
                            </p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '12px' }}>
                            {Object.entries(themes).map(([themeId, theme]) => {
                                const isActive = themeId === currentTheme;
                                const primaryColor = theme.colors['accent-primary'];

                                return (
                                    <button
                                        key={themeId}
                                        onClick={() => handleThemeChange(themeId)}
                                        style={{
                                            position: 'relative',
                                            padding: '12px',
                                            borderRadius: '10px',
                                            border: `2px solid ${isActive ? primaryColor : 'rgba(255, 255, 255, 0.15)'}`,
                                            background: isActive
                                                ? `linear-gradient(135deg, ${theme.colors['bg-dark-2']} 0%, ${theme.colors['bg-dark-3']} 100%)`
                                                : 'rgba(255, 255, 255, 0.05)',
                                            cursor: 'pointer',
                                            transition: 'all 0.3s ease',
                                            boxShadow: isActive ? `0 0 20px ${theme.colors['accent-primary-glow']}, 0 4px 12px rgba(0,0,0,0.3)` : 'none'
                                        }}
                                    >
                                        {isActive && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '6px',
                                                right: '6px',
                                                width: '16px',
                                                height: '16px',
                                                borderRadius: '50%',
                                                background: primaryColor,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                <svg style={{ width: '10px', height: '10px', color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                        )}

                                        <div style={{
                                            width: '100%',
                                            height: '32px',
                                            borderRadius: '6px',
                                            background: `linear-gradient(135deg, ${theme.colors['accent-primary']} 0%, ${theme.colors['accent-secondary']} 100%)`,
                                            boxShadow: `0 0 12px ${theme.colors['accent-primary-glow']}`,
                                            marginBottom: '8px'
                                        }} />

                                        <div style={{ display: 'flex', gap: '3px' }}>
                                            <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: theme.colors['accent-primary'] }} />
                                            <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: theme.colors['accent-secondary'] }} />
                                            <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: theme.colors['accent-tertiary'] }} />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Permission Request Section - Only show if not admin */}
                    {user.role !== ROLES.ADMIN && (
                        <div className="glass-card" style={{ padding: '24px' }}>
                            <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', margin: 0 }}>Request Permission Upgrade</h2>
                            </div>

                            <form onSubmit={handleSubmitPermissionRequest} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '8px' }}>
                                        Requested Role
                                    </label>
                                    <select
                                        className="glass-input"
                                        value={requestedRole}
                                        onChange={(e) => setRequestedRole(e.target.value)}
                                        style={{ width: '100%' }}
                                    >
                                        <option value="">Select a role...</option>
                                        {getAvailableRoles().includes('editor') && (
                                            <option value="editor">Editor (Create/Edit/Delete)</option>
                                        )}
                                        {getAvailableRoles().includes('org_admin') && (
                                            <option value="org_admin">Organization Admin</option>
                                        )}
                                        {getAvailableRoles().includes('admin') && (
                                            <option value="admin">Admin (Full Access)</option>
                                        )}
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '8px' }}>
                                        Reason for Request
                                    </label>
                                    <textarea
                                        className="glass-input"
                                        rows="4"
                                        placeholder="Explain why you need this permission level..."
                                        value={requestMessage}
                                        onChange={(e) => setRequestMessage(e.target.value)}
                                        style={{ width: '100%', resize: 'vertical' }}
                                    />
                                </div>

                                {requestError && (
                                    <div style={{ color: '#ef4444', fontSize: '14px' }}>{requestError}</div>
                                )}

                                {requestSuccess && (
                                    <div style={{ color: '#10b981', fontSize: '14px' }}>{requestSuccess}</div>
                                )}

                                <button
                                    type="submit"
                                    className="btn btn--primary"
                                    disabled={submittingRequest}
                                    style={{ width: '100%' }}
                                >
                                    {submittingRequest ? 'Submitting...' : 'Submit Request'}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* My Permission Requests */}
                    <div className="glass-card" style={{ padding: '24px' }}>
                        <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', margin: 0 }}>My Permission Requests</h2>
                        </div>

                        {permissionRequests.length === 0 ? (
                            <div style={{ color: 'rgba(255, 255, 255, 0.5)', textAlign: 'center', padding: '16px' }}>
                                No permission requests found
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {permissionRequests.map(request => {
                                    const statusStyles = {
                                        pending: { background: 'rgba(251, 191, 36, 0.2)', color: 'rgba(253, 224, 71, 1)', borderColor: 'rgba(251, 191, 36, 0.4)' },
                                        approved: { background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.4)' },
                                        rejected: { background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }
                                    };
                                    const style = statusStyles[request.status] || statusStyles.pending;

                                    return (
                                        <div
                                            key={request.id}
                                            style={{
                                                padding: '16px',
                                                background: 'rgba(255, 255, 255, 0.03)',
                                                borderRadius: '8px',
                                                border: '1px solid rgba(255, 255, 255, 0.1)'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                                                <div>
                                                    <div style={{ color: '#ffffff', fontWeight: '500', fontSize: '14px' }}>
                                                        {request.user_current_role} → {request.requested_role}
                                                    </div>
                                                    <div style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '13px', marginTop: '4px' }}>
                                                        {new Date(request.created_at).toLocaleDateString('en-US', {
                                                            year: 'numeric',
                                                            month: 'short',
                                                            day: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </div>
                                                </div>
                                                <span
                                                    className="glass-badge"
                                                    style={{
                                                        background: style.background,
                                                        color: style.color,
                                                        borderColor: style.borderColor,
                                                        fontSize: '12px',
                                                        padding: '4px 10px'
                                                    }}
                                                >
                                                    {request.status}
                                                </span>
                                            </div>

                                            {request.message && (
                                                <div style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '13px', marginTop: '12px' }}>
                                                    <span style={{ fontWeight: '500' }}>Reason:</span> {request.message}
                                                </div>
                                            )}

                                            {request.rejection_reason && (
                                                <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '12px' }}>
                                                    <span style={{ fontWeight: '500' }}>Rejection reason:</span> {request.rejection_reason}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Certifications */}
                    <div className="glass-card" style={{ padding: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', margin: 0 }}>Certifications & Qualifications</h2>
                            <button onClick={() => setShowAddModal(true)} className="btn btn--primary btn--sm">
                                <svg style={{ width: '14px', height: '14px', marginRight: '4px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                </svg>
                                Add Certification
                            </button>
                        </div>

                        <div style={{ display: 'grid', gap: '12px' }}>
                            {competencies
                                .filter(c => {
                                    const def = competencyDefinitions.find(d => d.id === c.competency_id);
                                    return shouldShowCertificationFields(def);
                                })
                                .map(comp => {
                                    const definition = competencyDefinitions.find(d => d.id === comp.competency_id);
                                    if (!definition) return null;

                                    const isExpired = comp.expiry_date && new Date(comp.expiry_date) < new Date();
                                    const isExpiringSoon = comp.expiry_date && !isExpired && Math.ceil((new Date(comp.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)) <= 30;

                                    return (
                                        <div
                                            key={comp.id}
                                            style={{
                                                padding: '16px',
                                                background: 'rgba(255, 255, 255, 0.03)',
                                                borderRadius: '8px',
                                                border: `1px solid ${isExpired ? 'rgba(239, 68, 68, 0.3)' : isExpiringSoon ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                                                borderLeft: `4px solid ${isExpired ? '#ef4444' : isExpiringSoon ? '#f59e0b' : '#10b981'}`
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                                                <div>
                                                    <div style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff', marginBottom: '4px' }}>{definition.name}</div>
                                                    <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                                        {definition.category?.name}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {isExpired ? (
                                                        <span className="glass-badge badge-red" style={{ fontSize: '10px', padding: '4px 8px' }}>Expired</span>
                                                    ) : isExpiringSoon ? (
                                                        <span className="glass-badge" style={{ background: 'rgba(245, 158, 11, 0.3)', color: '#f59e0b', fontSize: '10px', padding: '4px 8px' }}>Expiring Soon</span>
                                                    ) : (
                                                        <span className="glass-badge badge-green" style={{ fontSize: '10px', padding: '4px 8px' }}>Active</span>
                                                    )}
                                                    <button onClick={() => handleEditCompetency(comp)} className="btn-icon" style={{ padding: '6px' }}>
                                                        <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                    </button>
                                                    <button onClick={() => handleDeleteCompetency(comp.id)} className="btn-icon" style={{ padding: '6px', color: '#ef4444' }}>
                                                        <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>

                                            <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                                                {comp.issuing_body && (
                                                    <div style={{ marginBottom: '6px' }}>
                                                        <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Issuer:</span>{' '}
                                                        <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>{comp.issuing_body}</span>
                                                    </div>
                                                )}
                                                {comp.certification_id && (
                                                    <div style={{ marginBottom: '6px' }}>
                                                        <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>ID:</span>{' '}
                                                        <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>{comp.certification_id}</span>
                                                    </div>
                                                )}
                                                {comp.created_at && (
                                                    <div style={{ marginBottom: '6px' }}>
                                                        <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Issued:</span>{' '}
                                                        <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>{new Date(comp.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                )}
                                                {comp.expiry_date && (
                                                    <div style={{ marginBottom: '6px' }}>
                                                        <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Expires:</span>{' '}
                                                        <span style={{ color: isExpired ? '#ef4444' : isExpiringSoon ? '#f59e0b' : 'rgba(255, 255, 255, 0.9)', fontWeight: '500' }}>
                                                            {new Date(comp.expiry_date).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                )}
                                                {comp.document_name && (
                                                    <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Document:</span>{' '}
                                                        <span style={{
                                                            color: 'var(--accent-primary)',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}>
                                                            <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                            </svg>
                                                            {comp.document_name}
                                                        </span>
                                                        {comp.status === 'pending_approval' && (
                                                            <span className="glass-badge" style={{ background: 'rgba(251, 191, 36, 0.2)', color: '#fbbf24', fontSize: '9px', padding: '2px 6px', marginLeft: '4px' }}>
                                                                Pending Review
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                {!comp.document_name && (
                                                    <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Document:</span>{' '}
                                                        <span style={{ color: 'rgba(245, 158, 11, 0.8)', fontSize: '12px' }}>
                                                            No document uploaded
                                                        </span>
                                                    </div>
                                                )}
                                                {comp.notes && (
                                                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)', fontStyle: 'italic' }}>
                                                        {comp.notes}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>

                        {competencies.filter(c => {
                            const def = competencyDefinitions.find(d => d.id === c.competency_id);
                            return shouldShowCertificationFields(def);
                        }).length === 0 && (
                            <div style={{ textAlign: 'center', padding: '32px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                No certifications added yet.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Browse & Add Competencies Modal */}
            {showAddModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div
                        onClick={() => setShowAddModal(false)}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0, 0, 0, 0.7)',
                            backdropFilter: 'blur(4px)'
                        }}
                    />
                    <div className="glass-card" style={{
                        position: 'relative',
                        width: '90%',
                        maxWidth: '700px',
                        maxHeight: '80vh',
                        overflowY: 'auto',
                        padding: '24px',
                        animation: 'fadeIn 0.2s ease-out'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', margin: 0 }}>Add Certification</h3>
                            <button
                                onClick={() => setShowAddModal(false)}
                                className="btn-icon"
                                style={{ padding: '8px' }}
                            >
                                <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Search */}
                        <div style={{ marginBottom: '16px' }}>
                            <input
                                type="text"
                                className="glass-input"
                                placeholder="Search certifications..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ width: '100%' }}
                            />
                        </div>

                        {/* Category Filter */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => setSelectedCategory('all')}
                                className={selectedCategory === 'all' ? 'btn btn--primary btn--sm' : 'btn btn--secondary btn--sm'}
                            >
                                All
                            </button>
                            {categories
                                .filter(cat => !cat.name.toLowerCase().includes('personal details'))
                                .map(cat => (
                                    <button
                                        key={cat.id}
                                        onClick={() => setSelectedCategory(cat.id)}
                                        className={selectedCategory === cat.id ? 'btn btn--primary btn--sm' : 'btn btn--secondary btn--sm'}
                                    >
                                        {cat.name}
                                    </button>
                                ))}
                        </div>

                        {/* Competency List */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }} className="glass-scrollbar">
                            {getFilteredDefinitions().map(def => (
                                <div
                                    key={def.id}
                                    onClick={() => handleAddCompetency(def.id)}
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
                                        <div style={{ fontSize: '14px', fontWeight: '500', color: '#ffffff', marginBottom: '2px' }}>{def.name}</div>
                                        {def.description && (
                                            <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>{def.description}</div>
                                        )}
                                    </div>
                                    <svg style={{ width: '18px', height: '18px', color: 'var(--accent-primary)', flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                    </svg>
                                </div>
                            ))}
                        </div>

                        {getFilteredDefinitions().length === 0 && (
                            <div style={{ textAlign: 'center', padding: '32px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                {searchTerm || selectedCategory !== 'all' ? 'No certifications match your search' : 'All available certifications have been added'}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Edit Competency Modal */}
            {editingCompetency && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div
                        onClick={() => { setEditingCompetency(null); setEditFormData({}); }}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0, 0, 0, 0.7)',
                            backdropFilter: 'blur(4px)'
                        }}
                    />
                    <div className="glass-card" style={{
                        position: 'relative',
                        width: '90%',
                        maxWidth: '500px',
                        padding: '24px',
                        animation: 'fadeIn 0.2s ease-out'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', margin: 0 }}>
                                {editingCompetency.isNew ? 'Add' : 'Edit'} {editFormData.definition?.name || 'Certification'}
                            </h3>
                            <button
                                onClick={() => { setEditingCompetency(null); setEditFormData({}); }}
                                className="btn-icon"
                                style={{ padding: '8px' }}
                            >
                                <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {shouldShowCertificationFields(editFormData.definition) && (
                                <>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '6px' }}>Issuing Body</label>
                                        <input
                                            type="text"
                                            className="glass-input"
                                            placeholder="e.g., BINDT, PCN, ASNT"
                                            value={editFormData.issuing_body || ''}
                                            onChange={(e) => setEditFormData({ ...editFormData, issuing_body: e.target.value })}
                                            style={{ width: '100%' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '6px' }}>Certification ID</label>
                                        <input
                                            type="text"
                                            className="glass-input"
                                            placeholder="Certificate number"
                                            value={editFormData.certification_id || ''}
                                            onChange={(e) => setEditFormData({ ...editFormData, certification_id: e.target.value })}
                                            style={{ width: '100%' }}
                                        />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '6px' }}>Issued Date</label>
                                            <input
                                                type="date"
                                                className="glass-input"
                                                value={editFormData.issued_date || ''}
                                                onChange={(e) => setEditFormData({ ...editFormData, issued_date: e.target.value })}
                                                style={{ width: '100%' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '6px' }}>Expiry Date</label>
                                            <input
                                                type="date"
                                                className="glass-input"
                                                value={editFormData.expiry_date || ''}
                                                onChange={(e) => setEditFormData({ ...editFormData, expiry_date: e.target.value })}
                                                style={{ width: '100%' }}
                                            />
                                        </div>
                                    </div>
                                </>
                            )}
                            {/* Document Upload */}
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '6px' }}>
                                    Certificate Document
                                    <span style={{ fontSize: '11px', fontWeight: '400', marginLeft: '8px', color: 'rgba(255, 255, 255, 0.4)' }}>
                                        (PDF or image - max 10MB)
                                    </span>
                                </label>
                                {editFormData.document_name ? (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '12px 16px',
                                        background: 'rgba(16, 185, 129, 0.1)',
                                        border: '1px solid rgba(16, 185, 129, 0.3)',
                                        borderRadius: '8px'
                                    }}>
                                        <svg style={{ width: '20px', height: '20px', color: '#10b981', flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <span style={{ flex: 1, color: '#ffffff', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {editFormData.document_name}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleRemoveDocument}
                                            className="btn-icon"
                                            style={{ padding: '4px', color: '#ef4444' }}
                                        >
                                            <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ) : (
                                    <label style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '20px',
                                        border: '2px dashed rgba(255, 255, 255, 0.2)',
                                        borderRadius: '8px',
                                        cursor: uploadingDocument ? 'wait' : 'pointer',
                                        transition: 'all 0.2s ease',
                                        background: 'rgba(255, 255, 255, 0.02)'
                                    }}
                                    onMouseEnter={(e) => { if (!uploadingDocument) e.currentTarget.style.borderColor = 'var(--accent-primary)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'; }}
                                    >
                                        {uploadingDocument ? (
                                            <>
                                                <div className="spinner" style={{ width: '24px', height: '24px', marginBottom: '8px' }}></div>
                                                <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '13px' }}>Uploading...</span>
                                            </>
                                        ) : (
                                            <>
                                                <svg style={{ width: '32px', height: '32px', color: 'rgba(255, 255, 255, 0.4)', marginBottom: '8px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                </svg>
                                                <span style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '13px', textAlign: 'center' }}>
                                                    Click to upload certificate
                                                </span>
                                                <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '11px', marginTop: '4px' }}>
                                                    PDF or image of your certificate
                                                </span>
                                            </>
                                        )}
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.pdf"
                                            onChange={handleDocumentUpload}
                                            disabled={uploadingDocument}
                                            style={{ display: 'none' }}
                                        />
                                    </label>
                                )}
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '6px' }}>Notes</label>
                                <textarea
                                    className="glass-input"
                                    placeholder="Additional notes or comments..."
                                    value={editFormData.notes || ''}
                                    onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                                    rows="3"
                                    style={{ width: '100%', resize: 'vertical' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                            <button
                                onClick={() => { setEditingCompetency(null); setEditFormData({}); }}
                                className="btn btn--secondary"
                                style={{ flex: 1 }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveCompetency}
                                className="btn btn--primary"
                                style={{ flex: 1 }}
                                disabled={saving}
                            >
                                {saving ? 'Saving...' : (editingCompetency.isNew ? 'Add Certification' : 'Save Changes')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
