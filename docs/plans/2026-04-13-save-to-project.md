# Save to Project — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the VesselModeler to auto-load linked models from the database and provide a "Save to Project" button that persists the model config back.

**Architecture:** Reuse existing `vessel-model-service.ts` + React Query mutation hooks. Add a `useVesselModelByProjectVessel` query hook. Wire auto-load via useEffect in VesselModeler. Add save-to-project callback that creates or updates the model. Rename existing Save/Load to Export/Import JSON.

**Tech Stack:** React Query, Supabase, existing vessel-model-service

---

### Task 1: Add `useVesselModelByProjectVessel` query hook

**Files:**
- Modify: `src/hooks/queries/useVesselModels.ts`

**Step 1: Add the hook**

Add this after the existing `useVesselModel` hook:

```typescript
import {
    listVesselModels,
    getVesselModel,
    getVesselModelByProjectVessel,
    getVesselScanPlacements,
} from '../../services/vessel-model-service';

// ... existing hooks ...

/**
 * Hook for fetching a vessel model linked to a specific project vessel
 */
export function useVesselModelByProjectVessel(projectVesselId: string | null) {
    return useQuery({
        queryKey: ['vesselModels', 'byProjectVessel', projectVesselId],
        queryFn: () => getVesselModelByProjectVessel(projectVesselId!),
        enabled: !!projectVesselId,
        staleTime: 5 * 60 * 1000,
    });
}
```

