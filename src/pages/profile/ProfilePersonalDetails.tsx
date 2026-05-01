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
    vantage_number: string;
}

interface ProfilePersonalDetailsProps {
    data: ProfileFormData;
    isEditing?: boolean;
    isSaving?: boolean;
    onEditToggle?: () => void;
    onSave?: (data: ProfileFormData) => void;
    onCancel?: () => void;
}

function DisplayField({ label, value }: { label: string; value: string }) {
    return (
        <div className="pf-display-field">
            <span className="pf-display-label">{label}</span>
            <div className="pf-display-value">{value || '-'}</div>
        </div>
    );
}

export function ProfilePersonalDetails({
    data,
    isEditing = false,
    isSaving = false,
    onEditToggle,
    onSave,
    onCancel,
}: ProfilePersonalDetailsProps) {
    const [formData, setFormData] = useState<ProfileFormData>(data);

    const handleEditToggle = useCallback(() => {
        setFormData(data);
        onEditToggle?.();
    }, [data, onEditToggle]);

    const handleSave = useCallback(() => {
        onSave?.(formData);
    }, [formData, onSave]);

    const handleCancel = useCallback(() => {
        setFormData(data);
        onCancel?.();
    }, [data, onCancel]);

    const updateField = (field: keyof ProfileFormData, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    return (
        <div style={{ position: 'relative', zIndex: 1 }}>
            <div className="pf-section-header">
                <h2 className="pf-section-title">Personal Details</h2>
                {!isEditing && onEditToggle && (
                    <button onClick={handleEditToggle} className="pf-btn sm">
                        <svg style={{ width: '12px', height: '12px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                    </button>
                )}
            </div>

            <div className="pf-field-grid">
                {isEditing ? (
                    <FormField label="Mobile Number" type="tel" placeholder="+44 7700 900000" autoComplete="off" value={formData.mobile_number} onChange={(e) => updateField('mobile_number', e.target.value)} containerClassName="mb-0" />
                ) : (
                    <DisplayField label="Mobile Number" value={data.mobile_number} />
                )}

                {isEditing ? (
                    <FormField label="Email Address" type="email" placeholder="example@company.com" value={formData.email_address} onChange={(e) => updateField('email_address', e.target.value)} containerClassName="mb-0" />
                ) : (
                    <DisplayField label="Email Address" value={data.email_address} />
                )}

                <div style={{ gridColumn: 'span 2' }}>
                    {isEditing ? (
                        <FormField label="Home Address" type="text" placeholder="Street, City, Postcode" autoComplete="off" value={formData.home_address} onChange={(e) => updateField('home_address', e.target.value)} containerClassName="mb-0" />
                    ) : (
                        <DisplayField label="Home Address" value={data.home_address} />
                    )}
                </div>

                {isEditing ? (
                    <FormField label="Nearest UK Train Station" type="text" placeholder="e.g., London Victoria" value={formData.nearest_uk_train_station} onChange={(e) => updateField('nearest_uk_train_station', e.target.value)} containerClassName="mb-0" />
                ) : (
                    <DisplayField label="Nearest UK Train Station" value={data.nearest_uk_train_station} />
                )}

                {isEditing ? (
                    <FormField label="Date of Birth" type="date" autoComplete="off" value={formData.date_of_birth} onChange={(e) => updateField('date_of_birth', e.target.value)} containerClassName="mb-0" />
                ) : (
                    <DisplayField label="Date of Birth" value={data.date_of_birth ? new Date(data.date_of_birth).toLocaleDateString() : ''} />
                )}

                {isEditing ? (
                    <FormField label="Next of Kin" type="text" placeholder="Emergency contact name" autoComplete="off" value={formData.next_of_kin} onChange={(e) => updateField('next_of_kin', e.target.value)} containerClassName="mb-0" />
                ) : (
                    <DisplayField label="Next of Kin" value={data.next_of_kin} />
                )}

                {isEditing ? (
                    <FormField label="Emergency Contact Number" type="tel" placeholder="+44 7700 900000" autoComplete="off" value={formData.next_of_kin_emergency_contact_number} onChange={(e) => updateField('next_of_kin_emergency_contact_number', e.target.value)} containerClassName="mb-0" />
                ) : (
                    <DisplayField label="Emergency Contact Number" value={data.next_of_kin_emergency_contact_number} />
                )}

                {isEditing ? (
                    <FormField label="Vantage Number" type="text" placeholder="Enter Vantage number" value={formData.vantage_number} onChange={(e) => updateField('vantage_number', e.target.value)} containerClassName="mb-0" />
                ) : (
                    <DisplayField label="Vantage Number" value={data.vantage_number} />
                )}
            </div>

            {isEditing && (
                <div className="pf-action-bar">
                    <button onClick={handleCancel} className="pf-btn sm" disabled={isSaving}>
                        Cancel
                    </button>
                    <button onClick={handleSave} className="pf-btn sm primary" disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            )}
        </div>
    );
}

export default ProfilePersonalDetails;
