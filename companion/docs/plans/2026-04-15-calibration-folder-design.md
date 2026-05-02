# Calibration Folder & Auto-Populate Calibration Scan Log

## Objective

Add a dedicated calibration folder to the companion app that parses NDE calibration
files (step-wedge scans) and exposes structured calibration data via API. The web app
then auto-populates the calibration scan log from this data.

## Architecture

### Companion App Changes

1. **Config** (`config.py`): New `calibrationDirectory` field — user-chosen path,
   independent of the main NDE scan folder.

2. **Tray menu** (`ui/tray.py`): New "Set Calibration Folder..." item with folder
   picker dialog. Persists to config, indexes cal files on selection.

3. **Engine** (`engine/calibration.py`): New module:
   - `detect_steps(thickness_grid, nominal_mm)` — histogram peak detection to find
     step-wedge thickness steps. Returns list of step measurements.
   - `extract_calibration(file_index)` — runs `extract_cscan()` + `detect_steps()`,
     assembles full calibration data structure.

4. **API** (`api/routes.py`): New endpoints:
   - `POST /set-calibration-directory` — set cal folder path, index files
   - `GET /calibration-files` — returns parsed calibration data per file

### Web App Changes

5. **Hook** (`src/hooks/queries/useCompanionCalibrationFiles.ts`): Polls
   `GET /calibration-files` when companion is connected.

6. **UI** (`CalibrationLogSection.tsx`): Two new buttons:
   - "Auto-populate" — creates entries for all cal files, skips duplicates by filename
   - "Import from Companion" — selective review modal

### Data Flow

```
Cal folder (*.nde)
  -> companion indexes (FileIndex)
  -> extract_cscan() for thickness grid
  -> detect_steps() for step-wedge analysis
  -> /calibration-files returns structured JSON
  -> web app fetches via useCompanionCalibrationFiles
  -> user clicks Auto-populate or Import
  -> creates CalibrationLogEntry rows via existing mutation
```

### Calibration File Response Schema

```json
{
  "filename": "35-6002 CALIN_2026_02_20.nde",
  "setupFile": "General Mapping",
  "calDate": "2026-02-20T14:11:20+00:00",
  "scanStartMm": 0.0,
  "scanEndMm": 220.0,
  "velocity": 5890.0,
  "refAWt": 15.0,
  "measAWt": 15.19,
  "equipment": { "model": "OmniScan X3", "serial": "QC-0089244" },
  "probe": { "model": "7.5L64-I8", "frequencyMhz": 7.5 },
  "wedge": { "model": "HydroFORM2" },
  "material": "Steel_Mild",
  "beamCount": 61,
  "steps": [
    { "nominalMm": 5.0, "measuredMm": 5.07, "stdMm": 0.04, "readingCount": 1371 },
    { "nominalMm": 10.0, "measuredMm": 10.12, "stdMm": 0.06, "readingCount": 2984 },
    { "nominalMm": 15.0, "measuredMm": 15.19, "stdMm": 0.08, "readingCount": 2715, "isReference": true },
    { "nominalMm": 20.0, "measuredMm": 20.24, "stdMm": 0.09, "readingCount": 2871 }
  ]
}
```

### Step Detection Algorithm

1. Run `extract_cscan()` with default gate params -> thickness grid
2. Flatten valid (non-NaN) values
3. Histogram with 0.25mm bins
4. Find peaks in histogram (min distance ~3mm, min count ~50)
5. For each peak: filter readings within +/-1mm, compute median + std
6. Flag the step closest to `specimen.nominal_thickness_mm` as reference
7. `measAWt` = median of reference step

### Comments Format

Auto-generated comment for cal log entries:
```
Step wedge: 5.07mm (ref 5.0) | 10.12mm (ref 10.0) | 15.19mm (ref 15.0)* | 20.24mm (ref 20.0)
```
