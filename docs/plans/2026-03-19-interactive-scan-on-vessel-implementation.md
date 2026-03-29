# Interactive C-Scan on Vessel Shell - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable C-scan composites to be saved to Supabase, imported into the vessel modeler with auto-placement/sizing, rendered as interactive heatmap textures with thickness-on-hover.

**Architecture:** New Supabase tables (`scan_composites`, `vessel_models`, `vessel_scan_placements`) with RLS. New service + React Query hooks following existing patterns. Canvas-generated heatmap textures integrated with existing `createTexturePlane()` geometry. Raycaster extended for UV→thickness lookup.

**Tech Stack:** React 18, Three.js, Supabase (jsonb), React Query, Canvas API, TypeScript

**Design doc:** `docs/plans/2026-03-19-interactive-scan-on-vessel-design.md`

---

## Task 1: Database Schema - Supabase Migration

**Files:**
- Create: `database/scan-composite-schema.sql`

**Step 1: Write the migration SQL**

```sql
-- =============================================================================
-- Scan Composites & Vessel Models - Schema
-- =============================================================================
-- Stores C-scan composite data and vessel model configurations in Supabase
-- for cloud-based persistence and cross-tool data sharing.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- scan_composites - Structured C-scan composite data
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scan_composites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    thickness_data JSONB NOT NULL,       -- 2D matrix: number[][] (nulls encoded as null)
    x_axis JSONB NOT NULL,               -- Scan axis coordinates in mm (circumferential)
    y_axis JSONB NOT NULL,               -- Index axis coordinates in mm (longitudinal)
    stats JSONB,                         -- { min, max, mean, median, stdDev, validPoints, ... }
    width INT NOT NULL,                  -- Number of scan axis (x) points
    height INT NOT NULL,                 -- Number of index axis (y) points
    source_files JSONB,                  -- Original CSV filenames and source regions
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_scan_composites_org ON scan_composites(organization_id);
CREATE INDEX idx_scan_composites_created_by ON scan_composites(created_by);

-- RLS
ALTER TABLE scan_composites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org scan composites"
    ON scan_composites FOR SELECT
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert scan composites for own org"
    ON scan_composites FOR INSERT
    TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
        AND created_by = auth.uid()
    );

CREATE POLICY "Users can delete own scan composites"
    ON scan_composites FOR DELETE
    TO authenticated
    USING (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- vessel_models - Vessel configuration (cloud persistence)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vessel_models (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    config JSONB NOT NULL,               -- Full VesselState (dimensions, nozzles, welds, etc.)
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vessel_models_org ON vessel_models(organization_id);
CREATE INDEX idx_vessel_models_created_by ON vessel_models(created_by);

ALTER TABLE vessel_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org vessel models"
    ON vessel_models FOR SELECT
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert vessel models for own org"
    ON vessel_models FOR INSERT
    TO authenticated
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM profiles WHERE id = auth.uid()
        )
        AND created_by = auth.uid()
    );

CREATE POLICY "Users can update own vessel models"
    ON vessel_models FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid());

CREATE POLICY "Users can delete own vessel models"
    ON vessel_models FOR DELETE
    TO authenticated
    USING (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- vessel_scan_placements - Links composites to vessel models with position
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vessel_scan_placements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    vessel_model_id UUID NOT NULL REFERENCES vessel_models(id) ON DELETE CASCADE,
    scan_composite_id UUID NOT NULL REFERENCES scan_composites(id) ON DELETE CASCADE,
    index_start_mm DOUBLE PRECISION NOT NULL,   -- Longitudinal start position on vessel
    scan_direction TEXT NOT NULL DEFAULT 'cw',   -- 'cw' or 'ccw' from TDC
    index_direction TEXT NOT NULL DEFAULT 'forward', -- 'forward' or 'reverse'
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT valid_scan_direction CHECK (scan_direction IN ('cw', 'ccw')),
    CONSTRAINT valid_index_direction CHECK (index_direction IN ('forward', 'reverse'))
);

CREATE INDEX idx_vessel_scan_placements_vessel ON vessel_scan_placements(vessel_model_id);
CREATE INDEX idx_vessel_scan_placements_scan ON vessel_scan_placements(scan_composite_id);

ALTER TABLE vessel_scan_placements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view placements for own org vessels"
    ON vessel_scan_placements FOR SELECT
    TO authenticated
    USING (
        vessel_model_id IN (
            SELECT id FROM vessel_models
            WHERE organization_id IN (
                SELECT organization_id FROM profiles WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Users can manage placements on own vessels"
    ON vessel_scan_placements FOR ALL
    TO authenticated
    USING (
        vessel_model_id IN (
            SELECT id FROM vessel_models WHERE created_by = auth.uid()
        )
    );

-- Updated_at trigger for vessel_models
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_vessel_models_updated_at
    BEFORE UPDATE ON vessel_models
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

**Step 2: Apply to Supabase**

Run this SQL in the Supabase dashboard SQL editor or via CLI.

**Step 3: Commit**

```bash
git add database/scan-composite-schema.sql
git commit -m "feat: add database schema for scan composites and vessel models"
```

---

## Task 2: Service Layer - Scan Composite Service

**Files:**
- Create: `src/services/scan-composite-service.ts`

**Step 1: Write the service**

```typescript
// =============================================================================
// Scan Composite Service
// =============================================================================
// CRUD operations for scan composites stored in Supabase.
// Follows the same pattern as competency-service.js / activity-log-service.ts.
// =============================================================================

import { supabase, isSupabaseConfigured } from '../supabase-client.js';

