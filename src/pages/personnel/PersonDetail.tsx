/**
 * PersonDetail - Personal information display/edit section
 */

import type { Person, Organization } from '../../hooks/queries/usePersonnel';
import { maskPhone, maskDateOfBirth, maskAddress, maskName } from '../../utils/pii-masking';
import { UserIcon, EditIcon, DisplayField, MaskedField } from './PersonnelExpandedRowUtils';
import type { PersonEditData } from './PersonnelExpandedRowUtils';

interface PersonDetailProps {
    person: Person;
    isAdmin: boolean;
    organizations: Organization[];
    editingPerson: boolean;
    personEditData: PersonEditData;
    setPersonEditData: (data: PersonEditData) => void;
    saveError: string | null;
    isSaving: boolean;
    onEdit: () => void;
    onCancel: () => void;
    onSave: () => void;
}

export function PersonDetail({
    person,
    isAdmin,
    organizations,
    editingPerson,
    personEditData,
    setPersonEditData,
    saveError,
    isSaving,
    onEdit,
    onCancel,
    onSave,
}: PersonDetailProps) {
    return (
        <div className="pm-expanded-section" style={{ marginBottom: '20px' }}>
            <h4 className="pm-expanded-title">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <UserIcon />
                    Personal Information
                </div>
                {isAdmin && !editingPerson && (
                    <button
                        onClick={onEdit}
                        className="pm-btn sm"
                    >
                        <EditIcon />
                        Edit
                    </button>
                )}
            </h4>

            <div className="pm-field-grid">
                {editingPerson ? (
                    <>
                        <div className="pm-display-field">
                            <div className="pm-display-label">Username</div>
                            <input
                                type="text"
                                className="pm-input"
                                value={personEditData.username}
                                onChange={(e) =>
                                    setPersonEditData({ ...personEditData, username: e.target.value })
                                }
                            />
                        </div>
                        <div className="pm-display-field">
                            <div className="pm-display-label">Email</div>
                            <input
                                type="email"
                                className="pm-input"
                                value={personEditData.email}
                                onChange={(e) =>
                                    setPersonEditData({ ...personEditData, email: e.target.value })
                                }
                            />
                        </div>
                        <div className="pm-display-field">
                            <div className="pm-display-label">Organization</div>
                            <select
                                className="pm-input"
                                value={personEditData.organization_id}
                                onChange={(e) =>
                                    setPersonEditData({ ...personEditData, organization_id: e.target.value })
                                }
                            >
                                {organizations.map((org) => (
                                    <option key={org.id} value={org.id}>
                                        {org.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="pm-display-field">
                            <div className="pm-display-label">Role</div>
                            <select
                                className="pm-input"
                                value={personEditData.role}
                                onChange={(e) =>
                                    setPersonEditData({ ...personEditData, role: e.target.value })
                                }
                            >
                                <option value="viewer">Viewer</option>
                                <option value="editor">Editor</option>
                                <option value="org_admin">Org Admin</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                        <div className="pm-display-field">
                            <div className="pm-display-label">Mobile Number</div>
                            <input
                                type="tel"
                                className="pm-input"
                                autoComplete="off"
                                value={personEditData.mobile_number}
                                onChange={(e) =>
                                    setPersonEditData({ ...personEditData, mobile_number: e.target.value })
                                }
                            />
                        </div>
                        <div className="pm-display-field">
                            <div className="pm-display-label">Date of Birth</div>
                            <input
                                type="date"
                                className="pm-input"
                                autoComplete="off"
                                value={personEditData.date_of_birth}
                                onChange={(e) =>
                                    setPersonEditData({ ...personEditData, date_of_birth: e.target.value })
                                }
                            />
                        </div>
                        <div className="pm-display-field">
                            <div className="pm-display-label">Home Address</div>
                            <input
                                type="text"
                                className="pm-input"
                                autoComplete="off"
                                value={personEditData.home_address}
                                onChange={(e) =>
                                    setPersonEditData({ ...personEditData, home_address: e.target.value })
                                }
                            />
                        </div>
                        <div className="pm-display-field">
                            <div className="pm-display-label">Nearest UK Train Station</div>
                            <input
                                type="text"
                                className="pm-input"
                                autoComplete="off"
                                value={personEditData.nearest_uk_train_station}
                                onChange={(e) =>
                                    setPersonEditData({ ...personEditData, nearest_uk_train_station: e.target.value })
                                }
                            />
                        </div>
                        <div className="pm-display-field">
                            <div className="pm-display-label">Next of Kin</div>
                            <input
                                type="text"
                                className="pm-input"
                                autoComplete="off"
                                value={personEditData.next_of_kin}
                                onChange={(e) =>
                                    setPersonEditData({ ...personEditData, next_of_kin: e.target.value })
                                }
                            />
                        </div>
                        <div className="pm-display-field">
                            <div className="pm-display-label">Emergency Contact</div>
                            <input
                                type="tel"
                                className="pm-input"
                                autoComplete="off"
                                value={personEditData.next_of_kin_emergency_contact_number}
                                onChange={(e) =>
                                    setPersonEditData({ ...personEditData, next_of_kin_emergency_contact_number: e.target.value })
                                }
                            />
                        </div>
                        <div className="pm-display-field">
                            <div className="pm-display-label">Vantage Number</div>
                            <input
                                type="text"
                                className="pm-input"
                                value={personEditData.vantage_number}
                                onChange={(e) =>
                                    setPersonEditData({ ...personEditData, vantage_number: e.target.value })
                                }
                            />
                        </div>
                    </>
                ) : (
                    <>
                        <DisplayField label="Username" value={person.username} />
                        <DisplayField label="Email" value={person.email} />
                        <DisplayField label="Organization" value={person.organizations?.name || 'Unknown'} />
                        <div className="pm-display-field">
                            <div className="pm-display-label">Role</div>
                            <span className="pm-badge no-dot">{person.role}</span>
                        </div>
                        <MaskedField label="Mobile Number" value={person.mobile_number || '-'} maskedValue={maskPhone(person.mobile_number)} personId={person.id} personName={person.username} />
                        <MaskedField label="Date of Birth" value={person.date_of_birth ? new Date(person.date_of_birth).toLocaleDateString('en-GB') : '-'} maskedValue={maskDateOfBirth(person.date_of_birth)} personId={person.id} personName={person.username} />
                        <MaskedField label="Home Address" value={person.home_address || '-'} maskedValue={maskAddress(person.home_address)} personId={person.id} personName={person.username} />
                        <DisplayField label="Nearest UK Train Station" value={person.nearest_uk_train_station || '-'} />
                        <MaskedField label="Next of Kin" value={person.next_of_kin || '-'} maskedValue={maskName(person.next_of_kin)} personId={person.id} personName={person.username} />
                        <MaskedField label="Emergency Contact" value={person.next_of_kin_emergency_contact_number || '-'} maskedValue={maskPhone(person.next_of_kin_emergency_contact_number)} personId={person.id} personName={person.username} />
                        <DisplayField label="Vantage Number" value={person.vantage_number || '-'} />
                    </>
                )}
            </div>

            {editingPerson && (
                <div style={{ marginTop: '16px' }}>
                    {saveError && (
                        <div
                            style={{
                                padding: '12px',
                                marginBottom: '12px',
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '6px',
                                color: '#ef4444',
                                fontSize: '14px',
                            }}
                        >
                            {saveError}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        <button
                            onClick={onCancel}
                            className="pm-btn sm"
                            disabled={isSaving}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onSave}
                            className="pm-btn primary sm"
                            disabled={isSaving}
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
