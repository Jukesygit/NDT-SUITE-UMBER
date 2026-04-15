# Companion App Form Populate — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Populate from Companion" button to the inspection detail page that reads NDE file metadata from the companion app and fills equipment details, vessel details, calibration log, and scan log automatically.

**Architecture:** Two-codebase change. First, enhance the companion app (Python/FastAPI) to parse and expose the rich metadata already present in NDE files (Properties JSON for dates, Setup JSON for probe/wedge/equipment/material/specimen). Then add a new hook + UI button in the NDT Suite frontend that calls the enhanced API and writes the data into the inspection form via existing mutation hooks.

**Tech Stack:** Python 3 / FastAPI / h5py (companion), React 18 / TypeScript / React Query (frontend)

---

## Task 1: Enhance Companion App — Add Metadata to FileIndex

**Files:**
- Modify: `C:\Users\jonas\OneDrive\Desktop\ndt-companion\engine\models.py`

Add new dataclasses and fields to `FileIndex` for the metadata we'll extract.

**Step 1: Add new dataclasses**

Add these after `ThicknessProcessInfo`:

```python
@dataclass
class ProbeInfo:
    model: str           # e.g. "7.5L64-I4"
    serie: str           # e.g. "I4"
    frequency_mhz: float # e.g. 7.5

@dataclass
class WedgeInfo:
    model: str           # e.g. "HydroFORM"
    serie: str           # e.g. "SI4"

@dataclass
class EquipmentInfo:
    model: str           # e.g. "OmniScan X4 - 16:64PR"
    serial_number: str   # e.g. "QC-0096426"
    platform: str        # e.g. "OmniScan X4"

@dataclass
class SpecimenInfo:
    material_name: str           # e.g. "Steel_Mild"
    nominal_thickness_mm: float  # e.g. 20.0
    longitudinal_velocity: float # e.g. 5890.0
    transversal_velocity: Optional[float] = None
    density: Optional[float] = None

@dataclass
class ScannerInfo:
    name: str            # e.g. "HydroFORM2"
    encoder_mode: str    # e.g. "Quadrature"
```

**Step 2: Add optional fields to FileIndex**

Add these fields (with defaults) at the end of `FileIndex`:

```python
    # Rich metadata (from Properties + Setup)
    creation_date: Optional[str] = None      # ISO 8601 from Properties
    modification_date: Optional[str] = None  # ISO 8601 from Properties
    probe: Optional[ProbeInfo] = None
    wedge: Optional[WedgeInfo] = None
    equipment: Optional[EquipmentInfo] = None
    specimen: Optional[SpecimenInfo] = None
    scanner: Optional[ScannerInfo] = None
```

**Step 3: Commit**

```bash
cd "C:\Users\jonas\OneDrive\Desktop\ndt-companion"
git add engine/models.py
git commit -m "feat: add rich metadata dataclasses to FileIndex"
```

---

## Task 2: Enhance Companion App — Parse Metadata in nde_reader.py

**Files:**
- Modify: `C:\Users\jonas\OneDrive\Desktop\ndt-companion\engine\nde_reader.py`

**Step 1: Add Properties parsing**

Add a helper function before `index_file()`:

```python
def _parse_properties(f: h5py.File) -> tuple[Optional[str], Optional[str]]:
    """Extract creation/modification dates from Properties dataset."""
    try:
        raw = f["Properties"][()]
        if isinstance(raw, bytes):
            props = json.loads(raw.decode("utf-8"))
        elif isinstance(raw, np.ndarray):
            props = json.loads(raw.tobytes().decode("utf-8"))
        else:
            props = json.loads(str(raw))
        file_info = props.get("file", {})
        return file_info.get("creationDate"), file_info.get("modificationDate")
    except Exception:
        logger.debug("Could not parse Properties dataset", exc_info=True)
        return None, None
```

**Step 2: Add Setup metadata extraction helpers**

Add after `_parse_properties`:

