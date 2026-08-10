import type { AppendageConfig } from '../types';

interface MountedOnChipProps {
  appendages: AppendageConfig[];
  /** undefined = main vessel; otherwise the boot body id. */
  bodyId?: string;
}

/**
 * Read-only "Mounted on" chip shown in an attachable's edit form. Replaces the old
 * "Mount on" <select> (R2): mounting is now cursor-first — drag the item across the
 * junction to move it between the vessel and a boot, so there is nothing to pick.
 *
 * Rendered only when the model actually has boots, exactly like the gated select it
 * replaces — so a single-body vessel shows nothing and its edit form is unchanged.
 * The main shell reads "Vessel"; a boot reads its own name (e.g. "Boot 1").
 */
export function MountedOnChip({ appendages, bodyId }: MountedOnChipProps) {
  if (appendages.length === 0) return null;
  const name =
    bodyId === undefined ? 'Vessel' : (appendages.find((a) => a.id === bodyId)?.name ?? 'Vessel');

  return (
    <div className="vm-control-group">
      <div className="vm-label">
        <span>Mounted on</span>
      </div>
      <span
        title="Drag the item across the junction to move it between the vessel and a boot."
        style={{
          display: 'inline-block',
          alignSelf: 'flex-start',
          padding: '2px 10px',
          borderRadius: 999,
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'rgba(255,255,255,0.75)',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        On: {name}
      </span>
    </div>
  );
}
