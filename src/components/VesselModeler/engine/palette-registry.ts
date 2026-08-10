// =============================================================================
// Vessel Modeler — Command palette registry (pure) for C14
// =============================================================================
// Projects the vessel state into a flat, searchable list of PaletteItems: one
// per entity (every collection) plus commands for canonical views, camera
// bookmarks, view-mode switches, the toggles, and undo/redo. Each item carries a
// serializable PaletteAction descriptor the VesselModeler executor switches on.
//
// Pure: no THREE, no React, no scene access. Entity SELECT_* descriptors reuse
// the outliner vocabulary (OutlinerSelectAction); the optional `frame` ref reuses
// frame-entity's FrameEntityRef so a select can fly the camera. Both are imported
// as types only, so this module stays free of THREE and safe to unit-test alone.
// =============================================================================

import type { VesselState } from '../types';
import type { OutlinerSelectAction } from '../outliner-tree';
import type { FrameEntityRef } from './frame-entity';
import type { CanonicalViewId } from './canonical-views';

/** The transient/UI toggles the palette can flip (mirrors the reducer actions). */
export type PaletteToggle =
  | 'snap'
  | 'tidy'
  | 'outliner'
  | 'statsCoverage'
  | 'statsWallLoss'
  | 'statsScanCoverage';

export type PaletteViewMode = '3d' | 'flattened' | 'topo';

/** Serializable descriptor union executed by VesselModeler's handlePaletteAction. */
export type PaletteAction =
  | { select: OutlinerSelectAction; frame?: FrameEntityRef }
  | { view: CanonicalViewId }
  | { bookmark: string }
  | { toggle: PaletteToggle }
  | { viewMode: PaletteViewMode }
  | { undo: true }
  | { redo: true };

export interface PaletteItem {
  /** Stable, unique across the whole registry. */
  id: string;
  kind: 'entity' | 'command';
  label: string;
  /** Extra search terms (name, id, type word, body name, synonyms). */
  keywords: string[];
  action: PaletteAction;
}

export interface PaletteContext {
  /** When false the Topo view-mode command is omitted (no relief grid available). */
  topoEnabled: boolean;
}

