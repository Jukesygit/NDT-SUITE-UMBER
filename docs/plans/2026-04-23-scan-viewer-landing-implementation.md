# Scan Viewer Landing Page Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the Scan Viewer landing page to be the full companion control panel — browse directories, discover NDE + eddify files, convert eddify to NDE, and generate composites from a single dashboard.

**Architecture:** Three companion API changes (new browse endpoint, modified folders endpoint to include eddify entries, modified convert endpoint for batch + output folder). Frontend: new service functions, mutation hooks, and a redesigned landing page component with directory bar, mixed file browser, inline conversion panel, and generate button.

**Tech Stack:** Python/FastAPI (companion), React 18 + TypeScript + React Query 5 (webapp)

---

## Task 1: Companion — Browse Directory Endpoint

**Files:**
- Modify: `C:\Users\jonas\OneDrive\Desktop\ndt-companion\api\routes.py`

**Step 1: Add the browse-directory endpoint**

Add a new Pydantic model and endpoint before the `return router` line. The endpoint opens a native tkinter folder dialog on the companion machine, then indexes the selected directory.

```python
# Add to request models section (near line 40)
class BrowseDirectoryResponse(BaseModel):
    path: Optional[str] = None
    fileCount: int = 0

# Add inside create_router(), before "return router"
@router.post("/browse-directory")
def browse_directory():
    """Open a native folder picker dialog and set the directory."""
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    folder = filedialog.askdirectory(title="Select NDE / Eddify Folder")
    root.destroy()

    if not folder or not os.path.isdir(folder):
        return {"path": None, "fileCount": 0}

    files = index_folder(folder)
    file_cache["files"] = files
    file_cache["directory"] = folder

    return {"path": folder, "fileCount": len(files)}
```

**Step 2: Test manually**

```bash
cd C:\Users\jonas\OneDrive\Desktop\ndt-companion
py -c "
import requests
r = requests.post('http://localhost:18923/browse-directory')
print(r.json())
"
```

Expected: Native folder dialog opens. After selection: `{"path": "...", "fileCount": N}`.

**Step 3: Commit**

```bash
cd C:\Users\jonas\OneDrive\Desktop\ndt-companion
git add api/routes.py
git commit -m "feat: add POST /browse-directory endpoint with native folder picker"
```

---

## Task 2: Companion — Extend Folders Endpoint to Include Eddify

**Files:**
- Modify: `C:\Users\jonas\OneDrive\Desktop\ndt-companion\api\routes.py` (function `_scan_subfolders` around line 980)

**Step 1: Modify `_scan_subfolders` to also detect `.capture_acq` directories**

```python
def _scan_subfolders(base_dir: str, query: Optional[str] = None) -> list[dict]:
    """Scan base directory for subfolders containing .nde files and .capture_acq directories."""
    results = []
    try:
        entries = sorted(os.listdir(base_dir))
    except OSError:
        return []

    for name in entries:
        full_path = os.path.join(base_dir, name)
        if not os.path.isdir(full_path):
            continue

        if query and query.lower() not in name.lower():
            continue

        # Check for .capture_acq directories (eddify files)
        if name.lower().endswith(".capture_acq"):
            # Verify it has root.xml (valid eddify capture)
            if os.path.isfile(os.path.join(full_path, "root.xml")):
                results.append({"name": name, "fileCount": 0, "type": "eddify"})
            continue

        # Check for NDE files
        nde_count = sum(
            1 for f in os.listdir(full_path) if f.lower().endswith(".nde")
        )
        if nde_count > 0:
            results.append({"name": name, "fileCount": nde_count, "type": "nde"})

    return results
```

**Step 2: Test**

```bash
py -c "
import requests
r = requests.get('http://localhost:18923/folders')
for f in r.json()['folders']:
    print(f'{f[\"type\"]:8s} {f[\"name\"]:60s} {f.get(\"fileCount\", 0)} files')
"
```

Expected: Both `nde` and `eddify` type entries appear.

**Step 3: Commit**

```bash
git add api/routes.py
git commit -m "feat: extend /folders to detect .capture_acq eddify directories"
```

---

## Task 3: Companion — Batch Convert Endpoint

