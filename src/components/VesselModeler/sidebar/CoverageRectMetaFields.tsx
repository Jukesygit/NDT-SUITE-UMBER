import { COVERAGE_TECHNIQUES, type CoverageRectConfig } from '../types';

export interface CoverageRectMetaFieldsProps {
  rect: CoverageRectConfig;
  onUpdate: (id: number, updates: Partial<CoverageRectConfig>) => void;
}

/**
 * Scope guidance on a coverage rect: prescribed technique + inspector note
 * (design 2026-08-17, "Rect metadata"). Coverage rects are where/how
 * instructions, never measured against scans — this is the "how".
 *
 * All three fields are spec-declared OPTIONAL, so clearing an input removes the
 * key entirely and a rect that never carried metadata keeps saving byte-identical.
 * Writes go through the normal rect updater, so they coalesce and undo per field.
 */
export function CoverageRectMetaFields({ rect, onUpdate }: CoverageRectMetaFieldsProps) {
    return (
        <>
            <div className="vm-control-group">
                <div className="vm-label"><span>Technique</span></div>
                <select
                    className="vm-select"
                    value={rect.technique ?? ''}
                    onChange={e => onUpdate(rect.id, {
                        technique: (e.target.value || undefined) as CoverageRectConfig['technique'],
                        // Free text only belongs to 'other'; drop it on any other choice.
                        ...(e.target.value === 'other' ? {} : { techniqueOther: undefined }),
                    })}
                >
                    <option value="">Unspecified</option>
                    {COVERAGE_TECHNIQUES.map(t => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                </select>
            </div>

            {rect.technique === 'other' && (
                <div className="vm-control-group">
                    <div className="vm-label"><span>Technique detail</span></div>
                    <input
                        className="vm-input"
                        value={rect.techniqueOther ?? ''}
                        placeholder="Describe the technique"
                        onChange={e => onUpdate(rect.id, { techniqueOther: e.target.value || undefined })}
                    />
                </div>
            )}

            <div className="vm-control-group">
                <div className="vm-label"><span>Note</span></div>
                <textarea
                    className="vm-input vm-cov-note"
                    value={rect.note ?? ''}
                    rows={2}
                    placeholder="Instruction for the inspector"
                    onChange={e => onUpdate(rect.id, { note: e.target.value || undefined })}
                />
            </div>
        </>
    );
}