/** Max items returned by {@link filterPaletteItems}. */
export const PALETTE_RESULT_CAP = 30;

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function clean(keywords: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keywords) {
    if (!k) continue;
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

/**
 * Build the full palette registry: every entity followed by every command. Body
 * names feed keywords so "Boot 1" matches boot-mounted entities. Pure; rebuilt
 * cheaply on each vessel change.
 */
export function buildPaletteItems(state: VesselState, ctx: PaletteContext): PaletteItem[] {
  const items: PaletteItem[] = [];

  const bodyName = (bodyId?: string): string =>
    bodyId === undefined
      ? 'Vessel'
      : (state.appendages.find((a) => a.id === bodyId)?.name ?? 'Boot');

  const entity = (
    id: string,
    label: string,
    keywords: (string | undefined)[],
    select: OutlinerSelectAction,
    frame: FrameEntityRef,
  ): void => {
    items.push({ id, kind: 'entity', label, keywords: clean(keywords), action: { select, frame } });
  };

  // --- Entities (every collection, array order) ---
  state.nozzles.forEach((n, i) => {
    const label = n.name || `Nozzle ${i + 1}`;
    entity(
      `ent:nozzle:${i}`,
      label,
      [label, n.name, n.id, 'nozzle', bodyName(n.bodyId)],
      { type: 'SELECT_NOZZLE', index: i },
      { type: 'nozzle', index: i },
    );
  });

  state.welds.forEach((w, i) => {
    const label = w.name || `Weld ${i + 1}`;
    entity(
      `ent:weld:${i}`,
      label,
      [label, w.name, 'weld', w.type, bodyName(w.bodyId)],
      { type: 'SELECT_WELD', index: i },
      { type: 'weld', index: i },
    );
  });

  state.liftingLugs.forEach((l, i) => {
    const label = l.name || `Lifting lug ${i + 1}`;
    entity(
      `ent:lug:${i}`,
      label,
      [label, l.name, 'lifting lug', 'lug', l.swl, bodyName(l.bodyId)],
      { type: 'SELECT_LUG', index: i },
      { type: 'lug', index: i },
    );
  });

  state.saddles.forEach((_s, i) => {
    const label = `Saddle ${i + 1}`;
    entity(
      `ent:saddle:${i}`,
      label,
      [label, 'saddle', 'support', 'Vessel'],
      { type: 'SELECT_SADDLE', index: i },
      { type: 'saddle', index: i },
    );
  });

  state.appendages.forEach((app, i) => {
    entity(
      `ent:appendage:${i}`,
      app.name,
      [app.name, app.id, 'boot', 'appendage', 'sump'],
      { type: 'SELECT_APPENDAGE', index: i },
      { type: 'appendage', index: i },
    );
  });

  state.scanComposites.forEach((s, i) => {
    const label = s.name || `Scan ${i + 1}`;
    entity(
      `ent:scan:${s.id}`,
      label,
      [label, s.name, 'scan', 'composite', bodyName(s.bodyId)],
      { type: 'SELECT_SCAN_COMPOSITE', id: s.id },
      { type: 'scanComposite', id: s.id },
    );
  });

  state.domeScanComposites.forEach((d, i) => {
    const label = d.name || `Dome scan ${i + 1}`;
    entity(
      `ent:dome:${d.id}`,
      label,
      [label, d.name, 'dome scan', 'dome', bodyName(d.bodyId)],
      { type: 'SELECT_DOME_SCAN', id: d.id },
      { type: 'domeScan', id: d.id },
    );
  });

  state.annotations.forEach((a, i) => {
    const label = a.name || `Annotation ${i + 1}`;
    entity(
      `ent:annotation:${a.id}`,
      label,
      [label, a.name, 'annotation', a.type, bodyName(a.bodyId)],
      { type: 'SELECT_ANNOTATION', id: a.id },
      { type: 'annotation', id: a.id },
    );
  });

  state.coverageRects.forEach((c, i) => {
    const label = c.name || `Coverage ${i + 1}`;
    entity(
      `ent:coverage:${c.id}`,
      label,
      [label, c.name, 'coverage', 'rect', bodyName(c.bodyId)],
      { type: 'SELECT_COVERAGE_RECT', id: c.id },
      { type: 'coverageRect', id: c.id },
    );
  });

  state.inspectionImages.forEach((img, i) => {
    const label = img.name || `Image ${i + 1}`;
    entity(
      `ent:image:${img.id}`,
      label,
      [label, img.name, 'inspection image', 'image', img.method],
      { type: 'SELECT_INSPECTION_IMAGE', id: img.id },
      { type: 'inspectionImage', id: img.id },
    );
  });

  state.rulers.forEach((r, i) => {
    const label = r.name || `Ruler ${i + 1}`;
    entity(
      `ent:ruler:${r.id}`,
      label,
      [label, r.name, 'ruler', 'measurement'],
      { type: 'SELECT_RULER', id: r.id },
      { type: 'ruler', id: r.id },
    );
  });

  state.pipelines.forEach((p, i) => {
    const label = `Pipeline ${i + 1}`;
    entity(
      `ent:pipeline:${p.id}`,
      label,
      [label, 'pipeline', 'pipe'],
      { type: 'SELECT_PIPE_SEGMENT', pipelineId: p.id, segmentIndex: 0 },
      { type: 'pipeline', id: p.id },
    );
  });

  state.textures.forEach((t, i) => {
    const label = t.name || `Texture ${i + 1}`;
    entity(
      `ent:texture:${t.id}`,
      label,
      [label, t.name, 'texture', 'image overlay'],
      { type: 'SELECT_TEXTURE', id: t.id },
      { type: 'texture', id: t.id },
    );
  });

  // --- Commands: canonical views ---
  const command = (id: string, label: string, keywords: string[], action: PaletteAction): void => {
    items.push({ id, kind: 'command', label, keywords: clean(keywords), action });
  };

  const VIEWS: { view: CanonicalViewId; label: string; kw: string[] }[] = [
    { view: 'n', label: 'View North', kw: ['north', 'n', 'view'] },
    { view: 'e', label: 'View East', kw: ['east', 'e', 'view'] },
    { view: 's', label: 'View South', kw: ['south', 's', 'view'] },
    { view: 'w', label: 'View West', kw: ['west', 'w', 'view'] },
    { view: 'top', label: 'View Top', kw: ['top', 'plan', 'view'] },
    { view: 'bottom', label: 'View Bottom', kw: ['bottom', 'underside', 'view'] },
    { view: 'iso', label: 'Isometric view', kw: ['iso', 'isometric', 'home', 'view'] },
    { view: 'tdc', label: 'View TDC', kw: ['tdc', 'top dead centre', 'top dead center', 'view'] },
  ];
  for (const v of VIEWS) command(`cmd:view:${v.view}`, v.label, v.kw, { view: v.view });

  // --- Commands: camera bookmarks ---
  (state.cameraBookmarks ?? []).forEach((bm) => {
    command(`cmd:bookmark:${bm.id}`, `Go to ${bm.name}`, [bm.name, 'bookmark', 'view'], {
      bookmark: bm.id,
    });
  });

  // --- Commands: view modes (Topo omitted when unavailable) ---
  command('cmd:viewMode:3d', '3D view', ['3d', 'model', 'view mode'], { viewMode: '3d' });
  command('cmd:viewMode:flattened', '2D view', ['2d', 'flattened', 'developed', 'strip'], {
    viewMode: 'flattened',
  });
  if (ctx.topoEnabled) {
    command('cmd:viewMode:topo', 'Topo view', ['topo', 'relief', 'topology'], { viewMode: 'topo' });
  }

  // --- Commands: toggles ---
  const TOGGLES: { toggle: PaletteToggle; label: string; kw: string[] }[] = [
    { toggle: 'snap', label: 'Toggle angle snap', kw: ['snap', 'angle'] },
    { toggle: 'tidy', label: 'Toggle tidy labels', kw: ['tidy', 'labels', 'table'] },
    { toggle: 'outliner', label: 'Toggle outliner', kw: ['outliner', 'tree', 'entities'] },
    { toggle: 'statsCoverage', label: 'Toggle coverage stats', kw: ['coverage', 'stats'] },
    { toggle: 'statsWallLoss', label: 'Toggle wall-loss stats', kw: ['wall loss', 'wall-loss', 'stats'] },
    { toggle: 'statsScanCoverage', label: 'Toggle scan-coverage stats', kw: ['scan coverage', 'stats'] },
  ];
  for (const t of TOGGLES) command(`cmd:toggle:${t.toggle}`, t.label, t.kw, { toggle: t.toggle });

  // --- Commands: undo / redo ---
  command('cmd:undo', 'Undo', ['undo', 'back'], { undo: true });
  command('cmd:redo', 'Redo', ['redo', 'forward'], { redo: true });

  return items;
}

// ---------------------------------------------------------------------------
// Filter / rank
// ---------------------------------------------------------------------------

/** Whether `q` appears as an ordered subsequence of `s` (both lowercase). */
function isSubsequence(q: string, s: string): boolean {
  let i = 0;
  for (let j = 0; j < s.length && i < q.length; j++) {
    if (s[j] === q[i]) i++;
  }
  return i === q.length;
}

/**
 * Match tier for one item against a lowercased query (0 = no match):
 *   4 exact-prefix label · 3 substring in label · 2 substring in a keyword ·
 *   1 subsequence in label.
 */
function scoreItem(item: PaletteItem, q: string): number {
  const label = item.label.toLowerCase();
  if (label.startsWith(q)) return 4;
  if (label.includes(q)) return 3;
  if (item.keywords.some((k) => k.toLowerCase().includes(q))) return 2;
  if (isSubsequence(q, label)) return 1;
  return 0;
}

/**
 * Rank + cap the palette items for a query. Empty query → default list with
 * commands first, then entities (both in build order). Non-empty → items that
 * match, sorted by tier (desc), entities above commands on equal tier, then
 * stable by build order. Always capped at {@link PALETTE_RESULT_CAP}.
 */
export function filterPaletteItems(items: PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    const commands = items.filter((i) => i.kind === 'command');
    const entities = items.filter((i) => i.kind === 'entity');
    return [...commands, ...entities].slice(0, PALETTE_RESULT_CAP);
  }

  const scored: { item: PaletteItem; rank: number; index: number }[] = [];
  items.forEach((item, index) => {
    const rank = scoreItem(item, q);
    if (rank > 0) scored.push({ item, rank, index });
  });

  scored.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    const ka = a.item.kind === 'entity' ? 0 : 1;
    const kb = b.item.kind === 'entity' ? 0 : 1;
    if (ka !== kb) return ka - kb;
    return a.index - b.index;
  });

  return scored.slice(0, PALETTE_RESULT_CAP).map((s) => s.item);
}
