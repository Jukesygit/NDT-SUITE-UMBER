import { useState } from 'react';
import { X } from 'lucide-react';
import type { InspectionImageConfig } from './types';

interface InspectionImageViewerProps {
    image: InspectionImageConfig;
    onClose: () => void;
    onUpdate: (id: number, updates: Partial<InspectionImageConfig>) => void;
}

export default function InspectionImageViewer({ image, onClose, onUpdate }: InspectionImageViewerProps) {
    const [name, setName] = useState(image.name);
    const [description, setDescription] = useState(image.description || '');
    const [date, setDate] = useState(image.date || '');
    const [inspector, setInspector] = useState(image.inspector || '');
    const [method, setMethod] = useState(image.method || '');
    const [result, setResult] = useState(image.result || '');

    const save = () => {
        onUpdate(image.id, { name, description, date, inspector, method, result });
    };

    const handleFieldBlur = () => save();

    return (
        <div
            className="fixed inset-0 flex items-center justify-center"
            style={{ zIndex: 9999, background: 'rgba(0,0,0,0.85)' }}
            onClick={onClose}
        >
            <div
                className="relative flex gap-4 p-4 rounded-lg"
                style={{
                    maxWidth: '90vw',
                    maxHeight: '90vh',
                    background: '#1a1a2e',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute', top: 8, right: 8, zIndex: 1,
                        background: 'rgba(255,255,255,0.1)', border: 'none',
                        borderRadius: 4, padding: '4px 6px', cursor: 'pointer',
                        color: 'rgba(255,255,255,0.7)',
                    }}
                >
                    <X size={18} />
                </button>

                {/* Image */}
                <div style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 300 }}>
                    <img
                        src={image.imageData}
                        alt={image.name}
                        style={{
                            maxWidth: '60vw',
                            maxHeight: '80vh',
                            objectFit: 'contain',
                            borderRadius: 4,
                        }}
                    />
                </div>

                {/* Metadata panel */}
                <div style={{
                    width: 260, flexShrink: 0,
                    display: 'flex', flexDirection: 'column', gap: 10,
                    paddingTop: 4,
                    overflowY: 'auto',
                }}>
                    <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'white', fontWeight: 600 }}>
                        Image Details
                    </h3>

                    <Field label="Name" value={name} onChange={setName} onBlur={handleFieldBlur} />
                    <Field label="Description" value={description} onChange={setDescription} onBlur={handleFieldBlur} multiline />
                    <Field label="Date" value={date} onChange={setDate} onBlur={handleFieldBlur} type="date" />
                    <Field label="Inspector" value={inspector} onChange={setInspector} onBlur={handleFieldBlur} />
                    <Field label="NDT Method" value={method} onChange={setMethod} onBlur={handleFieldBlur} placeholder="e.g. RT, UT, MT, PT, VT" />
                    <Field label="Result" value={result} onChange={setResult} onBlur={handleFieldBlur} placeholder="e.g. Pass, Fail" />

                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>
                        Position: {Math.round(image.pos)} mm &bull; Angle: {Math.round(image.angle)}&deg;
                    </div>
                </div>
            </div>
        </div>
    );
}

function Field({ label, value, onChange, onBlur, multiline, type, placeholder }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    onBlur?: () => void;
    multiline?: boolean;
    type?: string;
    placeholder?: string;
}) {
    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '6px 8px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 4, color: 'white',
        fontSize: '0.8rem', outline: 'none',
    };

    return (
        <div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', marginBottom: 3 }}>{label}</div>
            {multiline ? (
                <textarea
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 50 }}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onBlur={onBlur}
                    placeholder={placeholder}
                />
            ) : (
                <input
                    style={inputStyle}
                    type={type || 'text'}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                    onBlur={onBlur}
                    placeholder={placeholder}
                />
            )}
        </div>
    );
}