export interface ScanCompositeRecord {
  id: string;
  name: string;
  organization_id: string;
  created_by: string;
  thickness_data: (number | null)[][];
  x_axis: number[];
  y_axis: number[];
  stats: {
    min: number;
    max: number;
    mean: number;
    median: number;
    stdDev: number;
    validPoints: number;
    totalPoints: number;
    totalArea: number;
    validArea: number;
    ndPercent: number;
    ndCount: number;
    ndArea: number;
  } | null;
  width: number;
  height: number;
  source_files: { filename: string; minX: number; maxX: number; minY: number; maxY: number }[] | null;
  created_at: string;
}

/** Summary for list views (excludes the large thickness_data payload) */
export interface ScanCompositeSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  stats: ScanCompositeRecord['stats'];
  x_axis: number[];
  y_axis: number[];
  source_files: ScanCompositeRecord['source_files'];
  created_at: string;
  created_by: string;
}

export interface SaveScanCompositeParams {
  name: string;
  organizationId: string;
  userId: string;
  thicknessData: (number | null)[][];
  xAxis: number[];
  yAxis: number[];
  stats: ScanCompositeRecord['stats'];
  width: number;
  height: number;
  sourceFiles: ScanCompositeRecord['source_files'];
}

/** Save a composite to Supabase */
export async function saveScanComposite(params: SaveScanCompositeParams): Promise<string> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const { data, error } = await supabase!
    .from('scan_composites')
    .insert({
      name: params.name,
      organization_id: params.organizationId,
      created_by: params.userId,
      thickness_data: params.thicknessData,
      x_axis: params.xAxis,
      y_axis: params.yAxis,
      stats: params.stats,
      width: params.width,
      height: params.height,
      source_files: params.sourceFiles,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

/** List composites for the user's organization (without thickness data) */
export async function listScanComposites(): Promise<ScanCompositeSummary[]> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const { data, error } = await supabase!
    .from('scan_composites')
    .select('id, name, width, height, stats, x_axis, y_axis, source_files, created_at, created_by')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

/** Fetch a single composite with full thickness data */
export async function getScanComposite(id: string): Promise<ScanCompositeRecord> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const { data, error } = await supabase!
    .from('scan_composites')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

/** Delete a composite */
export async function deleteScanComposite(id: string): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const { error } = await supabase!
    .from('scan_composites')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
```

**Step 2: Commit**

```bash
git add src/services/scan-composite-service.ts
git commit -m "feat: add scan composite service for Supabase CRUD"
```

---

## Task 3: Service Layer - Vessel Model Service

**Files:**
- Create: `src/services/vessel-model-service.ts`

**Step 1: Write the service**

```typescript
// =============================================================================
// Vessel Model Service
// =============================================================================
// CRUD operations for vessel models and scan placements in Supabase.
// =============================================================================

import { supabase, isSupabaseConfigured } from '../supabase-client.js';

export interface VesselModelRecord {
  id: string;
  name: string;
  organization_id: string;
  created_by: string;
  config: Record<string, unknown>;  // Full VesselState serialized
  created_at: string;
  updated_at: string;
}

export interface VesselModelSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ScanPlacementRecord {
  id: string;
  vessel_model_id: string;
  scan_composite_id: string;
  index_start_mm: number;
  scan_direction: 'cw' | 'ccw';
  index_direction: 'forward' | 'reverse';
  created_at: string;
}

export interface SaveVesselModelParams {
  name: string;
  organizationId: string;
  userId: string;
  config: Record<string, unknown>;
}

export interface SaveScanPlacementParams {
  vesselModelId: string;
  scanCompositeId: string;
  indexStartMm: number;
  scanDirection: 'cw' | 'ccw';
  indexDirection: 'forward' | 'reverse';
}

/** Save a new vessel model */
export async function saveVesselModel(params: SaveVesselModelParams): Promise<string> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const { data, error } = await supabase!
    .from('vessel_models')
    .insert({
      name: params.name,
      organization_id: params.organizationId,
      created_by: params.userId,
      config: params.config,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

/** Update an existing vessel model */
export async function updateVesselModel(id: string, config: Record<string, unknown>): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const { error } = await supabase!
    .from('vessel_models')
    .update({ config })
    .eq('id', id);

  if (error) throw error;
}

/** List vessel models for the user's organization */
export async function listVesselModels(): Promise<VesselModelSummary[]> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const { data, error } = await supabase!
    .from('vessel_models')
    .select('id, name, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data;
}

/** Fetch a single vessel model with full config */
export async function getVesselModel(id: string): Promise<VesselModelRecord> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const { data, error } = await supabase!
    .from('vessel_models')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

/** Delete a vessel model */
export async function deleteVesselModel(id: string): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const { error } = await supabase!
    .from('vessel_models')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/** Save a scan placement (link composite to vessel with position) */
export async function saveScanPlacement(params: SaveScanPlacementParams): Promise<string> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const { data, error } = await supabase!
    .from('vessel_scan_placements')
    .insert({
      vessel_model_id: params.vesselModelId,
      scan_composite_id: params.scanCompositeId,
      index_start_mm: params.indexStartMm,
      scan_direction: params.scanDirection,
      index_direction: params.indexDirection,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

/** Get all scan placements for a vessel model */
export async function getVesselScanPlacements(vesselModelId: string): Promise<ScanPlacementRecord[]> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const { data, error } = await supabase!
    .from('vessel_scan_placements')
    .select('*')
    .eq('vessel_model_id', vesselModelId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

/** Delete a scan placement */
export async function deleteScanPlacement(id: string): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const { error } = await supabase!
    .from('vessel_scan_placements')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
```

**Step 2: Commit**

```bash
git add src/services/vessel-model-service.ts
git commit -m "feat: add vessel model and scan placement services"
```

---

## Task 4: React Query Hooks

**Files:**
- Create: `src/hooks/queries/useScanComposites.ts`
- Create: `src/hooks/mutations/useScanCompositeMutations.ts`
- Create: `src/hooks/queries/useVesselModels.ts`
- Create: `src/hooks/mutations/useVesselModelMutations.ts`

**Step 1: Write the query hooks**

`src/hooks/queries/useScanComposites.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { listScanComposites, getScanComposite } from '../../services/scan-composite-service';
import type { ScanCompositeSummary, ScanCompositeRecord } from '../../services/scan-composite-service';

export type { ScanCompositeSummary, ScanCompositeRecord };

export function useScanCompositeList() {
  return useQuery({
    queryKey: ['scanComposites'],
    queryFn: listScanComposites,
    staleTime: 5 * 60 * 1000,
  });
}

export function useScanComposite(id: string | undefined) {
  return useQuery({
    queryKey: ['scanComposites', id],
    queryFn: () => getScanComposite(id!),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,  // Composites don't change after creation
  });
}
```

`src/hooks/queries/useVesselModels.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import {
  listVesselModels,
  getVesselModel,
  getVesselScanPlacements,
} from '../../services/vessel-model-service';
import type { VesselModelSummary, VesselModelRecord, ScanPlacementRecord } from '../../services/vessel-model-service';

export type { VesselModelSummary, VesselModelRecord, ScanPlacementRecord };

export function useVesselModelList() {
  return useQuery({
    queryKey: ['vesselModels'],
    queryFn: listVesselModels,
    staleTime: 5 * 60 * 1000,
  });
}

export function useVesselModel(id: string | undefined) {
  return useQuery({
    queryKey: ['vesselModels', id],
    queryFn: () => getVesselModel(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });
}

export function useVesselScanPlacements(vesselModelId: string | undefined) {
  return useQuery({
    queryKey: ['vesselModels', vesselModelId, 'placements'],
    queryFn: () => getVesselScanPlacements(vesselModelId!),
    enabled: !!vesselModelId,
    staleTime: 5 * 60 * 1000,
  });
}
```

**Step 2: Write the mutation hooks**

`src/hooks/mutations/useScanCompositeMutations.ts`:
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { saveScanComposite, deleteScanComposite } from '../../services/scan-composite-service';
import type { SaveScanCompositeParams } from '../../services/scan-composite-service';

export function useSaveScanComposite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: SaveScanCompositeParams) => saveScanComposite(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scanComposites'] });
    },
  });
}

export function useDeleteScanComposite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteScanComposite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scanComposites'] });
    },
  });
}
```

`src/hooks/mutations/useVesselModelMutations.ts`:
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  saveVesselModel,
  updateVesselModel,
  deleteVesselModel,
  saveScanPlacement,
  deleteScanPlacement,
} from '../../services/vessel-model-service';
import type { SaveVesselModelParams, SaveScanPlacementParams } from '../../services/vessel-model-service';

export function useSaveVesselModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: SaveVesselModelParams) => saveVesselModel(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vesselModels'] });
    },
  });
}

export function useUpdateVesselModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, config }: { id: string; config: Record<string, unknown> }) =>
      updateVesselModel(id, config),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['vesselModels', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['vesselModels'] });
    },
  });
}

