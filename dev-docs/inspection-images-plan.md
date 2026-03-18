# Feature: Inspection Image Annotations on Vessel

## Objective
Allow users to attach inspection photos to specific points on the vessel shell, visualized as a leader line projecting radially outward from a dot on the shell surface to a fixed-size thumbnail. Thumbnails are clickable to expand a full-size viewer with metadata fields. The entire layer is togglable.

## Design Decisions (confirmed with user)
- **Storage**: Base64 embedded in state (JSON save/load compatible)
- **Projection**: Always radially outward from shell
- **Shell marker**: Small dot at contact point + leader line to thumbnail
- **Thumbnails**: CSS2DRenderer (HTML overlay), fixed screen-pixel size
- **Full viewer**: Modal overlay with metadata fields (name, description, date, inspector, method, result)
- **Metadata**: Optional text fields, only visible in expanded modal
- **Draggable**: Yes, on vessel surface (like nozzles/textures)
- **Leader length**: Fixed global default (not per-image)
- **Screenshots**: Optional (include/exclude toggle)
- **Upload**: Via sidebar section

## Data Model

```typescript
export interface InspectionImageConfig {
  id: number;
  name: string;
  description?: string;
  date?: string;
  inspector?: string;
  method?: string;       // e.g., "RT", "UT", "MT", "PT", "VT"
  result?: string;       // e.g., "Pass", "Fail", "Requires Review"
  imageData: string;     // Base64 PNG/JPG
  pos: number;           // mm from left tangent line
  angle: number;         // degrees around circumference
}
```

Added to `VesselState`:
```typescript
inspectionImages: InspectionImageConfig[];
inspectionImagesVisible: boolean;
```

Global settings (in VesselModeler component state or VesselState.visuals):
```typescript
inspectionImageLeaderLength: number;   // default 300mm
inspectionImageThumbnailSize: number;  // default 64px
```

## Architecture (follows existing patterns)

| Concern | File | Notes |
|---------|------|-------|
| Types | `types.ts` | `InspectionImageConfig` interface, add to `VesselState`, add `'inspectionImage'` to `DragType` |
| 3D geometry | `engine/inspection-image-geometry.ts` | Leader line (THREE.Line) + dot (THREE.Mesh sphere) using `shellPoint()` |
| CSS2D thumbnails | `engine/inspection-image-labels.ts` | HTML img elements as CSS2DObject, click handlers |
| Sidebar UI | `SidebarPanel.tsx` | New collapsible "Inspection Images" section with upload + list |
| Image viewer modal | `InspectionImageViewer.tsx` | Lightbox modal with metadata fields |
| State management | `VesselModeler.tsx` | CRUD + toggle visibility handlers |
| Interaction | `interaction-manager.ts` | Drag support for `'inspectionImage'` drag type |
| Callbacks | `types.ts` | `onInspectionImageSelected`, `onInspectionImageMoved` |

## Implementation Steps

### Phase 1: Types & Data Model
1. Add `InspectionImageConfig` interface to `types.ts`
2. Add `inspectionImages: InspectionImageConfig[]` and `inspectionImagesVisible: boolean` to `VesselState`
3. Add `'inspectionImage'` to `DragType` union
4. Add callbacks to `VesselCallbacks`
5. Update `DEFAULT_VESSEL_STATE`

### Phase 2: 3D Geometry (engine/inspection-image-geometry.ts)
1. Create `createInspectionImageMarkers()` function:
   - For each image config, compute shell surface point via `shellPoint()`
   - Create small sphere mesh at shell contact point (dot marker)
   - Create `THREE.Line` from shell point projecting radially outward by leader length
   - Return a `THREE.Group` containing all markers
2. Add `updateInspectionImageMarkers()` for state changes
3. Add `disposeInspectionImageMarkers()` for cleanup

### Phase 3: CSS2D Thumbnail Labels (engine/inspection-image-labels.ts)
1. Create `createInspectionImageLabels()`:
   - For each image, create an HTML `<div>` with `<img>` thumbnail
   - Position at the outer end of the leader line (shellPoint + radial offset)
   - Wrap in `CSS2DObject`
   - Attach click handler data attribute (image ID)
2. Handle visibility toggle
3. Cleanup function

### Phase 4: Scene Integration (ThreeViewport.tsx + scene-manager.ts)
1. Wire up geometry creation/update in the vessel rebuild flow
2. Pass visibility toggle through
3. Handle click events from CSS2D elements → bubble up to VesselModeler

### Phase 5: Interaction Manager
1. Add `'inspectionImage'` to drag type handling
2. Raycast against inspection image dot markers for selection
3. On drag, update pos/angle like nozzles

### Phase 6: Sidebar UI
1. New "Inspection Images" collapsible section in SidebarPanel
2. Upload button (file input, convert to base64)
3. List of images with name, thumbnail preview, delete button
4. Selected image: edit name field, pos/angle readout
5. Global toggle: Eye/EyeOff for visibility

### Phase 7: Image Viewer Modal
1. `InspectionImageViewer.tsx` component
2. Full-size image display
3. Metadata fields: name, description, date, inspector, method, result
4. Edit/save metadata
5. Close button / click-outside-to-close

### Phase 8: VesselModeler State Wiring
1. Add state + handlers for inspection images (add/update/remove/select)
2. Wire sidebar props
3. Wire viewport props
4. Include in JSON save/load

## Testing Plan
- Add an inspection image via sidebar, verify dot + line + thumbnail appear
- Drag image to new position, verify state updates
- Toggle visibility, verify all markers hide/show
- Click thumbnail, verify modal opens with full image
- Save JSON, reload, verify images persist
- Test with horizontal and vertical vessel orientations
