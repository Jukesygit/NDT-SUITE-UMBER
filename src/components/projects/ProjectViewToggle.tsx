/**
 * ProjectViewToggle - Segmented control for switching between Trip and Asset views
 */

export type ViewMode = 'trips' | 'assets';

interface ProjectViewToggleProps {
    viewMode: ViewMode;
    onChange: (mode: ViewMode) => void;
}

export function ProjectViewToggle({ viewMode, onChange }: ProjectViewToggleProps) {
    return (
        <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 2 }}>
            {(['trips', 'assets'] as ViewMode[]).map(mode => (
                <button
                    key={mode}
                    onClick={() => onChange(mode)}
                    style={{
                        padding: '6px 14px',
                        borderRadius: 6,
                        border: 'none',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        background: viewMode === mode ? 'rgba(59,130,246,0.2)' : 'transparent',
                        color: viewMode === mode ? '#60a5fa' : 'rgba(255,255,255,0.5)',
                        transition: 'all 0.15s',
                    }}
                >
                    {mode === 'trips' ? 'Trips' : 'Assets'}
                </button>
            ))}
        </div>
    );
}