**Files:**
- Modify: `C:\Users\jonas\OneDrive\Desktop\ndt-companion\api\routes.py`

**Step 1: Replace the existing convert-eddify endpoint with batch version**

Update the request model and endpoint:

```python
# Replace ConvertEddifyRequest model (near line 43)
class ConvertEddifyRequest(BaseModel):
    capture_dirs: list[str]          # relative folder names within companion directory
    output_folder: str               # name for the output folder (created in companion directory)

# Replace the @router.post("/convert-eddify") endpoint
@router.post("/convert-eddify")
def convert_eddify(req: ConvertEddifyRequest):
    """Convert one or more eddify .capture_acq directories to .nde files in a named output folder."""
    from engine.eddify_converter import convert_capture_acq

    base_dir = file_cache.get("directory")
    if not base_dir:
        raise HTTPException(status_code=400, detail="No directory set")

    # Create output folder
    output_dir = os.path.join(base_dir, req.output_folder)
    os.makedirs(output_dir, exist_ok=True)

    results = []
    for cap_name in req.capture_dirs:
        capture_path = os.path.join(base_dir, cap_name)
        if not os.path.isdir(capture_path):
            results.append({"name": cap_name, "status": "error", "detail": "Directory not found"})
            continue

        # Output .nde filename: strip .capture_acq extension
        nde_name = cap_name
        if nde_name.lower().endswith(".capture_acq"):
            nde_name = nde_name[:-len(".capture_acq")]
        nde_name = nde_name.strip() + ".nde"
        output_path = os.path.join(output_dir, nde_name)

        try:
            convert_capture_acq(capture_path, output_path)
            size_mb = os.path.getsize(output_path) / (1024 * 1024)
            results.append({"name": cap_name, "status": "ok", "output": nde_name, "sizeMb": round(size_mb, 1)})
        except Exception as e:
            logger.exception("Failed to convert %s", cap_name)
            results.append({"name": cap_name, "status": "error", "detail": str(e)})

    # Re-index to pick up new files
    files = index_folder(base_dir)
    file_cache["files"] = files

    return {
        "output_folder": req.output_folder,
        "results": results,
        "files_converted": sum(1 for r in results if r["status"] == "ok"),
        "files_failed": sum(1 for r in results if r["status"] == "error"),
    }
```

**Step 2: Commit**

```bash
git add api/routes.py
git commit -m "feat: batch eddify conversion with named output folder"
```

---

## Task 4: Webapp — Service Functions and Types

**Files:**
- Modify: `src\types\companion.ts`
- Modify: `src\services\companion-service.ts`

**Step 1: Update types**

Add `type` field to `CompanionFolder` in `src\types\companion.ts`:

```typescript
export interface CompanionFolder {
  name: string;
  fileCount: number;
  type: 'nde' | 'eddify';
}
```

Add conversion types:

```typescript
export interface EddifyConvertRequest {
  capture_dirs: string[];
  output_folder: string;
}

export interface EddifyConvertResult {
  output_folder: string;
  results: Array<{
    name: string;
    status: 'ok' | 'error';
    output?: string;
    sizeMb?: number;
    detail?: string;
  }>;
  files_converted: number;
  files_failed: number;
}

export interface BrowseDirectoryResult {
  path: string | null;
  fileCount: number;
}
```

**Step 2: Add service functions to `src\services\companion-service.ts`**

```typescript
/** Open native folder picker on companion and set directory. */
export async function browseDirectory(
  port: number,
): Promise<BrowseDirectoryResult> {
  const res = await fetch(`http://localhost:${port}/browse-directory`, {
    method: 'POST',
    signal: AbortSignal.timeout(120000), // long timeout — user is picking a folder
  });
  if (!res.ok) {
    throw new Error(`Browse directory failed: ${res.status}`);
  }
  return res.json();
}