```python
def _parse_probe(setup: dict) -> Optional["ProbeInfo"]:
    from .models import ProbeInfo
    probes = setup.get("probes", [])
    if not probes:
        return None
    p = probes[0]
    model = p.get("model", "")
    serie = p.get("serie", "")
    freq_hz = 0.0
    for key in ("phasedArrayLinear", "phasedArrayMatrix", "conventional"):
        if key in p:
            freq_hz = p[key].get("centralFrequency", 0.0)
            break
    return ProbeInfo(model=model, serie=serie, frequency_mhz=round(freq_hz / 1e6, 2))


def _parse_wedge(setup: dict) -> Optional["WedgeInfo"]:
    from .models import WedgeInfo
    wedges = setup.get("wedges", [])
    if not wedges:
        return None
    w = wedges[0]
    return WedgeInfo(model=w.get("model", ""), serie=w.get("serie", ""))


def _parse_equipment(setup: dict) -> Optional["EquipmentInfo"]:
    from .models import EquipmentInfo
    units = setup.get("acquisitionUnits", [])
    if not units:
        return None
    u = units[0]
    return EquipmentInfo(
        model=u.get("model", ""),
        serial_number=u.get("serialNumber", ""),
        platform=u.get("platform", ""),
    )


def _parse_specimen(setup: dict) -> Optional["SpecimenInfo"]:
    from .models import SpecimenInfo
    specimens = setup.get("specimens", [])
    if not specimens:
        return None
    s = specimens[0]
    # Support both plateGeometry and cylinderGeometry
    geom = s.get("plateGeometry") or s.get("cylinderGeometry") or {}
    material = geom.get("material", {})
    thickness_m = geom.get("thickness", 0.0)
    long_vel = material.get("longitudinalWave", {}).get("nominalVelocity", 0.0)
    trans_vel = material.get("transversalVerticalWave", {}).get("nominalVelocity")
    density = material.get("density")
    return SpecimenInfo(
        material_name=material.get("name", ""),
        nominal_thickness_mm=round(thickness_m * 1000, 2),
        longitudinal_velocity=long_vel,
        transversal_velocity=trans_vel,
        density=density,
    )


def _parse_scanner(setup: dict) -> Optional["ScannerInfo"]:
    from .models import ScannerInfo
    devices = setup.get("motionDevices", [])
    if not devices:
        return None
    d = devices[0]
    encoder = d.get("encoder", {})
    return ScannerInfo(name=d.get("name", ""), encoder_mode=encoder.get("mode", ""))
```

**Step 3: Wire into index_file()**

Inside `index_file()`, after the existing `setup = json.loads(setup_str)` line, add:

```python
            # --- Properties metadata ---
            creation_date, modification_date = _parse_properties(f)

            # --- Rich setup metadata ---
            probe = _parse_probe(setup)
            wedge = _parse_wedge(setup)
            equipment = _parse_equipment(setup)
            specimen = _parse_specimen(setup)
            scanner = _parse_scanner(setup)
```

And add these to the `FileIndex(...)` constructor at the end:

```python
            creation_date=creation_date,
            modification_date=modification_date,
            probe=probe,
            wedge=wedge,
            equipment=equipment,
            specimen=specimen,
            scanner=scanner,
```

**Step 4: Commit**

```bash
git add engine/nde_reader.py
git commit -m "feat: parse Properties + Setup metadata (probe, wedge, equipment, specimen, scanner)"
```

---

## Task 3: Enhance Companion App — Expose Metadata via API

**Files:**
- Modify: `C:\Users\jonas\OneDrive\Desktop\ndt-companion\api\routes.py`

**Step 1: Add metadata to `_serialize_file()` (lightweight endpoint)**

The `/files` endpoint should include the new metadata since it's lightweight (no large arrays). Update `_serialize_file()`:

```python
def _serialize_file(fi) -> dict:
    """Serialize FileIndex to JSON for file list."""
    return {
        "filename": fi.filename,
        "sizeMb": fi.size_mb,
        "indexRangeMm": list(fi.index_axis.range_mm),
        "scanRangeMm": list(fi.scan_axis.range_mm),
        "gates": [{"id": g.id, "name": g.name, "detection": g.detection} for g in fi.gates],
        "beamCount": fi.beam_count,
        "validPointCount": fi.valid_point_count,
        "thicknessProcess": {
            "minMm": fi.thickness_process.min_mm,
            "maxMm": fi.thickness_process.max_mm,
            "gateIds": fi.thickness_process.gate_ids,
            "gateDetection": fi.thickness_process.gate_detection,
        } if fi.thickness_process else None,
        # Rich metadata
        "creationDate": fi.creation_date,
        "modificationDate": fi.modification_date,
        "probe": {"model": fi.probe.model, "serie": fi.probe.serie, "frequencyMhz": fi.probe.frequency_mhz} if fi.probe else None,
        "wedge": {"model": fi.wedge.model, "serie": fi.wedge.serie} if fi.wedge else None,
        "equipment": {"model": fi.equipment.model, "serialNumber": fi.equipment.serial_number, "platform": fi.equipment.platform} if fi.equipment else None,
        "specimen": {
            "materialName": fi.specimen.material_name,
            "nominalThicknessMm": fi.specimen.nominal_thickness_mm,
            "longitudinalVelocity": fi.specimen.longitudinal_velocity,
        } if fi.specimen else None,
        "scanner": {"name": fi.scanner.name, "encoderMode": fi.scanner.encoder_mode} if fi.scanner else None,
        "velocity": fi.velocity,
    }
```

