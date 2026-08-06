// ---------------------------------------------------------------------------
// Outliner tree builder (C13b) — pure.
//
// Projects the flat VesselState entity collections into a body → category → row
// tree for the OutlinerPanel. Bodies: "Vessel" (main shell) always first, then
// each appendage by its name. Entities route to a body group via `bodyId`
// (undefined ⇒ main shell); collections without a bodyId (saddles, textures,
// inspection images, rulers, pipelines) always land on the main shell. A row's
// `selectAction` is a verbatim SELECT_* descriptor the panel dispatches; its
// `toggleRef` names the visibility callback the panel routes to. No React here.
// ---------------------------------------------------------------------------

import type { VesselState } from './types';
import type { SelectionState } from './engine/vessel-reducer';

/** Verbatim SELECT_* descriptor — a subset of VesselAction the panel dispatches. */
export type OutlinerSelectAction =
  | { type: 'SELECT_NOZZLE'; index: number }
  | { type: 'SELECT_WELD'; index: number }
  | { type: 'SELECT_LUG'; index: number }
  | { type: 'SELECT_SADDLE'; index: number }
  | { type: 'SELECT_APPENDAGE'; index: number }
  | { type: 'SELECT_TEXTURE'; id: number }
  | { type: 'SELECT_RULER'; id: number }
  | { type: 'SELECT_COVERAGE_RECT'; id: number }
  | { type: 'SELECT_INSPECTION_IMAGE'; id: number }
  | { type: 'SELECT_ANNOTATION'; id: number }
  | { type: 'SELECT_SCAN_COMPOSITE'; id: string }
  | { type: 'SELECT_DOME_SCAN'; id: string }
  | { type: 'SELECT_PIPE_SEGMENT'; pipelineId: string; segmentIndex: number };

/** Identifies which per-type visibility toggle the panel should invoke for a row. */
export type OutlinerToggleRef =
  | { kind: 'nozzle'; index: number }
  | { kind: 'weld'; index: number }
  | { kind: 'lug'; index: number }
  | { kind: 'saddle'; index: number }
  | { kind: 'appendage'; index: number }
  | { kind: 'texture'; id: number }
  | { kind: 'ruler'; id: number }
  | { kind: 'coverageRect'; id: number }
  | { kind: 'inspectionImage'; id: number }
  | { kind: 'annotation'; id: number }
  | { kind: 'scanComposite'; id: string }
  | { kind: 'domeScan'; id: string }
  | { kind: 'pipeline'; id: string };

export interface OutlinerRow {
  /** Stable React key, unique across the whole tree. */
  key: string;
  label: string;
  selected: boolean;
  /** Resolved visibility (`visible !== false`). */
  visible: boolean;
  /** Resolved lock (`locked === true`); false for types without a `locked` field. */
  locked: boolean;
  selectAction: OutlinerSelectAction;
  toggleRef: OutlinerToggleRef;
}

export interface OutlinerCategory {
  key: string;
  label: string;
  rows: OutlinerRow[];
}

export interface OutlinerBody {
  /** 'main' for the vessel shell, otherwise the appendage id. */
  key: string;
  label: string;
  selected: boolean;
  visible: boolean;
  locked: boolean;
  /** Appendage headers are selectable/toggleable; the main shell is neither. */
  selectAction?: OutlinerSelectAction;
  toggleRef?: OutlinerToggleRef;
  categories: OutlinerCategory[];
}

export const MAIN_BODY_KEY = 'main';

/** Fixed category order; empty categories are omitted per body. */
const CATEGORY_ORDER: { key: string; label: string }[] = [
  { key: 'nozzles', label: 'Nozzles' },
  { key: 'welds', label: 'Welds' },
  { key: 'lugs', label: 'Lifting lugs' },
  { key: 'saddles', label: 'Saddles' },
  { key: 'scans', label: 'Scans' },
  { key: 'domeScans', label: 'Dome scans' },
  { key: 'annotations', label: 'Annotations' },
  { key: 'coverage', label: 'Coverage' },
  { key: 'images', label: 'Images' },
  { key: 'rulers', label: 'Rulers' },
  { key: 'pipelines', label: 'Pipelines' },
  { key: 'textures', label: 'Textures' },
];

