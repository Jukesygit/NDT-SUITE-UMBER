# Nozzle Orientation Modes

## Objective
Add per-nozzle orientation control so nozzles can maintain fixed horizontal or vertical pipe axis directions instead of always projecting radially from the shell centerline.

## Data Model
Add one field to `NozzleConfig` in `types.ts`:

```typescript
orientationMode?: 'radial' | 'horizontal' | 'vertical-up' | 'vertical-down';
```

- `undefined` / `'radial'` = current behavior (backward compatible)
- `'horizontal'` = pipe axis fixed to horizontal plane
- `'vertical-up'` = pipe axis fixed to +Y world
- `'vertical-down'` = pipe axis fixed to -Y world

No other fields change. `pos`, `angle`, `proj` retain their current meaning.

## Orientation Logic (vessel-geometry.ts)
Position calculation is unchanged - nozzle base always placed at shell surface intersection from `pos` and `angle`.

Normal vector override based on mode:
- **Radial**: Use computed surface normal (no change)
- **Horizontal**: Project radial direction onto horizontal plane (zero Y), normalize
- **Vertical Up**: `normal = (0, 1, 0)`
- **Vertical Down**: `normal = (0, -1, 0)`

Edge case: nozzle at 90°/270° on horizontal vessel with "horizontal" mode - radial direction is pure vertical, horizontal projection is zero. Fall back to radial.

## UI (SidebarPanel.tsx)
Segmented control in nozzle edit form:

```
Orientation
[ Radial | Horiz | ▲ | ▼ ]
```

- Matches existing sidebar styling
- Default: Radial for all new/existing nozzles
- Drag-drop always creates radial nozzles; user switches after placement

## Files to Modify
1. `src/components/VesselModeler/types.ts` - Add `orientationMode` to `NozzleConfig`
2. `src/components/VesselModeler/engine/vessel-geometry.ts` - Override normal based on mode
3. `src/components/VesselModeler/SidebarPanel.tsx` - Add segmented control UI