**Step 2: Update `_serialize_file_full()` to not duplicate**

Since `_serialize_file()` now includes the metadata, `_serialize_file_full()` just needs to keep its extra axis/rawcscan fields. No functional change needed — it calls `_serialize_file()` as its base already.

**Step 3: Commit**

```bash
git add api/routes.py
git commit -m "feat: expose rich NDE metadata in /files and /file-info endpoints"
```

---

## Task 4: Update Frontend — Extend useCompanionFiles Types

**Files:**
- Modify: `src/hooks/queries/useCompanionFiles.ts`

**Step 1: Extend the CompanionFile interface**

```typescript
interface CompanionFileGate {
  id: number;
  name: string;
  detection: string;
}

interface CompanionFileProbe {
  model: string;
  serie: string;
  frequencyMhz: number;
}

interface CompanionFileWedge {
  model: string;
  serie: string;
}

interface CompanionFileEquipment {
  model: string;
  serialNumber: string;
  platform: string;
}

interface CompanionFileSpecimen {
  materialName: string;
  nominalThicknessMm: number;
  longitudinalVelocity: number;
}

interface CompanionFileScanner {
  name: string;
  encoderMode: string;
}

export interface CompanionFile {
  filename: string;
  sizeMb: number;
  indexRangeMm: [number, number];
  scanRangeMm: [number, number];
  gates: CompanionFileGate[];
  beamCount: number;
  validPointCount: number;
  thicknessProcess: {
    minMm: number | null;
    maxMm: number | null;
    gateIds: number[];
    gateDetection: string;
  } | null;
  // Rich metadata
  creationDate: string | null;
  modificationDate: string | null;
  probe: CompanionFileProbe | null;
  wedge: CompanionFileWedge | null;
  equipment: CompanionFileEquipment | null;
  specimen: CompanionFileSpecimen | null;
  scanner: CompanionFileScanner | null;
  velocity: number;
}
```

**Step 2: Commit**

```bash
git add src/hooks/queries/useCompanionFiles.ts
git commit -m "feat: extend CompanionFile types with rich NDE metadata"
```

---

## Task 5: Create usePopulateFromCompanion Hook

**Files:**
- Create: `src/hooks/mutations/usePopulateFromCompanion.ts`

This hook encapsulates the logic for reading companion files and writing data to the vessel form, scan log, and calibration log via existing mutations.

**Step 1: Create the hook**

