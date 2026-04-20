import { useState, useCallback } from 'react';
import CollapsibleSection from './CollapsibleSection';
import { useUpdateProjectVessel } from '../../../hooks/mutations/useInspectionProjectMutations';
import type { ProjectVessel, SignoffDetails, SignoffPerson } from '../../../types/inspection-project';

interface SignoffSectionProps {
    vessel: ProjectVessel;
    projectId: string;
}

type SignoffRole = 'technician' | 'reviewer' | 'client';

const ROLES: { key: SignoffRole; label: string; fields: { key: keyof SignoffPerson; label: string }[] }[] = [
    {
        key: 'technician',
        label: 'Technician',
        fields: [
            { key: 'name', label: 'Name' },
            { key: 'qualification', label: 'Qualification' },
            { key: 'date', label: 'Date' },
        ],
    },
    {
        key: 'reviewer',
        label: 'Reviewer',
        fields: [
            { key: 'name', label: 'Name' },
            { key: 'qualification', label: 'Qualification' },
            { key: 'date', label: 'Date' },
        ],
    },
    {
        key: 'client',
        label: 'Client Acceptance',
        fields: [
            { key: 'name', label: 'Name' },
            { key: 'position', label: 'Position' },
            { key: 'date', label: 'Date' },
        ],
    },
];

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    background: 'var(--surface-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)' as any,
    color: 'var(--text-primary)',
    fontSize: '0.85rem',
};

export default function SignoffSection({ vessel, projectId }: SignoffSectionProps) {
    const updateVessel = useUpdateProjectVessel();
    const [details, setDetails] = useState<SignoffDetails>(vessel.signoff_details ?? {});

    const handleFieldBlur = useCallback(() => {
        // Only save if the details actually changed from the server value
        if (JSON.stringify(details) === JSON.stringify(vessel.signoff_details ?? {})) return;
        updateVessel.mutate({
            id: vessel.id,
            projectId,
            params: { signoffDetails: details },
        });
    }, [details, vessel.id, vessel.signoff_details, projectId, updateVessel]);

    const updateField = (role: SignoffRole, field: keyof SignoffPerson, value: string) => {
        setDetails((prev) => ({
            ...prev,
            [role]: {
                ...prev[role],
                [field]: value || undefined,
            },
        }));
    };

    return (
        <CollapsibleSection title="Sign-off">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {ROLES.map((role) => (
                    <div key={role.key}>
                        <div
                            style={{
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                color: 'var(--text-secondary)',
                                marginBottom: 10,
                                paddingBottom: 6,
                                borderBottom: '1px solid var(--border-default)',
                            }}
                        >
                            {role.label}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {role.fields.map((field) => (
                                <div key={field.key}>
                                    <label
                                        style={{
                                            display: 'block',
                                            fontSize: '0.75rem',
                                            color: 'var(--text-tertiary)',
                                            marginBottom: 3,
                                            fontWeight: 500,
                                            letterSpacing: '0.02em',
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        {field.label}
                                    </label>
                                    <input
                                        type={field.key === 'date' ? 'date' : 'text'}
                                        value={details[role.key]?.[field.key] ?? ''}
                                        onChange={(e) =>
                                            updateField(role.key, field.key, e.target.value)
                                        }
                                        onBlur={handleFieldBlur}
                                        style={inputStyle}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </CollapsibleSection>
    );
}
