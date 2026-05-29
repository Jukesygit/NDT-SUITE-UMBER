export type ViewMode = 'trips' | 'assets';

interface ProjectViewToggleProps {
    viewMode: ViewMode;
    onChange: (mode: ViewMode) => void;
}

export function ProjectViewToggle({ viewMode, onChange }: ProjectViewToggleProps) {
    return (
        <div className="pj-tabs-well">
            {(['trips', 'assets'] as ViewMode[]).map(mode => (
                <button
                    key={mode}
                    onClick={() => onChange(mode)}
                    className={`pj-tab ${viewMode === mode ? 'active' : ''}`}
                >
                    {mode === 'trips' ? 'Trips' : 'Assets'}
                </button>
            ))}
        </div>
    );
}
