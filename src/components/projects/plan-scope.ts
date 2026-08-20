// ---------------------------------------------------------------------------
// "Plan scope" — the single route into the modeler for scope planning.
//
// The design's per-card action is "open the linked model in the modeler; if
// there is none, create a blank default-geometry model, link it, open it"
// (docs/plans/2026-08-17-coverage-comparison-design.md, Surfaces §3). The
// modeler already IS that mechanism: opened with `?project=&vessel=`, its
// persistence hook auto-loads the vessel's linked model when one exists
// (`useVesselPersistence`'s linked-model bootstrap) and otherwise starts on
// default geometry that the first save writes back linked to this vessel. So the
// action is a URL, not a mutation — and no empty `vessel_models` row is minted
// for a planner who opens the modeler and changes their mind.
//
// `model` is passed when the caller already knows which linked model it means,
// which is every surface that has read one; it keeps the choice explicit rather
// than leaving it to the bootstrap's "first linked model" rule.
// ---------------------------------------------------------------------------

export function planScopeUrl(
  projectId: string,
  projectVesselId: string,
  modelId?: string | null
): string {
  const base = `/vessel-modeler?project=${projectId}&vessel=${projectVesselId}`;
  return modelId ? `${base}&model=${modelId}` : base;
}
