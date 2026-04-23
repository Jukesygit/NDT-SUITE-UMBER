# Scan Viewer Landing Page Redesign

**Goal:** Redesign the Scan Viewer landing page to be the full companion control panel — set directory, discover NDE and eddify files, convert eddify to NDE, and generate composites — all from one page.

**Architecture:** Single dashboard layout (no wizard steps). Three vertical sections: directory bar, file browser (NDE + eddify mixed), and action bar. Three new companion API endpoints. One modified endpoint.

---

## Companion API Changes

### New: `POST /browse-directory`
Opens a native tkinter folder picker on the companion machine. Blocks until dialog closes. On selection, auto-indexes the directory.

**Response:**
```json
{ "path": "D:/Inspection Data/V0802A", "fileCount": 5 }
```
Returns `{ "path": null }` if cancelled.

### Modified: `GET /folders`
Extended to also return `.capture_acq` entries. Each item gets a `type` field.

**Response:**
```json
{
  "folders": [
    { "name": "V0802A Shell", "fileCount": 5, "type": "nde" },
    { "name": "V0802A 0-784MM 0-500MM 1.capture_acq", "fileCount": 0, "type": "eddify" }
  ],
  "total": 2
}
```

### Modified: `POST /convert-eddify`
Updated to accept multiple files and an output folder name. Resolves paths relative to current directory. Creates output folder, converts all files, re-indexes.

**Request:**
```json
{
  "capture_dirs": [
    "V0802A 0-784MM 0-500MM 1.capture_acq",
    "V0802A 0-784MM 500-1000MM 1.capture_acq"
  ],
  "output_folder": "V0802A Shell Section 1"
}
```

**Response:**
```json
{
  "output_folder": "V0802A Shell Section 1",
  "files_converted": 2,
  "total_size_mb": 1822.8,
  "status": "ok"
}
```

---

## Landing Page Layout

### 1. Directory Bar
- Compact row below PageHeader
- Shows current directory path (truncated) from `useCompanionApp().directory`
- "Browse" button on the right triggers `POST /browse-directory`
- If no directory set: shows prompt text with prominent Browse button
- On successful browse: refreshes folder list via query invalidation

### 2. File Browser
Single list showing both types:

**NDE folders:**
- Checkbox, folder icon, name, file count badge
- Selectable for composite generation
- Same visual style as current

**Eddify entries:**
- Checkbox, distinct icon/accent color, `.capture_acq` name
- Selectable for conversion (separate selection array)
- Package/convert icon to distinguish from NDE folders

### 3. Eddify Conversion Panel
- Only visible when eddify files are checked
- Text input for output folder name (pre-populated from common prefix of selected files)
- "Convert" button
- Progress bar during conversion
- On completion: deselects eddify files, refreshes list, new NDE folder appears

### 4. Action Bar
- "Generate Composite" button (operates on selected NDE folders)
- Disabled when no NDE folders selected
- Same behavior as current

---

## Conversion Flow

1. User opens Scan Viewer, clicks Browse, selects a directory
2. File list shows NDE folders and `.capture_acq` entries mixed together
3. User checks eddify files that belong together
4. Conversion panel appears with editable output folder name
5. User clicks Convert, progress bar shows per-file progress
6. On completion: eddify checkboxes clear, folder list refreshes, new NDE folder appears
7. User selects the new NDE folder, clicks Generate Composite
8. Normal scan viewer flow from here

---

## State Management

**Existing hooks used:**
- `useCompanionApp()` — connection status, port, directory
- `useCompanionFolders()` — folder list (modified to include eddify entries)
- `useRefreshCompanionIndex()` — refresh after conversion

**New hooks:**
- `useBrowseDirectory(port)` — mutation calling `POST /browse-directory`
- `useConvertEddify(port)` — mutation calling `POST /convert-eddify`

**Component state:**
- `selectedNdeFolders: string[]` — NDE folders checked for composite
- `selectedEddifyFiles: string[]` — eddify files checked for conversion
- `outputFolderName: string` — user-editable conversion output name
- `conversionProgress: { current: number, total: number, file: string } | null`

---

## Files to Create/Modify

**Companion (ndt-companion):**
- `api/routes.py` — Add `POST /browse-directory`, modify `GET /folders`, modify `POST /convert-eddify`

**Webapp (NDT Suite):**
- `src/pages/ScanViewerLandingPage.tsx` — Redesigned landing page
- `src/hooks/mutations/useCompanionMutations.ts` — Add browse + convert mutations
- `src/services/companion-service.ts` — Add `browseDirectory()` and `convertEddify()` functions
- `src/types/companion.ts` — Add `CompanionFolder.type` field, conversion types