**Step 2: Build to verify**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/hooks/queries/useVesselModels.ts
git commit -m "feat: add useVesselModelByProjectVessel query hook"
```

---

### Task 2: Auto-load model on mount when project context exists

**Files:**
- Modify: `src/components/VesselModeler/VesselModeler.tsx`

**Step 1: Add imports and query hook call**

After the existing import of `useAuth` (line 40), add:

```typescript
import { useVesselModelByProjectVessel } from '../../hooks/queries/useVesselModels';
```

Inside the component, after `const organizationId = ...` (line 370), add:

```typescript
// Fetch linked model when opened from project context
const { data: linkedModel, isLoading: linkedModelLoading } = useVesselModelByProjectVessel(projectVesselId);
```

**Step 2: Add a ref to track the DB model ID**

Replace the existing `vesselModelIdRef` (line 371):

```typescript
const vesselModelIdRef = useRef<string | null>(null);
```

This ref will hold the DB model ID when loaded/saved, or null when working locally.

**Step 3: Add useEffect to deserialize the linked model into state**

After the query hook call, add a useEffect that fires when `linkedModel` loads:

```typescript
// Auto-load linked model from database
const linkedModelLoadedRef = useRef(false);
useEffect(() => {
    if (!linkedModel?.config || linkedModelLoadedRef.current) return;
    linkedModelLoadedRef.current = true;

    const loadLinkedModel = async () => {
        const projectData = linkedModel.config as any;
        if (!projectData.vessel || !projectData.version) return;

        // Dispose existing textures
        for (const key of Object.keys(textureObjectsRef.current)) {
            textureObjectsRef.current[Number(key)].dispose();
        }
        textureObjectsRef.current = {};

        // Reconstruct Three.js textures
        const renderer = viewportRef.current?.getRenderer();
        const loadedTextures: TextureConfig[] = [];
        const savedTextures = projectData.textures || [];

        if (renderer && savedTextures.length > 0) {
            for (const texData of savedTextures) {
                if (!texData.imageData) continue;
                try {
                    const result = await loadTextureFromData(texData.imageData, renderer);
                    textureObjectsRef.current[Number(texData.id)] = result.texture;
                    loadedTextures.push({
                        id: texData.id,
                        name: texData.name || 'Untitled',
                        imageData: texData.imageData,
                        pos: texData.pos ?? 0,
                        angle: texData.angle ?? 90,
                        scaleX: texData.scaleX ?? 1.0,
                        scaleY: texData.scaleY ?? 1.0,
                        rotation: texData.rotation || 0,
                        flipH: texData.flipH || false,
                        flipV: texData.flipV || false,
                        aspectRatio: result.aspectRatio,
                    });
                } catch {
                    // Skip textures that fail to load
                }
            }
        }

        // Build new state — identical to loadProject() deserialization
        const newState: VesselState = {
            id: projectData.vessel.id || 3000,
            length: projectData.vessel.length || 8000,
            headRatio: projectData.vessel.headRatio || 2.0,
            orientation: projectData.vessel.orientation || 'horizontal',
            vesselName: projectData.vessel.vesselName || '',
            location: projectData.vessel.location || '',
            inspectionDate: projectData.vessel.inspectionDate || '',
            nozzles: (projectData.nozzles || []).map((n: any) => ({
                name: n.name || 'N', pos: n.pos ?? 0, proj: n.proj ?? 200,
                angle: n.angle ?? 90, size: n.size ?? 100,
                orientationMode: n.orientationMode,
                flangeOD: n.flangeOD, flangeThk: n.flangeThk, pipeOD: n.pipeOD, style: n.style,
            })),
            liftingLugs: (projectData.liftingLugs || []).map((l: any) => ({
                name: l.name || 'L', pos: l.pos ?? 0, angle: l.angle ?? 90,
                style: l.style || 'padEye', swl: l.swl || '5t',
                width: l.width, height: l.height,
                thickness: l.thickness, holeDiameter: l.holeDiameter,
            })),
            saddles: (projectData.saddles || []).map((s: any) =>
                typeof s === 'number' ? { pos: s, color: '#2244ff' } : { pos: s.pos, color: s.color || '#2244ff', height: s.height }
            ),
            welds: (projectData.welds || []).map((w: any) => ({
                name: w.name || 'W', type: w.type || 'circumferential',
                pos: w.pos ?? 0, endPos: w.endPos, angle: w.angle,
                color: w.color || '#888888',
            })),
            textures: loadedTextures,
            annotations: (projectData.annotations || []).map((a: any) => ({
                id: a.id || 0, name: a.name || 'A', type: a.type === 'restriction' ? 'restriction' : 'scan',
                pos: a.pos ?? 0, angle: a.angle ?? 90,
                width: a.width ?? 100, height: a.height ?? 100,
                color: a.color || '#ff3333', lineWidth: a.lineWidth ?? 2,
                showLabel: a.showLabel !== false,
                leaderLength: a.leaderLength, labelOffset: a.labelOffset, visible: a.visible, locked: a.locked,
                restrictionNotes: a.restrictionNotes, restrictionImage: a.restrictionImage,
                restrictionImageName: a.restrictionImageName, includeInReport: a.includeInReport,
                attachments: a.attachments ?? [],
            })),
            rulers: (projectData.rulers || []).map((r: any) => ({
                id: r.id || 0, name: r.name || 'R',
                startPos: r.startPos ?? 0, startAngle: r.startAngle ?? 90,
                endPos: r.endPos ?? 100, endAngle: r.endAngle ?? 90,
                color: r.color || '#ffaa00', showLabel: r.showLabel !== false,
            })),
            coverageRects: (projectData.coverageRects || []).map((r: any) => ({
                id: r.id || 0, name: r.name || 'C',
                pos: r.pos ?? 0, angle: r.angle ?? 90,
                width: r.width ?? 300, height: r.height ?? 200,
                color: r.color || '#00cc66', lineWidth: r.lineWidth ?? 2,
                filled: r.filled ?? true, fillOpacity: r.fillOpacity ?? 0.2, locked: r.locked,
            })),
            inspectionImages: (projectData.inspectionImages || []).map((i: any) => ({
                id: i.id || 0, name: i.name || 'IMG', imageData: i.imageData || '',
                pos: i.pos ?? 0, angle: i.angle ?? 90,
                description: i.description, date: i.date,
                inspector: i.inspector, method: i.method, result: i.result,
                leaderLength: i.leaderLength, labelOffset: i.labelOffset, visible: i.visible, locked: i.locked,
            })),
            scanComposites: (projectData.scanComposites || []).map((sc: any) => ({
                id: sc.id || `sc_${Date.now()}`,
                name: sc.name || 'Untitled',
                cloudId: sc.cloudId,
                data: sc.data || [],
                xAxis: sc.xAxis || [],
                yAxis: sc.yAxis || [],
                stats: sc.stats || { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 },
                indexStartMm: sc.indexStartMm ?? 0,
                datumAngleDeg: sc.datumAngleDeg ?? 0,
                scanDirection: sc.scanDirection || 'cw',
                indexDirection: sc.indexDirection || 'forward',
                orientationConfirmed: sc.orientationConfirmed ?? true,
                colorScale: sc.colorScale || 'Jet',
                rangeMin: sc.rangeMin ?? null,
                rangeMax: sc.rangeMax ?? null,
                opacity: sc.opacity ?? 1,
                sourceNdeFile: sc.sourceNdeFile,
                sourceFiles: sc.sourceFiles,
            })),
            pipelines: (projectData.pipelines || []).map((p: any) => ({
                id: p.id || crypto.randomUUID(),
                nozzleIndex: p.nozzleIndex ?? 0,
                pipeDiameter: p.pipeDiameter ?? 100,
                color: p.color,
                segments: (p.segments || []).map((s: any) => ({
                    id: s.id || crypto.randomUUID(),
                    type: s.type || 'straight',
                    rotation: s.rotation ?? 0,
                    length: s.length, angle: s.angle, bendRadius: s.bendRadius,
                    endDiameter: s.endDiameter, branchDiameter: s.branchDiameter, style: s.style,
                })),
                locked: p.locked, visible: p.visible,
            })),
            referenceDrawings: (projectData.referenceDrawings || []).map((d: any) => ({
                id: d.id || Date.now(), title: d.title || '', imageData: d.imageData || '', fileName: d.fileName || '',
            })),
            measurementConfig: {
                ...DEFAULT_VESSEL_STATE.measurementConfig,
                ...(projectData.measurementConfig || {}),
            },
            hasModel: true,
            visuals: { ...DEFAULT_VESSEL_STATE.visuals, ...(projectData.visuals || {}) },
        };

        clearHeatmapCache();

        const maxId = loadedTextures.reduce((max: number, t: TextureConfig) => Math.max(max, Number(t.id) || 0), 0);
        nextTextureIdRef.current = maxId + 1;
        const maxAnnId = newState.annotations.reduce((max: number, a: AnnotationShapeConfig) => Math.max(max, a.id || 0), 0);
        nextAnnotationIdRef.current = maxAnnId + 1;
        const maxCovId = newState.coverageRects.reduce((max: number, r: CoverageRectConfig) => Math.max(max, r.id || 0), 0);
        nextCoverageRectIdRef.current = maxCovId + 1;
        const maxRulerId = newState.rulers.reduce((max: number, r: RulerConfig) => Math.max(max, r.id || 0), 0);
        nextRulerIdRef.current = maxRulerId + 1;
        const maxImgId = newState.inspectionImages.reduce((max: number, i: InspectionImageConfig) => Math.max(max, i.id || 0), 0);
        nextInspectionImageIdRef.current = maxImgId + 1;

        vesselModelIdRef.current = linkedModel.id;
        const validatedState = validateVesselState(newState);
        dispatch({ type: 'SET_VESSEL', vessel: validatedState });
        setTextureObjectsVersion(v => v + 1);
    };

    loadLinkedModel();
}, [linkedModel]);
```

**Step 4: Show loading state**

In the return JSX, after the project context banner (line 1977-1986), add a loading overlay when the model is being fetched:

```typescript
{linkedModelLoading && projectVesselId && (
    <div className="absolute inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.7)' }}>
        <div style={{ color: '#60a5fa', fontSize: '0.9rem' }}>Loading model from project...</div>
    </div>
)}
```

**Step 5: Build to verify**

Run: `npm run build`
Expected: No errors

**Step 6: Commit**

```bash
git add src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat: auto-load linked vessel model from project on mount"
```

---

### Task 3: Add `saveToProject` callback and UI button

**Files:**
- Modify: `src/components/VesselModeler/VesselModeler.tsx`

**Step 1: Add mutation imports**

After the `useVesselModelByProjectVessel` import, add:

```typescript
import { useSaveVesselModel, useUpdateVesselModel } from '../../hooks/mutations/useVesselModelMutations';
```

Inside the component, after the `linkedModel` query hook, add:

```typescript
const saveModelMutation = useSaveVesselModel();
const updateModelMutation = useUpdateVesselModel();
const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
```

**Step 2: Add the `saveToProject` callback**

Place it after the existing `saveProject` callback (after line 1190):

```typescript
const saveToProject = useCallback(async () => {
    if (!projectVesselId || !user) return;

    setSaveStatus('saving');
    try {
        // Reuse the same serialization as saveProject()
        const config = {
            version: 1,
            timestamp: new Date().toISOString(),
            vessel: {
                id: vesselState.id,
                length: vesselState.length,
                headRatio: vesselState.headRatio,
                orientation: vesselState.orientation,
                vesselName: vesselState.vesselName,
                location: vesselState.location,
                inspectionDate: vesselState.inspectionDate,
            },
            nozzles: vesselState.nozzles.map(n => ({
                name: n.name, pos: n.pos, proj: n.proj,
                angle: n.angle, size: n.size,
                orientationMode: n.orientationMode,
                flangeOD: n.flangeOD, flangeThk: n.flangeThk, pipeOD: n.pipeOD, style: n.style,
            })),
            liftingLugs: vesselState.liftingLugs.map(l => ({
                name: l.name, pos: l.pos, angle: l.angle,
                style: l.style, swl: l.swl,
                width: l.width, height: l.height,
                thickness: l.thickness, holeDiameter: l.holeDiameter,
            })),
            saddles: vesselState.saddles.map(s => ({
                pos: s.pos, color: s.color || '#2244ff',
                height: s.height,
            })),
            welds: vesselState.welds.map(w => ({
                name: w.name, type: w.type, pos: w.pos,
                endPos: w.endPos, angle: w.angle, color: w.color,
            })),
            textures: vesselState.textures.map(t => ({
                id: t.id, name: t.name, imageData: t.imageData,
                pos: t.pos, angle: t.angle,
                scaleX: t.scaleX || 1.0, scaleY: t.scaleY || 1.0,
                rotation: t.rotation || 0,
                flipH: t.flipH || false, flipV: t.flipV || false,
            })),
            annotations: vesselState.annotations.map(a => ({
                id: a.id, name: a.name, type: a.type,
                pos: a.pos, angle: a.angle, width: a.width, height: a.height,
                color: a.color, lineWidth: a.lineWidth, showLabel: a.showLabel,
                leaderLength: a.leaderLength, labelOffset: a.labelOffset, visible: a.visible, locked: a.locked,
                restrictionNotes: a.restrictionNotes, restrictionImage: a.restrictionImage,
                restrictionImageName: a.restrictionImageName, includeInReport: a.includeInReport,
                attachments: a.attachments,
            })),
            rulers: vesselState.rulers.map(r => ({
                id: r.id, name: r.name,
                startPos: r.startPos, startAngle: r.startAngle,
                endPos: r.endPos, endAngle: r.endAngle,
                color: r.color, showLabel: r.showLabel,
            })),
            coverageRects: vesselState.coverageRects.map(r => ({
                id: r.id, name: r.name,
                pos: r.pos, angle: r.angle, width: r.width, height: r.height,
                color: r.color, lineWidth: r.lineWidth,
                filled: r.filled, fillOpacity: r.fillOpacity, locked: r.locked,
            })),
            inspectionImages: vesselState.inspectionImages.map(i => ({
                id: i.id, name: i.name, imageData: i.imageData,
                pos: i.pos, angle: i.angle,
                description: i.description, date: i.date,
                inspector: i.inspector, method: i.method, result: i.result,
                leaderLength: i.leaderLength, labelOffset: i.labelOffset, visible: i.visible, locked: i.locked,
            })),
            scanComposites: vesselState.scanComposites.map(sc => ({
                id: sc.id, name: sc.name, cloudId: sc.cloudId,
                xAxis: sc.xAxis, yAxis: sc.yAxis, stats: sc.stats,
                indexStartMm: sc.indexStartMm, datumAngleDeg: sc.datumAngleDeg,
                scanDirection: sc.scanDirection, indexDirection: sc.indexDirection,
                orientationConfirmed: sc.orientationConfirmed,
                colorScale: sc.colorScale, rangeMin: sc.rangeMin, rangeMax: sc.rangeMax,
                opacity: sc.opacity, sourceNdeFile: sc.sourceNdeFile, sourceFiles: sc.sourceFiles,
            })),
            pipelines: vesselState.pipelines,
            referenceDrawings: vesselState.referenceDrawings ?? [],
            measurementConfig: { ...vesselState.measurementConfig },
            visuals: { ...vesselState.visuals },
        };

        // Sanitize NaN/Infinity
        const sanitized = JSON.parse(JSON.stringify(config, (_key, value) =>
            typeof value === 'number' && !Number.isFinite(value) ? null : value
        ));

        if (vesselModelIdRef.current) {
            // Update existing model
            await updateModelMutation.mutateAsync({
                id: vesselModelIdRef.current,
                config: sanitized,
            });
        } else {
            // Create new model and link to project vessel
            const modelName = vesselState.vesselName || 'Untitled Vessel';
            const newId = await saveModelMutation.mutateAsync({
                name: modelName,
                organizationId: organizationId,
                userId: user.id,
                config: sanitized,
                projectVesselId: projectVesselId,
            });
            vesselModelIdRef.current = newId;
        }

        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
        console.error('Save to project failed:', err);
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
    }
}, [vesselState, projectVesselId, user, organizationId, updateModelMutation, saveModelMutation]);
```

**Step 3: Add the "Save to Project" button and rename existing items in the Actions menu**

In the Actions menu JSX (around line 2284), add the Save to Project button before the divider, and rename existing Save/Load:

Replace the current save/load/export block:
```typescript
<div className="vm-popout-divider" />
<button className="vm-popout-item" onClick={() => { saveProject(); setActionsMenuOpen(false); }}>
    <Save size={14} /> Save Project