/** Set companion directory to a specific path. */
export async function setDirectory(
  port: number,
  path: string,
): Promise<{ fileCount: number }> {
  const res = await fetch(`http://localhost:${port}/set-directory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`Set directory failed: ${res.status}`);
  }
  return res.json();
}

/** Convert eddify .capture_acq files to .nde in a named output folder. */
export async function convertEddify(
  port: number,
  captureDirs: string[],
  outputFolder: string,
): Promise<EddifyConvertResult> {
  const res = await fetch(`http://localhost:${port}/convert-eddify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ capture_dirs: captureDirs, output_folder: outputFolder }),
    signal: AbortSignal.timeout(600000), // 10 min — conversion is slow
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Eddify conversion failed: ${detail}`);
  }
  return res.json();
}
```

**Step 3: Add imports to companion-service.ts**

Add to the import block at the top:

```typescript
import type {
  CompositeData,
  CompanionFolder,
  GateSettings,
  BrowseDirectoryResult,
  EddifyConvertResult,
} from '../types/companion';
```

**Step 4: Commit**

```bash
git add src/types/companion.ts src/services/companion-service.ts
git commit -m "feat: add companion service functions for browse directory and eddify conversion"
```

---

## Task 5: Webapp — Mutation Hooks

**Files:**
- Modify: `src\hooks\mutations\useCompanionMutations.ts`

**Step 1: Add browse and convert mutation hooks**

```typescript
import {
  fetchComposite,
  refreshIndex,
  browseDirectory,
  convertEddify,
} from '../../services/companion-service';

// ... existing hooks ...

/**
 * Hook for opening the companion's native folder browser and setting the directory.
 * Invalidates companion status and folder listings on success.
 */
export function useBrowseDirectory() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (port: number) => browseDirectory(port),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companion-status'] });
      qc.invalidateQueries({ queryKey: ['companion-folders'] });
    },
  });
}

/**
 * Hook for converting eddify .capture_acq files to .nde format.
 * Invalidates folder listings on success.
 */
export function useConvertEddify() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (params: { port: number; captureDirs: string[]; outputFolder: string }) =>
      convertEddify(params.port, params.captureDirs, params.outputFolder),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['companion-folders'] });
      qc.invalidateQueries({ queryKey: ['companion-status'] });
    },
  });
}
```

**Step 2: Commit**

```bash
git add src/hooks/mutations/useCompanionMutations.ts
git commit -m "feat: add mutation hooks for browse directory and eddify conversion"
```

---

## Task 6: Webapp — Redesigned Landing Page

**Files:**
- Modify: `src\pages\ScanViewerLandingPage.tsx`

This is the largest task. The page is restructured from the current flow (folder list + generate button) into the full companion dashboard.

**Step 1: Rewrite the "not connected" and "connected, no composite" sections**

The new layout for the pre-composite state:

```
┌─────────────────────────────────────────────────┐
│  PageHeader: Scan Viewer                         │
├─────────────────────────────────────────────────┤
│  Directory Bar                                   │
│  [path display or "No directory set"]   [Browse] │
├─────────────────────────────────────────────────┤
│  File Browser                                    │
│  ☑ V0802A Shell        5 files          nde     │
│  ☑ V0802A Dome         3 files          nde     │
│  ☐ V0802A 0-784.capture_acq            eddify   │
│  ☐ V0802A 500-1000.capture_acq         eddify   │
├─────────────────────────────────────────────────┤
│  Eddify Conversion Panel (if eddify selected)    │
│  Output folder: [V0802A Shell New    ]           │
│  [Convert 2 files]     ████████░░ 45%            │
├─────────────────────────────────────────────────┤
│  [Generate Composite]  (from N selected folders) │
└─────────────────────────────────────────────────┘
```

Key implementation details:

- Two separate selection arrays: `selectedNdeFolders` and `selectedEddifyFiles`
- `outputFolderName` state pre-populated from common prefix of selected eddify files
- Conversion panel only visible when `selectedEddifyFiles.length > 0`
- Generate button only enabled when `selectedNdeFolders.length > 0`
- After conversion completes: clear eddify selection, the new folder appears in the NDE list on next refetch
- The "not connected" state stays the same but with slightly updated messaging

For the directory bar when no directory is set, make the Browse button more prominent (primary styling instead of link style).

**Step 2: Implement**

Replace the `if (!composite)` block (lines ~318-456) with the new dashboard layout. Keep the existing composite viewer (`if (composite)` block, lines 460-671) unchanged.

Key state additions at the top of the component:

```typescript
const browseMutation = useBrowseDirectory();
const convertMutation = useConvertEddify();
const [selectedEddifyFiles, setSelectedEddifyFiles] = useState<string[]>([]);
const [outputFolderName, setOutputFolderName] = useState('');
```

The directory bar:

```tsx
<div style={{
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  background: 'var(--surface-elevated)',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-subtle)',
  marginBottom: 16,
}}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
    <FolderIcon />
    <span style={{
      fontSize: '0.82rem',
      color: directory ? 'var(--text-secondary)' : 'var(--text-quaternary)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }}>
      {directory || 'No directory set'}
    </span>
  </div>
  <button
    onClick={() => port && browseMutation.mutate(port)}
    disabled={!port || browseMutation.isPending}
    style={{
      fontSize: '0.78rem',
      padding: '6px 16px',
      borderRadius: 6,
      border: '1px solid #3b82f6',
      background: 'rgba(59,130,246,0.15)',
      color: '#93c5fd',
      cursor: 'pointer',
      flexShrink: 0,
    }}
  >
    {browseMutation.isPending ? 'Browsing...' : 'Browse'}
  </button>
</div>
```

The file list renders both types with visual distinction:

```tsx
{folders.map(f => {
  const isEddify = f.type === 'eddify';
  const isSelected = isEddify
    ? selectedEddifyFiles.includes(f.name)
    : selectedFolders.includes(f.name);

  return (
    <button
      key={f.name}
      onClick={() => isEddify ? toggleEddify(f.name) : toggleFolder(f.name)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        background: isSelected
          ? isEddify ? 'rgba(251,191,36,0.08)' : 'rgba(59,130,246,0.1)'
          : 'var(--surface-elevated)',
        border: `1px solid ${isSelected
          ? isEddify ? '#d97706' : '#3b82f6'
          : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isEddify ? <PackageIcon /> : <FolderSmallIcon />}
        <span style={{
          fontSize: '0.85rem',
          color: isSelected
            ? isEddify ? '#fbbf24' : '#93c5fd'
            : 'var(--text-secondary)',
        }}>
          {f.name}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {!isEddify && (
          <span style={{ fontSize: '0.72rem', color: 'var(--text-quaternary)' }}>
            {f.fileCount} file{f.fileCount !== 1 ? 's' : ''}
          </span>
        )}
        <span style={{
          fontSize: '0.65rem',
          padding: '2px 6px',
          borderRadius: 4,
          background: isEddify ? 'rgba(251,191,36,0.1)' : 'rgba(59,130,246,0.08)',
          color: isEddify ? '#d97706' : '#60a5fa',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {isEddify ? 'eddify' : 'nde'}
        </span>
      </div>
    </button>
  );
})}
```

The conversion panel (only shown when eddify files selected):

```tsx
{selectedEddifyFiles.length > 0 && (
  <div style={{
    marginTop: 12,
    padding: 16,
    background: 'rgba(251,191,36,0.05)',
    border: '1px solid rgba(251,191,36,0.15)',
    borderRadius: 'var(--radius-sm)',
  }}>
    <div style={{ fontSize: '0.72rem', color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
      Convert {selectedEddifyFiles.length} eddify file{selectedEddifyFiles.length !== 1 ? 's' : ''} to NDE
    </div>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        type="text"
        value={outputFolderName}
        onChange={e => setOutputFolderName(e.target.value)}
        placeholder="Output folder name"
        style={{
          flex: 1,
          padding: '8px 12px',
          fontSize: '0.82rem',
          background: 'var(--surface-base)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 6,
          color: 'var(--text-primary)',
          outline: 'none',
        }}
      />
      <button
        onClick={handleConvert}
        disabled={!outputFolderName.trim() || convertMutation.isPending}
        style={{
          fontSize: '0.82rem',
          padding: '8px 20px',
          borderRadius: 6,
          border: '1px solid #d97706',
          background: 'rgba(251,191,36,0.15)',
          color: '#fbbf24',
          cursor: 'pointer',
          flexShrink: 0,
          opacity: !outputFolderName.trim() || convertMutation.isPending ? 0.4 : 1,
        }}
      >
        {convertMutation.isPending ? 'Converting...' : 'Convert'}
      </button>
    </div>
    {convertMutation.isPending && (
      <div style={{ marginTop: 10 }}>
        <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: '50%', background: '#d97706', borderRadius: 2, animation: 'pulse 1.5s infinite' }} />
        </div>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-quaternary)', marginTop: 4, display: 'block' }}>
          This may take several minutes for large files...
        </span>
      </div>
    )}
    {convertMutation.isSuccess && (
      <div style={{ marginTop: 8, fontSize: '0.78rem', color: '#4ade80' }}>
        Converted {convertMutation.data.files_converted} file{convertMutation.data.files_converted !== 1 ? 's' : ''} to "{convertMutation.data.output_folder}"
      </div>
    )}
    {convertMutation.isError && (
      <div style={{ marginTop: 8, fontSize: '0.78rem', color: '#f87171' }}>
        {convertMutation.error instanceof Error ? convertMutation.error.message : 'Conversion failed'}
      </div>
    )}
  </div>
)}
```

Helper functions:

```typescript
const toggleEddify = useCallback((name: string) => {
  setSelectedEddifyFiles(prev =>
    prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name],
  );
}, []);