export function useDeleteVesselModel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteVesselModel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vesselModels'] });
    },
  });
}

export function useSaveScanPlacement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: SaveScanPlacementParams) => saveScanPlacement(params),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['vesselModels', variables.vesselModelId, 'placements'],
      });
    },
  });
}

export function useDeleteScanPlacement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, vesselModelId }: { id: string; vesselModelId: string }) =>
      deleteScanPlacement(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['vesselModels', variables.vesselModelId, 'placements'],
      });
    },
  });
}
```

**Step 3: Commit**

```bash
git add src/hooks/queries/useScanComposites.ts src/hooks/queries/useVesselModels.ts src/hooks/mutations/useScanCompositeMutations.ts src/hooks/mutations/useVesselModelMutations.ts
git commit -m "feat: add React Query hooks for scan composites and vessel models"
```

---

## Task 5: "Save to Cloud" Button in CscanVisualizer

**Files:**
- Modify: `src/components/CscanVisualizer/CscanVisualizer.tsx`

**Context:** The export menu is around line 540-580 in the JSX. The toolbar is at the top. We need to add a "Save to Cloud" button near the export section. The component needs to:
1. Import the mutation hook
2. Get user info from auth context
3. Show a name dialog
4. Save the current composite to Supabase

**Step 1: Add imports and state**

At the top of CscanVisualizer.tsx, add:
```typescript
import { useSaveScanComposite } from '../../hooks/mutations/useScanCompositeMutations';
import { useAuth } from '../../auth-context';
```

Add state for the save dialog:
```typescript
const [showSaveDialog, setShowSaveDialog] = useState(false);
const [saveName, setSaveName] = useState('');
```

Add the mutation hook and auth:
```typescript
const saveComposite = useSaveScanComposite();
const { user } = useAuth();
```

**Step 2: Add the save handler**

```typescript
const handleSaveToCloud = useCallback(async () => {
  if (!scanData || !user) return;

  try {
    await saveComposite.mutateAsync({
      name: saveName || scanData.filename || 'Untitled Composite',
      organizationId: user.organization_id,
      userId: user.id,
      thicknessData: scanData.data,
      xAxis: scanData.xAxis,
      yAxis: scanData.yAxis,
      stats: scanData.stats || null,
      width: scanData.width,
      height: scanData.height,
      sourceFiles: scanData.sourceRegions || null,
    });

    setShowSaveDialog(false);
    setSaveName('');
    setStatusMessage({ type: 'success', message: 'Composite saved to cloud' });
    setTimeout(() => setStatusMessage(null), 3000);
  } catch {
    setStatusMessage({ type: 'error', message: 'Failed to save composite' });
    setTimeout(() => setStatusMessage(null), 5000);
  }
}, [scanData, user, saveName, saveComposite]);
```

**Step 3: Add the button and dialog to JSX**

Add a "Save to Cloud" button in the export area (near the existing download button). Add a simple modal dialog for the name input.

The button should:
- Only appear when `scanData` exists and `isSupabaseConfigured()` is true
- Show a cloud-upload icon
- Open the save dialog on click

The dialog should:
- Have a text input for the composite name (defaulting to filename)
- Have Save / Cancel buttons
- Show loading state while saving

**Step 4: Commit**

```bash
git add src/components/CscanVisualizer/CscanVisualizer.tsx
git commit -m "feat: add 'Save to Cloud' button to C-scan compositor"
```

---

## Task 6: Heatmap Canvas Texture Generator

**Files:**
- Create: `src/components/VesselModeler/engine/heatmap-texture.ts`

**Context:** This is the core rendering function. It takes a thickness matrix and colorscale, renders to a canvas, and returns a Three.js CanvasTexture. The colorscale definitions can be borrowed from the CscanVisualizer's `streamedExport.ts` which already has Plotly-compatible colorscale arrays.

**Step 1: Write the heatmap texture generator**

```typescript
// =============================================================================
// Heatmap Texture Generator
// =============================================================================
// Renders a 2D thickness matrix as a color-mapped canvas texture for mapping
// onto the 3D vessel surface. Supports multiple colorscales and null handling.
// =============================================================================

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Colorscale Definitions (Plotly-compatible)
// ---------------------------------------------------------------------------