interface FlatEntry {
  bodyKey: string;
  categoryKey: string;
  row: OutlinerRow;
}

/**
 * Build the outliner tree. Iterates every collection once (preserving array
 * order → row order), routes each entity to its owning body, then groups into
 * the fixed category order dropping empties. Index-based rows carry the GLOBAL
 * array index so `selectAction`/`toggleRef` stay valid regardless of body.
 */
export function buildOutlinerTree(
  vessel: VesselState,
  selection: SelectionState
): OutlinerBody[] {
  const entries: FlatEntry[] = [];
  const push = (bodyKey: string | undefined, categoryKey: string, row: OutlinerRow) =>
    entries.push({ bodyKey: bodyKey ?? MAIN_BODY_KEY, categoryKey, row });

  vessel.nozzles.forEach((n, i) => {
    push(n.bodyId, 'nozzles', {
      key: `nozzle:${i}`,
      label: n.name || `Nozzle ${i + 1}`,
      selected: selection.nozzleIndex === i,
      visible: n.visible !== false,
      locked: false,
      selectAction: { type: 'SELECT_NOZZLE', index: i },
      toggleRef: { kind: 'nozzle', index: i },
    });
  });

  vessel.welds.forEach((w, i) => {
    push(w.bodyId, 'welds', {
      key: `weld:${i}`,
      label: w.name || `Weld ${i + 1}`,
      selected: selection.weldIndex === i,
      visible: w.visible !== false,
      locked: false,
      selectAction: { type: 'SELECT_WELD', index: i },
      toggleRef: { kind: 'weld', index: i },
    });
  });

  vessel.liftingLugs.forEach((l, i) => {
    push(l.bodyId, 'lugs', {
      key: `lug:${i}`,
      label: l.name || `Lifting lug ${i + 1}`,
      selected: selection.lugIndex === i,
      visible: l.visible !== false,
      locked: false,
      selectAction: { type: 'SELECT_LUG', index: i },
      toggleRef: { kind: 'lug', index: i },
    });
  });

  // Saddles have no bodyId and no name — always main shell, always numbered.
  vessel.saddles.forEach((s, i) => {
    push(MAIN_BODY_KEY, 'saddles', {
      key: `saddle:${i}`,
      label: `Saddle ${i + 1}`,
      selected: selection.saddleIndex === i,
      visible: s.visible !== false,
      locked: false,
      selectAction: { type: 'SELECT_SADDLE', index: i },
      toggleRef: { kind: 'saddle', index: i },
    });
  });

  vessel.scanComposites.forEach((s, i) => {
    push(s.bodyId, 'scans', {
      key: `scan:${s.id}`,
      label: s.name || `Scan ${i + 1}`,
      selected: selection.scanCompositeId === s.id,
      visible: s.visible !== false,
      locked: false,
      selectAction: { type: 'SELECT_SCAN_COMPOSITE', id: s.id },
      toggleRef: { kind: 'scanComposite', id: s.id },
    });
  });

  (vessel.domeScanComposites ?? []).forEach((s, i) => {
    push(s.bodyId, 'domeScans', {
      key: `dome:${s.id}`,
      label: s.name || `Dome scan ${i + 1}`,
      selected: selection.domeScanId === s.id,
      visible: s.visible !== false,
      locked: false,
      selectAction: { type: 'SELECT_DOME_SCAN', id: s.id },
      toggleRef: { kind: 'domeScan', id: s.id },
    });
  });

  vessel.annotations.forEach((a, i) => {
    push(a.bodyId, 'annotations', {
      key: `annotation:${a.id}`,
      label: a.name || `Annotation ${i + 1}`,
      selected: selection.annotationId === a.id,
      visible: a.visible !== false,
      locked: a.locked === true,
      selectAction: { type: 'SELECT_ANNOTATION', id: a.id },
      toggleRef: { kind: 'annotation', id: a.id },
    });
  });

  vessel.coverageRects.forEach((c, i) => {
    push(c.bodyId, 'coverage', {
      key: `coverage:${c.id}`,
      label: c.name || `Coverage ${i + 1}`,
      selected: selection.coverageRectId === c.id,
      visible: c.visible !== false,
      locked: c.locked === true,
      selectAction: { type: 'SELECT_COVERAGE_RECT', id: c.id },
      toggleRef: { kind: 'coverageRect', id: c.id },
    });
  });

  vessel.inspectionImages.forEach((img, i) => {
    push(MAIN_BODY_KEY, 'images', {
      key: `image:${img.id}`,
      label: img.name || `Image ${i + 1}`,
      selected: selection.inspectionImageId === img.id,
      visible: img.visible !== false,
      locked: img.locked === true,
      selectAction: { type: 'SELECT_INSPECTION_IMAGE', id: img.id },
      toggleRef: { kind: 'inspectionImage', id: img.id },
    });
  });

  vessel.rulers.forEach((r, i) => {
    push(MAIN_BODY_KEY, 'rulers', {
      key: `ruler:${r.id}`,
      label: r.name || `Ruler ${i + 1}`,
      selected: selection.rulerId === r.id,
      visible: r.visible !== false,
      locked: false,
      selectAction: { type: 'SELECT_RULER', id: r.id },
      toggleRef: { kind: 'ruler', id: r.id },
    });
  });

  // Pipelines have no name; select routes through SELECT_PIPE_SEGMENT (segment 0).
  vessel.pipelines.forEach((p, i) => {
    push(MAIN_BODY_KEY, 'pipelines', {
      key: `pipeline:${p.id}`,
      label: `Pipeline ${i + 1}`,
      selected: selection.pipelineId === p.id,
      visible: p.visible !== false,
      locked: p.locked === true,
      selectAction: { type: 'SELECT_PIPE_SEGMENT', pipelineId: p.id, segmentIndex: 0 },
      toggleRef: { kind: 'pipeline', id: p.id },
    });
  });

  vessel.textures.forEach((t, i) => {
    push(MAIN_BODY_KEY, 'textures', {
      key: `texture:${t.id}`,
      label: t.name || `Texture ${i + 1}`,
      selected: selection.textureId === t.id,
      visible: t.visible !== false,
      locked: false,
      selectAction: { type: 'SELECT_TEXTURE', id: t.id },
      toggleRef: { kind: 'texture', id: t.id },
    });
  });

  const categoriesFor = (bodyKey: string): OutlinerCategory[] => {
    const own = entries.filter((e) => e.bodyKey === bodyKey);
    return CATEGORY_ORDER.map(({ key, label }) => ({
      key,
      label,
      rows: own.filter((e) => e.categoryKey === key).map((e) => e.row),
    })).filter((c) => c.rows.length > 0);
  };

  const bodies: OutlinerBody[] = [
    {
      key: MAIN_BODY_KEY,
      label: 'Vessel',
      selected: false,
      visible: true,
      locked: false,
      categories: categoriesFor(MAIN_BODY_KEY),
    },
  ];

  vessel.appendages.forEach((app, appIndex) => {
    bodies.push({
      key: app.id,
      label: app.name,
      selected: selection.appendageIndex === appIndex,
      visible: app.visible !== false,
      locked: app.locked === true,
      selectAction: { type: 'SELECT_APPENDAGE', index: appIndex },
      toggleRef: { kind: 'appendage', index: appIndex },
      categories: categoriesFor(app.id),
    });
  });

  return bodies;
}
