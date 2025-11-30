/**
 * ProfilePersonalDetails - Editable personal details form/display
 */

import { useState, useCallback } from 'react';
import { FormField } from '../../components/ui';

export interface ProfileFormData {
    username: string;
    email: string;
    mobile_number: string;
    email_address: string;
    home_address: string;
    nearest_uk_train_station: string;
    next_of_kin: string;
    next_of_kin_emergency_contact_number: string;
    date_of_birth: string;
}

interface ProfilePersonalDetailsProps {
    /** Current form data */
    data: ProfileFormData;
    /** Whether currently in edit mode */
    isEditing?: boolean;
    /** Whether save is in progress */
    isSaving?: boolean;
    /** Callback to toggle edit mode */
    onEditToggle?: () => void;
    /** Callback when form is submitted */
    onSave?: (data: ProfileFormData) => void;
    /** Callback when edit is cancelled */
    onCancel?: () => void;
}

/**
 * Edit icon for button
 */
function EditIcon() {
    return (
        <svg
            style={{ width: '14px', height: '14px', marginRight: '4px' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
        >
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
        </svg>
    );
}

/**
 * Display field component for non-edit mode
 */
function DisplayField({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <label
                style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: 'rgba(255, 255, 255, 0.6)',
                    marginBottom: '6px',
                }}
            >
                {label}
            </label>
            <div style={{ color: '#ffffff', fontSize: '15px' }}>{value || '-'}</div>
        </div>
    );
}

/**
 * ProfilePersonalDetails component
 *
 * @example
 * const [isEditing, setIsEditing] = useState(false);
 * const updateProfile = useUpdateProfile();
 *
 * <ProfilePersonalDetails
 *     data={profileFormData}
 *     isEditing={isEditing}
 *     isSaving={updateProfile.isPending}
 *     onEditToggle={() => setIsEditing(!isEditing)}
 *     onSave={(data) => updateProfile.mutate({ userId, data })}
 *     onCancel={() => setIsEditing(false)}
 * />
 */
export function ProfilePersonalDetails({
    data,
    isEditing = false,
    isSaving = false,
    onEditToggle,
    onSave,
    onCancel,
}: ProfilePersonalDetailsProps) {
    // Local form state for editing
    const [formData, setFormData] = useState<ProfileFormData>(data);

    // Reset form when entering edit mode
    const handleEditToggle = useCallback(() => {
        setFormData(data);
        onEditToggle?.();
    }, [data, onEditToggle]);

    // Handle save
    const handleSave = useCallback(() => {
        onSave?.(formData);
    }, [formData, onSave]);

    // Handle cancel
    const handleCancel = useCallback(() => {
        setFormData(data);
        onCancel?.();
    }, [data, onCancel]);

    // Update form field
    const updateField = (field: keyof ProfileFormData, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    return (
        <div className="glass-card" style={{ padding: '24px' }}>
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px',
                    paddingBottom: '16px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                }}
            >
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#ffffff', margin: 0 }}>
                    Personal Details
                </h2>
                {!isEditing && onEditToggle && (
                    <button onClick={handleEditToggle} className="btn btn--secondary btn--sm">
                        <EditIcon />
                        Edit
                    </button>
                )}
            </div>

            {/* Fields Grid */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '16px',
                }}
            >
                {/* Mobile Number */}
                {isEditing ? (
                    <FormField
                        label="Mobile Number"
                        type="tel"
                        placeholder="+44 7700 900000"
                        value={formData.mobile_number}
                        onChange={(e) => updateField('mobile_number', e.target.value)}
                        containerClassName="mb-0"
                    />
                ) : (
                    <DisplayField label="Mobile Number" value={data.mobile_number} />
                )}

                {/* Email Address */}
                {isEditing ? (
                    <FormField
                        label="Email Address"
                        type="email"
                        placeholder="example@company.com"
                        value={formData.email_address}
                        onChange={(e) => updateField('email_address', e.target.value)}
                        containerClassName="mb-0"
                    />
                ) : (
                    <DisplayField label="Email Address" value={data.email_address} />
                )}

                {/* Home Address - spans 2 columns */}
                <div style={{ gridColumn: 'span 2' }}>
                    {isEditing ? (
                        <FormField
                            label="Home Address"
                            type="text"
                            placeholder="Street, City, Postcode"
                            value={formData.home_address}
                            onChange={(e) => updateField('home_address', e.target.value)}
                            containerClassName="mb-0"
                        />
                    ) : (
                        <DisplayField label="Home Address" value={data.home_address} />
                    )}
                </div>

                {/* Nearest UK Train Station */}
                {isEditing ? (
                    <FormField
                        label="Nearest UK Train Station"
                        type="text"
                        placeholder="e.g., London Victoria"
                        value={formData.nearest_uk_train_station}
                        onChange={(e) => updateField('nearest_uk_train_station', e.target.value)}
                        containerClassName="mb-0"
                    />
                ) : (
                    <DisplayField label="Nearest UK Train Station" value={data.nearest_uk_train_station} />
                )}

                {/* Date of Birth */}
                {isEditing ? (
                    <FormField
                        label="Date of Birth"
                        type="date"
                        value={formData.date_of_birth}
                        onChange={(e) => updateField('date_of_birth', e.target.value)}
                        containerClassName="mb-0"
                    />
                ) : (
                    <DisplayField
                        label="Date of Birth"
                        value={data.date_of_birth ? new Date(data.date_of_birth).toLocaleDateString() : ''}
                    />
                )}

                {/* Next of Kin */}
                {isEditing ? (
                    <FormField
                        label="Next of Kin"
                        type="text"
                        placeholder="Emergency contact name"
                        value={formData.next_of_kin}
                        onChange={(e) => updateField('next_of_kin', e.target.value)}
                        containerClassName="mb-0"
                    />
                ) : (
                    <DisplayField label="Next of Kin" value={data.next_of_kin} />
                )}

                {/* Emergency Contact Number */}
                {isEditing ? (
                    <FormField
                        label="Emergency Contact Number"
                        type="tel"
                        placeholder="+44 7700 900000"
                        value={formData.next_of_kin_emergency_contact_number}
                        onChange={(e) => updateField('next_of_kin_emergency_contact_number', e.target.value)}
                        containerClassName="mb-0"
                    />
                ) : (
                    <DisplayField
                        label="Emergency Contact Number"
                        value={data.next_of_kin_emergency_contact_number}
                    />
                )}
            </div>

            {/* Action Buttons (only in edit mode) */}
            {isEditing && (
                <div
                    style={{
                        display: 'flex',
                        gap: '12px',
                        marginTop: '24px',
                        paddingTop: '16px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                        justifyContent: 'flex-end',
                    }}
                >
                    <button
                        onClick={handleCancel}
                        className="btn btn--secondary"
                        disabled={isSaving}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="btn btn--primary"
                        disabled={isSaving}
                    >
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            )}
        </div>
    );
}

export default ProfilePersonalDetails;
