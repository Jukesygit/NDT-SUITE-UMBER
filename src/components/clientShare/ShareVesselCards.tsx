/**
 * ShareVesselCards — the client landing page: one card per published vessel.
 *
 * Each card is readable before anything 3D loads: name, tag, and the coverage
 * rollup as a chip. Opening a vessel is what fetches its model, so a client on a
 * phone downloads one vessel's worth of geometry, not the whole project's.
 *
 * Screenshots are supported by the bundle format but are not captured yet — a
 * card without one falls back to a typographic tile rather than a broken image
 * frame, which is also what an older bundle will hit.
 */

import { ChevronRight } from 'lucide-react';
import { formatCoveragePct } from '../VesselModeler/engine/coverage-comparison';
import type { ShareManifest, ShareManifestVessel } from './bundle-types';

interface ShareVesselCardsProps {
  manifest: ShareManifest;
  /** vesselId → object URL, for bundles that carry screenshots. */
  screenshots: Record<string, string>;
  onOpen: (vessel: ShareManifestVessel) => void;
}

function rollupChip(vessel: ShareManifestVessel): { text: string; tone: string } {
  const { rollup } = vessel;
  if (rollup.tracked === 0) return { text: 'No targets set', tone: 'untracked' };
  const tone = rollup.short > 0 ? 'short' : rollup.near > 0 ? 'near' : 'met';
  return { text: `${formatCoveragePct(rollup.achievedPct)}% achieved`, tone };
}

export function ShareVesselCards({ manifest, screenshots, onOpen }: ShareVesselCardsProps) {
  return (
    <div className="cs-landing">
      <div className="cs-landing-head">
        <h1 className="cs-landing-title">{manifest.project.name}</h1>
        <div className="cs-landing-meta">
          {manifest.project.client && <span>{manifest.project.client}</span>}
          {manifest.project.location && <span>{manifest.project.location}</span>}
          {manifest.project.number && <span>{manifest.project.number}</span>}
        </div>
      </div>

      <div className="cs-card-grid">
        {manifest.vessels.map((vessel) => {
          const chip = rollupChip(vessel);
          const screenshot = screenshots[vessel.id];
          return (
            <button
              key={vessel.id}
              type="button"
              className="cs-card"
              onClick={() => onOpen(vessel)}
            >
              <div className="cs-card-figure">
                {screenshot ? (
                  <img src={screenshot} alt="" className="cs-card-image" />
                ) : (
                  <span className="cs-card-initials" aria-hidden="true">
                    {(vessel.tag || vessel.name).slice(0, 3).toUpperCase()}
                  </span>
                )}
              </div>

              <div className="cs-card-body">
                <span className="cs-card-title">
                  {vessel.tag ? `${vessel.tag} — ` : ''}
                  {vessel.name}
                </span>
                {vessel.type && <span className="cs-card-type">{vessel.type}</span>}
                <span className={`cs-chip cs-chip--${chip.tone}`}>{chip.text}</span>
              </div>

              <ChevronRight size={16} className="cs-card-chevron" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
