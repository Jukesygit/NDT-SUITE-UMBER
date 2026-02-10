import type { VesselState } from './types';
import { MATERIAL_PRESETS } from './types';

interface StatusBarProps {
    vesselState: VesselState;
}

export default function StatusBar({ vesselState }: StatusBarProps) {
    const { id, length, headRatio, orientation, nozzles, saddles, textures, visuals } = vesselState;
    const matName = MATERIAL_PRESETS[visuals.material]?.name ?? visuals.material;

    return (
        <div className="vm-status-bar">
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <span>ID {id}mm × L {length}mm</span>
                <span style={{ color: 'rgba(255,255,255,0.25)' }}>|</span>
                <span>{orientation === 'horizontal' ? 'Horizontal' : 'Vertical'}</span>
                <span style={{ color: 'rgba(255,255,255,0.25)' }}>|</span>
                <span>Head {headRatio}:1</span>
                <span style={{ color: 'rgba(255,255,255,0.25)' }}>|</span>
                <span>{matName}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <span>{nozzles.length} Nozzle{nozzles.length !== 1 ? 's' : ''}</span>
                <span>{saddles.length} Saddle{saddles.length !== 1 ? 's' : ''}</span>
                <span>{textures.length} Texture{textures.length !== 1 ? 's' : ''}</span>
            </div>
        </div>
    );
}