// Auto-populate output folder name from common prefix
useEffect(() => {
  if (selectedEddifyFiles.length === 0) {
    setOutputFolderName('');
    return;
  }
  // Find common prefix, strip trailing numbers/spaces/dashes
  const names = selectedEddifyFiles.map(n =>
    n.replace(/\.capture_acq$/i, ''),
  );
  let prefix = names[0];
  for (const name of names.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < name.length && prefix[i] === name[i]) i++;
    prefix = prefix.slice(0, i);
  }
  // Clean trailing spaces, dashes, underscores, digits
  prefix = prefix.replace(/[\s\-_\d]+$/, '').trim();
  setOutputFolderName(prefix || 'Converted');
}, [selectedEddifyFiles]);

const handleConvert = useCallback(() => {
  if (!port || selectedEddifyFiles.length === 0 || !outputFolderName.trim()) return;
  convertMutation.mutate(
    { port, captureDirs: selectedEddifyFiles, outputFolder: outputFolderName.trim() },
    {
      onSuccess: () => {
        setSelectedEddifyFiles([]);
      },
    },
  );
}, [port, selectedEddifyFiles, outputFolderName, convertMutation]);
```

Small SVG icon components to add at the bottom of the file:

```tsx
function FolderIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function FolderSmallIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}
```

**Step 3: Add imports at top of ScanViewerLandingPage.tsx**

```typescript
import { useBrowseDirectory, useConvertEddify } from '../hooks/mutations/useCompanionMutations';
```

**Step 4: Test in browser**

1. Navigate to Scan Viewer
2. Click Browse — native folder picker should open on the companion machine
3. Select a directory containing both `.nde` folders and `.capture_acq` files
4. Verify both types appear in the list with correct badges
5. Check eddify files — conversion panel appears with auto-populated name
6. Click Convert — conversion runs, success message shown
7. Folder list refreshes — new NDE folder appears
8. Select NDE folders — Generate Composite works as before

**Step 5: Commit**

```bash
git add src/pages/ScanViewerLandingPage.tsx
git commit -m "feat: redesign scan viewer landing with directory browser and eddify conversion"
```

---

## Task 7: Polish — Handle Edge Cases

**Files:**
- Modify: `src\pages\ScanViewerLandingPage.tsx`

**Step 1: Handle these cases**

- **Companion not connected**: Show connection message with suggestion to start the companion app (current behavior, keep as-is)
- **Connected but no directory**: Show the directory bar prominently with the Browse button. Hide the file list and generate button. Show a helpful message: "Browse to a folder containing NDE or Eddify scan files"
- **Directory set but empty**: Show "No NDE or Eddify files found in this directory"
- **Browse cancelled**: `browseMutation` returns `path: null` — don't change anything
- **Conversion error**: Show error message in the conversion panel (already handled via `convertMutation.isError`)
- **Mixed selection**: User can have both NDE folders checked (for composite) and eddify files checked (for conversion) simultaneously — these are independent actions

**Step 2: Test edge cases in browser**

**Step 3: Commit**

```bash
git add src/pages/ScanViewerLandingPage.tsx
git commit -m "fix: handle edge cases in scan viewer landing page"
```