```typescript
import { useCallback, useState } from 'react';
import { useCompanionApp } from '../queries/useCompanionApp';
import { useCompanionFiles, type CompanionFile } from '../queries/useCompanionFiles';
import {
    useUpdateProjectVessel,
    useCreateScanLogEntry,
    useCreateCalibrationLogEntry,
} from './useInspectionProjectMutations';
import type {
    ProjectVessel,
    VesselEquipmentConfig,
    ScanLogEntry,
    CalibrationLogEntry,
} from '../../types/inspection-project';

interface PopulateResult {
    equipmentUpdated: boolean;
    vesselDetailsUpdated: boolean;
    scanLogAdded: number;
    calLogAdded: number;
    skipped: number;
}

/**
 * Extract date from NDE creationDate (ISO 8601) as YYYY-MM-DD string.
 */
function formatNdeDate(iso: string | null): string | null {
    if (!iso) return null;
    try {
        return new Date(iso).toISOString().split('T')[0];
    } catch {
        return null;
    }
}

/**
 * Parse scan datum from NDE filename.
 * Pattern: "Name START-END_date" → extracts START as datum hint.
 * e.g. "NEV H-0310-2 3000-3500_2025_10_03 13h55m08s.nde" → "3000"
 */
function parseDatumFromFilename(filename: string): string | null {
    // Match a space-separated token like "3000-3500" (digits-digits before underscore)
    const match = filename.match(/\s(\d+)-(\d+)[_\s]/);
    return match ? match[1] : null;
}

export function usePopulateFromCompanion() {
    const { connected, port } = useCompanionApp();
    const { data: companionFiles } = useCompanionFiles(port);
    const updateVessel = useUpdateProjectVessel();
    const createScanEntry = useCreateScanLogEntry();
    const createCalEntry = useCreateCalibrationLogEntry();
    const [populating, setPopulating] = useState(false);

    const populate = useCallback(async (
        vessel: ProjectVessel,
        projectId: string,
        existingScanEntries: ScanLogEntry[],
        existingCalEntries: CalibrationLogEntry[],
    ): Promise<PopulateResult> => {
        if (!companionFiles || companionFiles.length === 0) {
            throw new Error('No NDE files available from companion app');
        }

        setPopulating(true);
        const result: PopulateResult = {
            equipmentUpdated: false,
            vesselDetailsUpdated: false,
            scanLogAdded: 0,
            calLogAdded: 0,
            skipped: 0,
        };

        try {
            // Use first file as reference for equipment/vessel details
            // (all files in a session typically share the same setup)
            const ref = companionFiles[0];

            // --- Equipment Config ---
            const equipmentConfig: VesselEquipmentConfig = { ...vessel.equipment_config };
            let equipmentChanged = false;

            if (ref.equipment && !equipmentConfig.model) {
                equipmentConfig.model = ref.equipment.model;
                equipmentChanged = true;
            }
            if (ref.equipment && !equipmentConfig.serial_no) {
                equipmentConfig.serial_no = ref.equipment.serialNumber;
                equipmentChanged = true;
            }
            if (ref.probe && !equipmentConfig.probe) {
                equipmentConfig.probe = ref.probe.model;
                equipmentChanged = true;
            }
            if (ref.wedge && !equipmentConfig.wedge) {
                equipmentConfig.wedge = ref.wedge.model;
                equipmentChanged = true;
            }
            if (ref.scanner && !equipmentConfig.scanner_frame) {
                equipmentConfig.scanner_frame = ref.scanner.name;
                equipmentChanged = true;
            }

            // --- Vessel Details ---
            const vesselUpdates: Record<string, unknown> = {};
            if (ref.specimen && !vessel.material) {
                vesselUpdates.material = ref.specimen.materialName;
            }
            if (ref.specimen && !vessel.nominal_thickness) {
                vesselUpdates.nominalThickness = `${ref.specimen.nominalThicknessMm} mm`;
            }
            const vesselDetailsChanged = Object.keys(vesselUpdates).length > 0;

            // Combine into single vessel update
            if (equipmentChanged || vesselDetailsChanged) {
                await updateVessel.mutateAsync({
                    id: vessel.id,
                    projectId,
                    params: {
                        ...(equipmentChanged ? { equipmentConfig } : {}),
                        ...vesselUpdates,
                    },
                });
                result.equipmentUpdated = equipmentChanged;
                result.vesselDetailsUpdated = vesselDetailsChanged;
            }

            // --- Scan Log Entries ---
            const existingScanFilenames = new Set(
                existingScanEntries.map(e => e.filename?.toLowerCase()).filter(Boolean)
            );

            for (let i = 0; i < companionFiles.length; i++) {
                const file = companionFiles[i];
                if (existingScanFilenames.has(file.filename.toLowerCase())) {
                    result.skipped++;
                    continue;
                }

                await createScanEntry.mutateAsync({
                    projectVesselId: vessel.id,
                    filename: file.filename,
                    dateInspected: formatNdeDate(file.creationDate) ?? undefined,
                    scanStartX: file.scanRangeMm[0],
                    scanEndX: file.scanRangeMm[1],
                    indexStartY: file.indexRangeMm[0],
                    indexEndY: file.indexRangeMm[1],
                    scanIndexDatum: parseDatumFromFilename(file.filename) ?? undefined,
                    sortOrder: existingScanEntries.length + result.scanLogAdded,
                });
                result.scanLogAdded++;
            }

            // --- Calibration Log (one entry per unique velocity/date combo) ---
            const existingCalVelocities = new Set(
                existingCalEntries.map(e => e.velocity).filter(v => v != null)
            );
            const velocity = ref.velocity;

            if (velocity && !existingCalVelocities.has(velocity)) {
                await createCalEntry.mutateAsync({
                    projectVesselId: vessel.id,
                    filename: ref.filename,
                    velocity,
                    calDate: formatNdeDate(ref.creationDate) ?? undefined,
                    scanStart: `${ref.scanRangeMm[0]}`,
                    scanEnd: `${ref.scanRangeMm[1]}`,
                    sortOrder: existingCalEntries.length,
                });
                result.calLogAdded++;
            }

            return result;
        } finally {
            setPopulating(false);
        }
    }, [companionFiles, updateVessel, createScanEntry, createCalEntry]);

    return {
        populate,
        populating,
        connected,
        fileCount: companionFiles?.length ?? 0,
    };
}
```

