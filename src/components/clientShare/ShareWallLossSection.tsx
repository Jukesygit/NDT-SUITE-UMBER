/**
 * ShareWallLossSection — the published wall-loss distribution on the client page.
 *
 * CONTENT MIRROR of the modeler's `stats/WallLossStatsSection`: the same bins,
 * the same swatch ramp, the same spurious and total rows, the same per-body
 * selector. It deliberately does NOT import that component (nor the worker's
 * types): that section drives a Web Worker off a live `VesselState`, and pulling
 * it in would put editor code in the loginless page's static closure — the thing
 * `npm run verify:share-chunk` exists to forbid. It does not need to, either.
 * The distribution was computed once at publish time from the FULL model, and
 * the bundle carries the finished numbers in its own self-contained wire types;
 * this only formats them. The helpers below are three-line copies on purpose.
 *
 * The client never recomputes: a bundle is an immutable snapshot, and the
 * numbers here are the ones the inspector approved when they published.
 *
 * Absent means absent. No `wallLoss` — an older bundle, a model with no
 * confirmed scans, no wall-loss config — renders no section at all, rather than
 * an empty distribution that reads like "nothing was found".
 */

import { useState } from 'react';
import type { ShareWallLoss, ShareWallLossBin } from './bundle-types';

/** Selector key for the merged, all-bodies view (the default). */
const COMBINED_KEY = 'combined';
/** Selector key for the main shell (its `bodyId` is absent on the wire). */
const MAIN_KEY = 'main';

/** m² number, matching the modeler's panel (2dp, 4dp under 0.01). The unit is
 *  appended by the caller, as it is there. */
function formatArea(m2: number): string {
  return m2 < 0.01 ? m2.toFixed(4) : m2.toFixed(2);
}

/** Percentages, matching the modeler's panel: a non-zero sliver keeps 2dp so it
 *  does not round away to "0.0%". */
function formatPct(pct: number): string {
  return pct < 0.1 && pct > 0 ? pct.toFixed(2) : pct.toFixed(1);
}

/**
 * The bin ramp, green through red.
 *
 * DATA colours, not theme colours, so they are literals rather than
 * `--clean-*` tokens: a bin's colour means "this much wall lost" and must read
 * the same in light and dark, on paper, and beside the modeler's own legend.
 * Copied from the modeler section for the same reason the helpers are.
 */
const BIN_COLORS = [
  'rgba(0, 204, 102, 0.9)',
  'rgba(144, 238, 144, 0.9)',
  'rgba(255, 204, 0, 0.9)',
  'rgba(255, 140, 0, 0.9)',
  'rgba(255, 60, 60, 0.9)',
];

/** Grey, deliberately outside the ramp: spurious readings are not a loss band. */
const SPURIOUS_COLOR = 'rgba(128, 128, 128, 0.6)';

function binColor(index: number, total: number): string {
  if (total <= BIN_COLORS.length) return BIN_COLORS[index] ?? BIN_COLORS[BIN_COLORS.length - 1];
  const t = total > 1 ? index / (total - 1) : 0;
  const mapped = Math.round(t * (BIN_COLORS.length - 1));
  return BIN_COLORS[mapped];
}

/** The bin's own range text when it has one, else the mm pair the custom mode
 *  sets, else the percentage band. */
function binRangeLabel(bin: ShareWallLossBin, mode: string): string {
  if (bin.label) return bin.label;
  if (mode === 'custom' && bin.minMm != null && bin.maxMm != null) {
    return `${bin.minMm.toFixed(1)}–${bin.maxMm.toFixed(1)}`;
  }
  return `${bin.minPct.toFixed(0)}–${bin.maxPct.toFixed(0)}%`;
}

interface ShareWallLossSectionProps {
  /** Absent when the publish could not compute a distribution. */
  wallLoss?: ShareWallLoss;
}