</button>
<label className="vm-popout-item" style={{ cursor: 'pointer' }}>
    <Upload size={14} /> Load Project
    <input type="file" accept=".json" onChange={(e) => { loadProject(e); setActionsMenuOpen(false); }} style={{ display: 'none' }} />
</label>
<div className="vm-popout-divider" />
<button className="vm-popout-item" onClick={() => { exportGLB(); setActionsMenuOpen(false); }}>
    <Box size={14} /> 3D Export
</button>
```

With:
```typescript
{projectVesselId && (
    <>
        <div className="vm-popout-divider" />
        <button
            className="vm-popout-item"
            onClick={() => { saveToProject(); setActionsMenuOpen(false); }}
            disabled={saveStatus === 'saving'}
        >
            <FolderOpen size={14} />
            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Save Failed' : 'Save to Project'}
        </button>
    </>
)}
<div className="vm-popout-divider" />
<button className="vm-popout-item" onClick={() => { saveProject(); setActionsMenuOpen(false); }}>
    <Save size={14} /> Export JSON
</button>
<label className="vm-popout-item" style={{ cursor: 'pointer' }}>
    <Upload size={14} /> Import JSON
    <input type="file" accept=".json" onChange={(e) => { loadProject(e); setActionsMenuOpen(false); }} style={{ display: 'none' }} />