**Step 2: Commit**

```bash
git add src/hooks/mutations/usePopulateFromCompanion.ts
git commit -m "feat: add usePopulateFromCompanion hook"
```

---

## Task 6: Add Companion Populate Button to InspectionDetailPage

**Files:**
- Modify: `src/pages/projects/InspectionDetailPage.tsx`

**Step 1: Add the button and status banner to the page header**

Import the hook and add the button next to the status badge / "Open 3D Modeler" button area. The button shows companion connection state and triggers population with a confirmation toast.

Add import:
```typescript
import { usePopulateFromCompanion } from '../../hooks/mutations/usePopulateFromCompanion';
import { Radio } from 'lucide-react';
```

Add hook call after `updateVessel`:
```typescript
    const {
        populate: populateFromCompanion,
        populating,
        connected: companionConnected,
        fileCount: companionFileCount,
    } = usePopulateFromCompanion();

    const [populateMsg, setPopulateMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handlePopulateFromCompanion = useCallback(async () => {
        if (!vessel || !projectId) return;
        try {
            const result = await populateFromCompanion(vessel, projectId, scanLogEntries, calLogEntries);
            const parts: string[] = [];
            if (result.equipmentUpdated) parts.push('equipment');
            if (result.vesselDetailsUpdated) parts.push('vessel details');
            if (result.scanLogAdded > 0) parts.push(`${result.scanLogAdded} scan log entries`);
            if (result.calLogAdded > 0) parts.push(`${result.calLogAdded} calibration entries`);
            if (result.skipped > 0) parts.push(`${result.skipped} duplicates skipped`);

            if (parts.length === 0) {
                setPopulateMsg({ type: 'success', text: 'Nothing new to populate — all data already present.' });
            } else {
                setPopulateMsg({ type: 'success', text: `Populated: ${parts.join(', ')}` });
            }
        } catch (err) {
            setPopulateMsg({ type: 'error', text: err instanceof Error ? err.message : 'Population failed' });
        }
        setTimeout(() => setPopulateMsg(null), 6000);
    }, [vessel, projectId, scanLogEntries, calLogEntries, populateFromCompanion]);
```

**Step 2: Render the button**

In the header area, in the `<div>` that contains the status badge and "Open 3D Modeler" button (around line 279), add the companion button between them:

```tsx
{companionConnected && (
    <button
        onClick={handlePopulateFromCompanion}
        disabled={populating || companionFileCount === 0}
        className="btn btn--secondary btn--sm"
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        title={`${companionFileCount} NDE file${companionFileCount !== 1 ? 's' : ''} available`}
    >
        <Radio size={14} style={{ color: '#22c55e' }} />
        {populating ? 'Populating...' : `Populate from Companion (${companionFileCount})`}
    </button>
)}
```

**Step 3: Render the toast message**

At the top of the sections `<div>` (line 304, just inside the div with `padding: '24px 40px 40px'`):