type ColorStop = [number, [number, number, number]];  // [position 0-1, [r, g, b] 0-255]

const COLORSCALES: Record<string, ColorStop[]> = {
  Jet: [
    [0,    [0, 0, 131]],
    [0.125,[0, 60, 170]],
    [0.375,[0, 255, 255]],
    [0.5,  [0, 255, 0]],  // Adjusted for better spread
    [0.625,[255, 255, 0]],
    [0.875,[255, 0, 0]],
    [1,    [128, 0, 0]],
  ],
  Viridis: [
    [0,    [68, 1, 84]],
    [0.25, [59, 82, 139]],
    [0.5,  [33, 145, 140]],
    [0.75, [94, 201, 98]],
    [1,    [253, 231, 37]],
  ],
  Hot: [
    [0,   [10, 0, 0]],
    [0.33,[255, 0, 0]],
    [0.66,[255, 255, 0]],
    [1,   [255, 255, 255]],
  ],
  Blues: [
    [0,   [247, 251, 255]],
    [0.5, [107, 174, 214]],
    [1,   [8, 48, 107]],
  ],
};

/** Interpolate between two RGB colors */
function lerpColor(
  c1: [number, number, number],
  c2: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

/** Map a normalized value (0-1) to an RGB color using the given colorscale */
function valueToColor(
  normalizedValue: number,
  colorscale: ColorStop[],
): [number, number, number] {
  const v = Math.max(0, Math.min(1, normalizedValue));

  // Find the two surrounding stops
  for (let i = 0; i < colorscale.length - 1; i++) {
    const [pos1, color1] = colorscale[i];
    const [pos2, color2] = colorscale[i + 1];
    if (v >= pos1 && v <= pos2) {
      const t = (v - pos1) / (pos2 - pos1);
      return lerpColor(color1, color2, t);
    }
  }

  // Fallback to last color
  return colorscale[colorscale.length - 1][1];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface HeatmapTextureOptions {
  colorScale?: string;       // 'Jet' | 'Viridis' | 'Hot' | 'Blues' (default: 'Jet')
  rangeMin?: number | null;  // Override min for color mapping
  rangeMax?: number | null;  // Override max for color mapping
  reverseScale?: boolean;    // Reverse the colorscale direction
  opacity?: number;          // Overall opacity 0-1 (default: 1)
}

export interface HeatmapTextureResult {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
}

/**
 * Generate a Three.js CanvasTexture from a 2D thickness matrix.
 *
 * Each cell in the matrix is mapped to a color using the selected colorscale.
 * Null values are rendered as fully transparent pixels so the vessel shell
 * shows through gaps in the scan data.
 */
export function createHeatmapTexture(
  data: (number | null)[][],
  stats: { min: number; max: number },
  options: HeatmapTextureOptions = {},
): HeatmapTextureResult {
  const {
    colorScale = 'Jet',
    rangeMin,
    rangeMax,
    reverseScale = false,
    opacity = 1,
  } = options;

  const height = data.length;
  const width = data[0]?.length ?? 0;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const imageData = ctx.createImageData(width, height);
  const pixels = imageData.data;

  const min = rangeMin ?? stats.min;
  const max = rangeMax ?? stats.max;
  const range = max - min || 1;  // Prevent division by zero
  const scale = COLORSCALES[colorScale] || COLORSCALES.Jet;
  const alphaValue = Math.round(opacity * 255);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const value = data[row][col];
      const pixelIndex = (row * width + col) * 4;

      if (value === null || value === undefined) {
        // Transparent for null/missing data
        pixels[pixelIndex] = 0;
        pixels[pixelIndex + 1] = 0;
        pixels[pixelIndex + 2] = 0;
        pixels[pixelIndex + 3] = 0;
      } else {
        let normalized = (value - min) / range;
        if (reverseScale) normalized = 1 - normalized;
        const [r, g, b] = valueToColor(normalized, scale);
        pixels[pixelIndex] = r;
        pixels[pixelIndex + 1] = g;
        pixels[pixelIndex + 2] = b;
        pixels[pixelIndex + 3] = alphaValue;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return { texture, canvas };
}

/** Get available colorscale names */
export function getAvailableColorscales(): string[] {
  return Object.keys(COLORSCALES);
}

/**
 * Re-render an existing heatmap texture with new options (colorscale change, range adjustment).
 * Reuses the same canvas to avoid creating new GPU resources.
 */
export function updateHeatmapTexture(
  result: HeatmapTextureResult,
  data: (number | null)[][],
  stats: { min: number; max: number },
  options: HeatmapTextureOptions = {},
): void {
  const { canvas, texture } = result;
  const {
    colorScale = 'Jet',
    rangeMin,
    rangeMax,
    reverseScale = false,
    opacity = 1,
  } = options;

  const height = data.length;
  const width = data[0]?.length ?? 0;

  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(width, height);
  const pixels = imageData.data;

  const min = rangeMin ?? stats.min;
  const max = rangeMax ?? stats.max;
  const range = max - min || 1;
  const scale = COLORSCALES[colorScale] || COLORSCALES.Jet;
  const alphaValue = Math.round(opacity * 255);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const value = data[row][col];
      const pixelIndex = (row * width + col) * 4;

      if (value === null || value === undefined) {
        pixels[pixelIndex] = 0;
        pixels[pixelIndex + 1] = 0;
        pixels[pixelIndex + 2] = 0;
        pixels[pixelIndex + 3] = 0;
      } else {
        let normalized = (value - min) / range;
        if (reverseScale) normalized = 1 - normalized;
        const [r, g, b] = valueToColor(normalized, scale);
        pixels[pixelIndex] = r;
        pixels[pixelIndex + 1] = g;
        pixels[pixelIndex + 2] = b;
        pixels[pixelIndex + 3] = alphaValue;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  texture.needsUpdate = true;
}
```

**Step 2: Commit**

```bash
git add src/components/VesselModeler/engine/heatmap-texture.ts
git commit -m "feat: add heatmap canvas texture generator with colorscale support"
```

---

## Task 7: Scan Composite Type and Placement Mesh

**Files:**
- Modify: `src/components/VesselModeler/types.ts`
- Modify: `src/components/VesselModeler/engine/texture-manager.ts`

**Context:** We need a new `ScanCompositeConfig` type (distinct from `TextureConfig`) that stores the structured data and placement parameters. Then a new function `createScanCompositePlane()` that uses the axis data for auto-sizing instead of manual scale factors.

**Step 1: Add ScanCompositeConfig to types.ts**

Add after the `TextureConfig` interface (around line 162):

```typescript
// ---------------------------------------------------------------------------
// Scan Composite Overlays (structured C-scan data on vessel surface)
// ---------------------------------------------------------------------------

export interface ScanCompositeConfig {
  /** Unique ID (matches Supabase scan_composites.id or local counter) */
  id: string;
  /** Display name */
  name: string;
  /** Supabase record ID (if saved to cloud) */
  cloudId?: string;
  /** 2D thickness matrix [rows][cols] - index axis × scan axis */
  data: (number | null)[][];
  /** Scan axis coordinates in mm (circumferential) */
  xAxis: number[];
  /** Index axis coordinates in mm (longitudinal) */
  yAxis: number[];
  /** Pre-computed statistics */
  stats: { min: number; max: number; mean: number; median: number; stdDev: number };
  /** Longitudinal start position on vessel (mm from tangent line) */
  indexStartMm: number;
  /** Scan direction from TDC: 'cw' or 'ccw' */
  scanDirection: 'cw' | 'ccw';
  /** Index direction along vessel: 'forward' or 'reverse' */
  indexDirection: 'forward' | 'reverse';
  /** Colorscale name */
  colorScale: string;
  /** Override min for color range (null = use stats.min) */
  rangeMin: number | null;
  /** Override max for color range (null = use stats.max) */
  rangeMax: number | null;
  /** Opacity 0-1 */
  opacity: number;
}
```

Add `scanComposites` to `VesselState` (around line 320):

```typescript
scanComposites: ScanCompositeConfig[];
```

Add to `DEFAULT_VESSEL_STATE`:

```typescript
scanComposites: [],
```

Add to `VesselCallbacks`:

```typescript
onScanCompositeSelected?: (id: string) => void;
onScanCompositeHover?: (id: string, thickness: number | null, pos: number, angle: number) => void;
```

**Step 2: Add createScanCompositePlane to texture-manager.ts**

This function is similar to `createTexturePlane()` but uses axis data for sizing instead of manual scale factors. The key differences:

1. **Width** = scan axis range (mm) → converted to angular span on vessel
2. **Height** = index axis range (mm) → used directly as axial extent
3. **Position** = `indexStartMm` + half of index range → center position
4. **Angle** = TDC (90°) + half of scan angular span (adjusted for CW/CCW)
5. **Texture** = generated by `createHeatmapTexture()` instead of loaded from image

```typescript
import { createHeatmapTexture, type HeatmapTextureResult } from './heatmap-texture';
import type { ScanCompositeConfig } from '../types';

/** Cache for heatmap textures keyed by composite ID */
const heatmapCache = new Map<string, HeatmapTextureResult>();

export function createScanCompositePlane(
  composite: ScanCompositeConfig,
  vesselState: VesselState,
  selectedId: string,
): THREE.Mesh | null {
  // Generate or retrieve cached heatmap texture
  let heatmapResult = heatmapCache.get(composite.id);
  if (!heatmapResult) {
    heatmapResult = createHeatmapTexture(composite.data, composite.stats, {
      colorScale: composite.colorScale,
      rangeMin: composite.rangeMin,
      rangeMax: composite.rangeMax,
      opacity: composite.opacity,
    });
    heatmapCache.set(composite.id, heatmapResult);
  }

  const shellRadius = vesselState.id / 2;
  const RADIUS = shellRadius;
  const TAN_TAN = vesselState.length;
  const HEAD_DEPTH = vesselState.id / (2 * vesselState.headRatio);
  const circumference = 2 * Math.PI * RADIUS;
  const isVertical = vesselState.orientation === 'vertical';

  // --- Compute physical dimensions from axis data ---
  const scanRange = Math.abs(composite.xAxis[composite.xAxis.length - 1] - composite.xAxis[0]);
  const indexRange = Math.abs(composite.yAxis[composite.yAxis.length - 1] - composite.yAxis[0]);

  // Scan axis = circumferential → convert mm to angular span
  const angularSpan = (scanRange / circumference) * 2 * Math.PI;

  // Index axis = longitudinal → direct mm
  const texWidth = indexRange;  // Along vessel axis

  // --- Compute center position ---
  const indexHalf = indexRange / 2;
  const indexCenter = composite.indexDirection === 'forward'
    ? composite.indexStartMm + indexHalf
    : composite.indexStartMm - indexHalf;

  // TDC = 90° in vessel coordinate system
  const tdcRad = (90 * Math.PI) / 180;
  const scanHalf = angularSpan / 2;
  const centerAngle = composite.scanDirection === 'cw'
    ? tdcRad - scanHalf   // CW from TDC: center is TDC minus half span
    : tdcRad + scanHalf;  // CCW from TDC: center is TDC plus half span

  // --- Build geometry (same approach as createTexturePlane) ---
  const segmentsX = Math.ceil(64 * Math.max(1, texWidth / (RADIUS * 0.4)));
  const segmentsY = Math.ceil(64 * Math.max(1, angularSpan / 0.5));

  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const surfaceOffset = 2;

  for (let iy = 0; iy <= segmentsY; iy++) {
    const v = iy / segmentsY;
    const angleOffset = (v - 0.5) * angularSpan;
    const currentAngle = centerAngle + angleOffset;

    for (let ix = 0; ix <= segmentsX; ix++) {
      const u = ix / segmentsX;
      const posOffset = (u - 0.5) * texWidth;
      const currentPos = indexCenter + posOffset;

      let x: number, y: number, z: number;
      const posGlobal = (currentPos - TAN_TAN / 2) * SCALE;

      if (currentPos < 0) {
        const ratio = Math.min(0.99, Math.abs(currentPos / HEAD_DEPTH));
        const rLocal = RADIUS * Math.sqrt(1 - ratio * ratio);
        if (isVertical) {
          x = (rLocal + surfaceOffset) * SCALE * Math.cos(currentAngle);
          y = posGlobal;
          z = (rLocal + surfaceOffset) * SCALE * Math.sin(currentAngle);
        } else {
          x = posGlobal;
          y = (rLocal + surfaceOffset) * SCALE * Math.sin(currentAngle);
          z = (rLocal + surfaceOffset) * SCALE * Math.cos(currentAngle);
        }
      } else if (currentPos > TAN_TAN) {
        const posLocal = currentPos - TAN_TAN;
        const ratio = Math.min(0.99, Math.abs(posLocal / HEAD_DEPTH));
        const rLocal = RADIUS * Math.sqrt(1 - ratio * ratio);
        if (isVertical) {
          x = (rLocal + surfaceOffset) * SCALE * Math.cos(currentAngle);
          y = posGlobal;
          z = (rLocal + surfaceOffset) * SCALE * Math.sin(currentAngle);
        } else {
          x = posGlobal;
          y = (rLocal + surfaceOffset) * SCALE * Math.sin(currentAngle);
          z = (rLocal + surfaceOffset) * SCALE * Math.cos(currentAngle);
        }
      } else {
        if (isVertical) {
          x = (RADIUS + surfaceOffset) * SCALE * Math.cos(currentAngle);
          y = posGlobal;
          z = (RADIUS + surfaceOffset) * SCALE * Math.sin(currentAngle);
        } else {
          x = posGlobal;
          y = (RADIUS + surfaceOffset) * SCALE * Math.sin(currentAngle);
          z = (RADIUS + surfaceOffset) * SCALE * Math.cos(currentAngle);
        }
      }

      vertices.push(x, y, z);
      uvs.push(u, 1 - v);
    }
  }

  for (let iy = 0; iy < segmentsY; iy++) {
    for (let ix = 0; ix < segmentsX; ix++) {
      const a = ix + (segmentsX + 1) * iy;
      const b = ix + (segmentsX + 1) * (iy + 1);
      const c = ix + 1 + (segmentsX + 1) * (iy + 1);
      const d = ix + 1 + (segmentsX + 1) * iy;
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    map: heatmapResult.texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = {
    type: 'scanComposite',
    id: composite.id,
    data: composite.data,       // Stored for raycasting hover lookup
    xAxis: composite.xAxis,
    yAxis: composite.yAxis,
    stats: composite.stats,
    width: composite.data[0]?.length ?? 0,
    height: composite.data.length,
  };

  // Selection border
  if (composite.id === selectedId) {
    // Reuse buildSelectionBorder logic adapted for scan composites
    // (or add a simple outline effect)
  }

  return mesh;
}

/** Clear cached heatmap texture (call when composite is removed or options change) */
export function clearHeatmapCache(compositeId?: string): void {
  if (compositeId) {
    const cached = heatmapCache.get(compositeId);
    if (cached) {
      cached.texture.dispose();
      heatmapCache.delete(compositeId);
    }
  } else {
    heatmapCache.forEach(r => r.texture.dispose());
    heatmapCache.clear();
  }
}
```

**Step 3: Commit**

```bash
git add src/components/VesselModeler/types.ts src/components/VesselModeler/engine/texture-manager.ts
git commit -m "feat: add ScanCompositeConfig type and auto-sized placement mesh"
```

---

## Task 8: Integrate Scan Composites into Scene Build

**Files:**
- Modify: `src/components/VesselModeler/engine/vessel-geometry.ts`
- Modify: `src/components/VesselModeler/ThreeViewport.tsx`

**Context:** The `buildVesselScene()` function in `vessel-geometry.ts` already iterates `vesselState.textures` and calls `createTexturePlane()`. We need to also iterate `vesselState.scanComposites` and call `createScanCompositePlane()`.

**Step 1: Update BuildSceneResult**

Add to the `BuildSceneResult` interface:
```typescript
scanCompositeMeshes: THREE.Mesh[];
```

**Step 2: Add scan composite mesh building to buildVesselScene()**

After the texture loop (around line 556), add:
```typescript
// --- Scan Composite Overlays ---
const scanCompositeMeshes: THREE.Mesh[] = [];
for (const composite of state.scanComposites) {
  const mesh = createScanCompositePlane(composite, state, selectedScanCompositeId);
  if (mesh) {
    vesselGroup.add(mesh);
    scanCompositeMeshes.push(mesh);
  }
}
```

Note: `selectedScanCompositeId` needs to be added as a parameter to `buildVesselScene()`.

**Step 3: Wire up in ThreeViewport.tsx**

In the `rebuildScene()` function, pass the new parameter and store `scanCompositeMeshes` for the InteractionManager to use for raycasting.

**Step 4: Commit**

```bash
git add src/components/VesselModeler/engine/vessel-geometry.ts src/components/VesselModeler/ThreeViewport.tsx
git commit -m "feat: integrate scan composite meshes into vessel scene build"
```

---

## Task 9: Import Scan Composite UI in VesselModeler

**Files:**
- Modify: `src/components/VesselModeler/VesselModeler.tsx`

**Context:** The vessel modeler has a sidebar with sections for nozzles, textures, annotations, etc. We need a new "Scan Composites" section with an "Import from Cloud" button that:
1. Shows a list of saved composites from Supabase
2. Lets the user select one and enter placement parameters
3. Adds it to `vesselState.scanComposites`

**Step 1: Add state and hooks**

```typescript
const [showImportComposite, setShowImportComposite] = useState(false);
const [selectedScanCompositeId, setSelectedScanCompositeId] = useState('');
const { data: cloudComposites } = useScanCompositeList();
```

**Step 2: Add import handlers**

```typescript
const handleImportComposite = useCallback(async (
  cloudId: string,
  indexStartMm: number,
  scanDirection: 'cw' | 'ccw',
  indexDirection: 'forward' | 'reverse',
) => {
  // Fetch full composite data from Supabase
  const composite = await getScanComposite(cloudId);

  const newConfig: ScanCompositeConfig = {
    id: `sc_${Date.now()}`,
    name: composite.name,
    cloudId: composite.id,
    data: composite.thickness_data,
    xAxis: composite.x_axis,
    yAxis: composite.y_axis,
    stats: composite.stats,
    indexStartMm,
    scanDirection,
    indexDirection,
    colorScale: 'Jet',
    rangeMin: null,
    rangeMax: null,
    opacity: 1,
  };

  setVesselState(prev => ({
    ...prev,
    scanComposites: [...prev.scanComposites, newConfig],
  }));
  setShowImportComposite(false);
}, []);
```

**Step 3: Add sidebar section**

Add a "Scan Composites" collapsible section in the sidebar (matching the style of existing sections like Textures, Annotations). Include:
- "Import from Cloud" button
- List of placed composites with name, dimensions
- Per-composite controls: colorscale dropdown, min/max range, opacity slider, remove button

**Step 4: Add import modal**

A modal that shows when `showImportComposite` is true:
- List of cloud composites (name, date, dimensions from `cloudComposites`)
- After selecting one, show placement form:
  - Index start (mm) - numeric input
  - Scan direction - CW/CCW toggle
  - Index direction - Forward/Reverse toggle
- Import / Cancel buttons

**Step 5: Commit**

```bash
git add src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat: add scan composite import UI to vessel modeler"
```

---

## Task 10: Interactive Hover - Thickness Tooltip

**Files:**
- Modify: `src/components/VesselModeler/engine/interaction-manager.ts`
- Modify: `src/components/VesselModeler/ThreeViewport.tsx`
- Modify: `src/components/VesselModeler/VesselModeler.tsx`

**Context:** The InteractionManager already handles `pointermove` events and raycasts against various mesh arrays. We need to add scan composite meshes to the raycast targets and, on hover (not drag), look up the thickness value from the UV coordinates.

**Step 1: Add scan composite mesh array to InteractionManager**

Add a `scanCompositeMeshes: THREE.Mesh[]` field. In `pointermove` handler, when not dragging, raycast against scan composite meshes.

**Step 2: UV to thickness lookup**

When a scan composite mesh is hit:
```typescript
const intersection = hits[0];
const uv = intersection.uv;  // THREE.Vector2 with u,v in [0,1]
const userData = intersection.object.userData;

if (uv && userData.type === 'scanComposite') {
  const col = Math.floor(uv.x * userData.width);
  const row = Math.floor((1 - uv.y) * userData.height);  // Flip Y
  const thickness = userData.data[row]?.[col] ?? null;

  // Fire callback with thickness value and position
  callbacks.onScanCompositeHover?.(
    userData.id,
    thickness,
    userData.xAxis[col],  // Scan position in mm
    userData.yAxis[row],  // Index position in mm
  );
}
```

**Step 3: Tooltip overlay in VesselModeler.tsx**

Add state for hover data:
```typescript
const [hoverData, setHoverData] = useState<{
  thickness: number | null;
  scanPos: number;
  indexPos: number;
  screenX: number;
  screenY: number;
} | null>(null);
```

Render a positioned tooltip div when `hoverData` is set:
```tsx
{hoverData && hoverData.thickness !== null && (
  <div
    className="absolute pointer-events-none bg-gray-900/90 text-white px-3 py-2 rounded text-sm z-50"
    style={{ left: hoverData.screenX + 16, top: hoverData.screenY - 16 }}
  >
    <div className="font-bold">{hoverData.thickness.toFixed(2)} mm</div>
    <div className="text-xs text-gray-400">
      Scan: {hoverData.scanPos.toFixed(1)} mm | Index: {hoverData.indexPos.toFixed(1)} mm
    </div>
  </div>
)}
```

**Step 4: Commit**

```bash
git add src/components/VesselModeler/engine/interaction-manager.ts src/components/VesselModeler/ThreeViewport.tsx src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat: add interactive thickness hover tooltip on scan composites"
```

---

## Task 11: Save/Load Integration

**Files:**
- Modify: `src/components/VesselModeler/VesselModeler.tsx` (save/load functions)

**Context:** The existing `saveProject` and `loadProject` functions serialize/deserialize the full vessel state to JSON. We need to include `scanComposites` in this process. Since the thickness data can be large, this is also where cloud save/load becomes valuable.

**Step 1: Update saveProject**

In the `saveProject` callback (around line 601), add `scanComposites` to the serialized data:
```typescript
scanComposites: vesselState.scanComposites.map(sc => ({
  id: sc.id,
  name: sc.name,
  cloudId: sc.cloudId,
  data: sc.data,
  xAxis: sc.xAxis,
  yAxis: sc.yAxis,
  stats: sc.stats,
  indexStartMm: sc.indexStartMm,
  scanDirection: sc.scanDirection,
  indexDirection: sc.indexDirection,
  colorScale: sc.colorScale,
  rangeMin: sc.rangeMin,
  rangeMax: sc.rangeMax,
  opacity: sc.opacity,
})),
```

**Step 2: Update loadProject**

In the load handler (around line 683), restore scan composites:
```typescript
scanComposites: projectData.scanComposites || [],
```

**Step 3: Add cloud save/load**

Add "Save to Cloud" and "Load from Cloud" buttons near the existing save/load buttons. These use the `useSaveVesselModel` and `useVesselModel` hooks.

For cloud save: serialize `vesselState` (excluding large thickness data if cloudId references exist) and call `saveVesselModel`.

For cloud load: fetch the model config and restore state, then fetch any referenced scan composites by their `cloudId`.

**Step 4: Commit**

```bash
git add src/components/VesselModeler/VesselModeler.tsx
git commit -m "feat: include scan composites in vessel model save/load"
```

---

## Task 12: Build Verification and Cleanup

**Step 1: Run TypeScript check**

```bash
npm run typecheck
```

Fix any type errors.

**Step 2: Run build**

```bash
npm run build
```

Fix any build errors.

**Step 3: Run lint**

```bash
npm run lint:fix
```

**Step 4: Manual testing checklist**

- [ ] Open CscanVisualizer, load CSV files, create composite
- [ ] Click "Save to Cloud", enter name, verify it saves
- [ ] Open VesselModeler, click "Import Scan Composite"
- [ ] Select a saved composite, enter placement parameters
- [ ] Verify auto-sizing matches scan dimensions
- [ ] Hover over the placed scan, verify thickness tooltip appears
- [ ] Change colorscale and range, verify texture updates
- [ ] Save vessel model to JSON, reload, verify composites persist
- [ ] Save vessel model to cloud, reload from cloud

**Step 5: Final commit**

```bash
git add -A
git commit -m "fix: resolve build errors and polish scan composite integration"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Database schema SQL | `database/scan-composite-schema.sql` |
| 2 | Scan composite service | `src/services/scan-composite-service.ts` |
| 3 | Vessel model service | `src/services/vessel-model-service.ts` |
| 4 | React Query hooks | `src/hooks/queries/` + `src/hooks/mutations/` (4 files) |
| 5 | "Save to Cloud" button | `src/components/CscanVisualizer/CscanVisualizer.tsx` |
| 6 | Heatmap texture generator | `src/components/VesselModeler/engine/heatmap-texture.ts` |
| 7 | ScanCompositeConfig type + mesh | `types.ts` + `texture-manager.ts` |
| 8 | Scene build integration | `vessel-geometry.ts` + `ThreeViewport.tsx` |
| 9 | Import UI in vessel modeler | `VesselModeler.tsx` |
| 10 | Interactive hover tooltip | `interaction-manager.ts` + `ThreeViewport.tsx` + `VesselModeler.tsx` |
| 11 | Save/load integration | `VesselModeler.tsx` |
| 12 | Build verification | All files |