export function ShareWallLossSection({ wallLoss }: ShareWallLossSectionProps) {
  // Combined is the default view. Keys: 'combined', 'main', or an appendage id.
  const [selectedBody, setSelectedBody] = useState<string>(COMBINED_KEY);

  if (!wallLoss || wallLoss.combined.totalDataPoints === 0) return null;

  const { combined, bodies, binNames, binMode, nominalThickness } = wallLoss;
  const appendageBodies = bodies.filter((body) => body.bodyId);
  // Only offer the selector once there is more than the main shell to choose from.
  const showSelector = appendageBodies.length > 0;

  // Fall back to combined if the picked body is not in this bundle — the
  // selection is component state and the vessel can change underneath it.
  const keyFor = (bodyId?: string) => bodyId ?? MAIN_KEY;
  const selectionValid =
    selectedBody === COMBINED_KEY || bodies.some((body) => keyFor(body.bodyId) === selectedBody);
  const effective = selectionValid ? selectedBody : COMBINED_KEY;

  const active =
    effective === COMBINED_KEY
      ? combined
      : (bodies.find((body) => keyFor(body.bodyId) === effective) ?? combined);

  const bins = active.bins;
  const hasSpurious = active.spuriousCount > 0;

  return (
    <div className="cs-wl">
      <div className="cs-wl-head">
        <span className="cs-wl-title">Wall Loss Distribution</span>
        <span className="cs-wl-nominal">Nom. {nominalThickness}mm</span>
        {showSelector && (
          <select
            className="cs-wl-select"
            aria-label="Body"
            value={effective}
            onChange={(event) => setSelectedBody(event.target.value)}
          >
            <option value={COMBINED_KEY}>Combined</option>
            <option value={MAIN_KEY}>Main shell</option>
            {appendageBodies.map((body) => (
              <option key={body.bodyId} value={body.bodyId}>
                {body.name || body.bodyId}
              </option>
            ))}
          </select>
        )}
      </div>

      <table className="cs-wl-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Range</th>
            <th scope="col">Area</th>
            <th scope="col">%</th>
            <th scope="col">Pts</th>
          </tr>
        </thead>
        <tbody>
          {bins.map((bin, i) => (
            <tr key={i}>
              <th scope="row">
                {/* The swatch is a legend key for the 3D view's colouring, and
                    the name beside it says the same thing in words — colour is
                    never the only carrier on this page. */}
                <span
                  className="cs-wl-swatch"
                  style={{ backgroundColor: binColor(i, bins.length) }}
                  aria-hidden="true"
                />
                {binNames?.[i] || bin.label || `Bin ${i + 1}`}
              </th>
              <td data-label="Range">{binRangeLabel(bin, binMode)}</td>
              <td data-label="Area">{formatArea(bin.area)} m&sup2;</td>
              <td data-label="%">{formatPct(bin.areaPercent)}%</td>
              <td data-label="Pts">{bin.count}</td>
            </tr>
          ))}
          {hasSpurious && (
            <tr className="cs-wl-spurious">
              <th scope="row">
                <span
                  className="cs-wl-swatch"
                  style={{ backgroundColor: SPURIOUS_COLOR }}
                  aria-hidden="true"
                />
                <span title="Data points outside all bin ranges">Spurious</span>
              </th>
              <td data-label="Range">Outside</td>
              <td data-label="Area">{formatArea(active.spuriousArea)} m&sup2;</td>
              <td data-label="%">{formatPct(active.spuriousAreaPercent)}%</td>
              <td data-label="Pts">{active.spuriousCount}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          {/* Range has nothing to total; no data-label, so the stacked layout
              drops the cell instead of printing an empty "Range" line. */}
          <tr className="cs-wl-total">
            <th scope="row">Total</th>
            <td />
            <td data-label="Area">{formatArea(active.totalScannedArea)} m&sup2;</td>
            <td data-label="%">100%</td>
            <td data-label="Pts">{active.totalDataPoints}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