</label>
<div className="vm-popout-divider" />
<button className="vm-popout-item" onClick={() => { exportGLB(); setActionsMenuOpen(false); }}>
    <Box size={14} /> 3D Export
</button>
```

**Step 4: Add `CloudUpload` to lucide imports**

The existing `FolderOpen` icon works for the save-to-project button. No new icons needed.

**Step 5: Build to verify**

Run: `npm run build`
Expected: No errors

**Step 6: Commit**

```bash
git add src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat: add Save to Project button and rename local save/load to Export/Import JSON"
```

---

### Task 4: Update `vesselModelIdRef` initialization

**Files:**
- Modify: `src/components/VesselModeler/VesselModeler.tsx`

**Context:** The ref was changed from `crypto.randomUUID()` to `null` in Task 2. Any existing code that reads `vesselModelIdRef.current` (e.g., annotation attachment uploads that use it as a folder key) needs to handle the null case. Search for all usages and update.

**Step 1: Find all usages of vesselModelIdRef / vesselModelId**

Search the file for `vesselModelId` (not the ref) — the old code aliases it at line 372:
```typescript
const vesselModelId = vesselModelIdRef.current;
```

This is used in the annotation attachment upload calls. Since the model might not have a DB ID yet, generate a local fallback:

```typescript
const vesselModelId = vesselModelIdRef.current ?? `local-${crypto.randomUUID()}`;
```

This keeps attachment uploads working even before the first save-to-project.

**Step 2: Build to verify**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/VesselModeler/VesselModeler.tsx
git commit -m "fix: handle null vesselModelId for attachment uploads before first save"
```

---

### Task 5: Final build and manual test

**Step 1: Full build**

Run: `npm run build`
Expected: Clean build, no errors

**Step 2: Manual test plan**

1. Open modeler directly (`/vessel-modeler`) — should start empty, no "Save to Project" in Actions
2. Open modeler from project with no linked model (`/vessel-modeler?project=X&vessel=Y`) — should start empty, "Save to Project" visible
3. Make changes, click "Save to Project" — should show "Saving..." then "Saved!", model created in DB
4. Navigate away and come back — model should auto-load
5. Make more changes, save again — should update (not create duplicate)
6. "Export JSON" / "Import JSON" — should still work as before
7. "3D Export" — should still work

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: complete save-to-project workflow for VesselModeler"
```
