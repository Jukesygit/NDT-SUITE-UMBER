import { useState, type ReactNode } from 'react';

interface CollapsibleSectionProps {
    title: string;
    children: ReactNode;
    defaultOpen?: boolean;
}

export default function CollapsibleSection({
    title,
    children,
    defaultOpen = true,
}: CollapsibleSectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div
            style={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
            }}
        >
            <button
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '16px 20px',
                    background: 'var(--surface-elevated)',
                    border: 'none',
                    borderBottom: isOpen ? '1px solid var(--glass-border)' : 'none',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    fontSize: '0.9375rem',
                    fontWeight: 600,
                    textAlign: 'left',
                    letterSpacing: '0.01em',
                    transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--surface-overlay)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--surface-elevated)';
                }}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                        style={{
                            width: 3,
                            height: 18,
                            borderRadius: 2,
                            background: 'var(--accent-primary)',
                            opacity: 0.7,
                            flexShrink: 0,
                        }}
                    />
                    {title}
                </span>
                <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                        transition: 'transform 0.2s ease',
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        flexShrink: 0,
                        opacity: 0.5,
                    }}
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {isOpen && (
                <div style={{ padding: '18px 20px' }}>
                    {children}
                </div>
            )}
        </div>
    );
}