```tsx
{populateMsg && (
    <div style={{
        padding: '10px 16px',
        marginBottom: 8,
        background: populateMsg.type === 'success'
            ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
        border: `1px solid ${populateMsg.type === 'success'
            ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
        borderRadius: 8,
        color: populateMsg.type === 'success' ? '#4ade80' : '#f87171',
        fontSize: '0.84rem',
    }}>
        {populateMsg.text}
    </div>
)}
```

**Step 4: Commit**

```bash
git add src/pages/projects/InspectionDetailPage.tsx
git commit -m "feat: add Populate from Companion button to inspection detail header"
```

---

## Task 7: Verify CreateCalibrationLogEntry Mutation Exists

**Files:**
- Check: `src/hooks/mutations/useInspectionProjectMutations.ts`

The `usePopulateFromCompanion` hook uses `useCreateCalibrationLogEntry`. Verify this mutation exists and accepts the params we need (`velocity`, `calDate`, `scanStart`, `scanEnd`). If it doesn't exist, create it following the exact same pattern as `useCreateScanLogEntry`.

**Step 1: Read the file and check**

If `useCreateCalibrationLogEntry` is missing, add it with the same pattern:

```typescript
export function useCreateCalibrationLogEntry() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (params: CreateCalibrationLogEntryParams) =>
            inspectionProjectService.createCalibrationLogEntry(params),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({
                queryKey: ['calibration-log-entries', variables.projectVesselId],
            });
        },
    });
}
```

Also verify the service layer has the corresponding method. If missing, add to `inspection-project-service.ts`:

```typescript
async createCalibrationLogEntry(params: CreateCalibrationLogEntryParams) {
    const { data, error } = await supabase
        .from('calibration_log_entries')
        .insert({
            project_vessel_id: params.projectVesselId,
            filename: params.filename,
            setup_file: params.setupFile ?? null,
            cal_date: params.calDate ?? null,
            scan_start: params.scanStart ?? null,
            scan_end: params.scanEnd ?? null,
            ref_a_wt: params.refAWt ?? null,
            meas_a_wt: params.measAWt ?? null,
            velocity: params.velocity ?? null,
            comments: params.comments ?? null,
            sort_order: params.sortOrder ?? 0,
        })
        .select()
        .single();
    if (error) throw error;
    return data;
},
```

**Step 2: Commit if changes made**

```bash
git add src/hooks/mutations/useInspectionProjectMutations.ts src/services/inspection-project-service.ts
git commit -m "feat: add createCalibrationLogEntry mutation + service method"
```

---

## Task 8: End-to-End Test

**No automated tests** — this is a manual integration test.

**Step 1: Start companion app with test NDE files**

```bash
cd "C:\Users\jonas\OneDrive\Desktop\ndt-companion"
python -m api.server
# In companion UI, set directory to "C:\Users\jonas\OneDrive\Desktop\TEST NDE files"
```

**Step 2: Verify companion API returns metadata**

```bash
curl http://localhost:18923/files | python -m json.tool
```

Confirm response includes `creationDate`, `probe`, `wedge`, `equipment`, `specimen`, `scanner` fields.

**Step 3: Open inspection detail page in NDT Suite**

1. Navigate to any project vessel's inspection detail page
2. Confirm "Populate from Companion (12)" button appears in header (green radio icon)
3. Click button
4. Verify:
   - Equipment section: model = "OmniScan X4 - 16:64PR", serial = "QC-0096426", probe = "7.5L64-I4", wedge = "HydroFORM", scanner = "HydroFORM2"
   - Vessel details: material = "Steel_Mild", nominal thickness = "20 mm"
   - Scan log: 12 rows with filenames, dates (2025-10-03), scan/index ranges
   - Calibration log: 1 entry with velocity = 5890
5. Click button again — toast shows "Nothing new to populate"

**Step 4: Run build**

```bash
cd "C:\Users\jonas\OneDrive\Desktop\NDT SUITE UMBER"
npm run build
```

Ensure no TypeScript errors.

---

## Field Mapping Reference

| NDE HDF5 Path | Companion API Field | Form Section | Form Field |
|---|---|---|---|
| `Properties.file.creationDate` | `creationDate` | Scan Log | `date_inspected` |
| `Setup.probes[0].model` | `probe.model` | Equipment | `probe` |
| `Setup.wedges[0].model` | `wedge.model` | Equipment | `wedge` |
| `Setup.acquisitionUnits[0].model` | `equipment.model` | Equipment | `model` |
| `Setup.acquisitionUnits[0].serialNumber` | `equipment.serialNumber` | Equipment | `serial_no` |
| `Setup.motionDevices[0].name` | `scanner.name` | Equipment | `scanner_frame` |
| `Setup.specimens[0].material.name` | `specimen.materialName` | Vessel Details | `material` |
| `Setup.specimens[0].thickness` | `specimen.nominalThicknessMm` | Vessel Details | `nominal_thickness` |
| `Setup.ultrasonicPhasedArray.velocity` | `velocity` | Calibration Log | `velocity` |
| `Setup.dataMappings.dimensions[U]` | `scanRangeMm` | Scan Log | `scan_start_x`, `scan_end_x` |
| `Setup.dataMappings.dimensions[V]` | `indexRangeMm` | Scan Log | `index_start_y`, `index_end_y` |

## Populate Behavior

- **Only fills empty fields** — never overwrites existing data
- **Deduplicates scan log** — skips files already present (by filename match)
- **Uses first file as reference** for equipment/vessel (all files share setup)
- **One-click operation** — single button, no confirmation dialog needed
- **Toast feedback** — shows what was populated or "nothing new"
