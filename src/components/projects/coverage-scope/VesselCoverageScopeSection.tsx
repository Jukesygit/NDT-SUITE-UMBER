/**
 * VesselCoverageScopeSection — the collapsed shell around the Coverage panel.
 *
 * Its whole job is the chunk boundary. `CoverageScopePanel` reaches three.js,
 * the vessel deserializer and the coverage engine; none of that may sit in the
 * projects chunk, so it is behind `lazy()` AND behind the open state — the
 * import does not even start until someone expands the section, which is the
 * projects-page equivalent of "until the tab opens"
 * (docs/plans/2026-08-17-coverage-comparison-design.md, Surfaces §1).
 *
 * Collapsed by default for the same reason: a vessel page must not pull the 3D
 * engine for a visitor who never looks at coverage.
 */

import { Suspense, lazy, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SectionSpinner } from '../../ui/LoadingSpinner';

const CoverageScopePanel = lazy(() => import('./CoverageScopePanel'));

interface VesselCoverageScopeSectionProps {
  projectId: string;
  projectVesselId: string;
}

export function VesselCoverageScopeSection({
  projectId,
  projectVesselId,
}: VesselCoverageScopeSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pj-collapsible" style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="pj-collapsible-header"
        aria-expanded={open}
      >
        <span className="pj-collapsible-title">Coverage vs Scope</span>
        <ChevronDown
          size={14}
          className="pj-collapsible-chevron"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}
        />
      </button>

      {open && (
        <div className="pj-collapsible-well">
          <div className="pj-collapsible-body">
            <Suspense fallback={<SectionSpinner message="Loading 3D viewer…" />}>
              <CoverageScopePanel projectId={projectId} projectVesselId={projectVesselId} />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
