// =============================================================================
// structuralHash — appendage structural-field coverage (design §7 / C6)
// =============================================================================
// Guards the rebuild-trigger allowlist: STRUCTURAL appendage edits (geometry)
// must change the hash so the scene rebuilds; COSMETIC edits (name, visible,
// locked, nominalThickness) must NOT, or they cause rebuild storms.
//
// Imported from the pure `structural-hash` module, NOT from ThreeViewport, so
// the test never drags renderer/WebGL setup into jsdom.
// =============================================================================

import { describe, it, expect } from 'vitest';

import { DEFAULT_VESSEL_STATE, type AppendageConfig, type VesselState } from '../../types';
import { structuralHash } from '../structural-hash';
import { createAppendage } from '../appendage-config';

function stateWith(appendage: AppendageConfig): VesselState {
  return { ...DEFAULT_VESSEL_STATE, appendages: [appendage] };
}

const base = createAppendage([]); // 'app-1' with design defaults
const baseHash = structuralHash(stateWith(base));

// ---------------------------------------------------------------------------
// Structural edits MUST change the hash
// ---------------------------------------------------------------------------

describe('structuralHash changes on a structural appendage edit', () => {
  it('changes when diameter changes', () => {
    expect(structuralHash(stateWith({ ...base, diameter: base.diameter + 100 }))).not.toBe(
      baseHash
    );
  });

  it('changes when mountPos changes', () => {
    expect(structuralHash(stateWith({ ...base, mountPos: base.mountPos + 250 }))).not.toBe(
      baseHash
    );
  });

  it('changes when mountAngle / length / endClosure / headRatio change', () => {
    expect(structuralHash(stateWith({ ...base, mountAngle: 90 }))).not.toBe(baseHash);
    expect(structuralHash(stateWith({ ...base, length: base.length + 300 }))).not.toBe(baseHash);
    expect(structuralHash(stateWith({ ...base, endClosure: 'flat' }))).not.toBe(baseHash);
    expect(structuralHash(stateWith({ ...base, headRatio: 3.0 }))).not.toBe(baseHash);
  });

  it('changes when the flange-joint visibility toggles', () => {
    const shown = structuralHash(stateWith({ ...base, flangeJoint: { show: true } }));
    const hidden = structuralHash(stateWith({ ...base, flangeJoint: { show: false } }));
    expect(shown).not.toBe(hidden);
  });
});

// ---------------------------------------------------------------------------
// Cosmetic edits must NOT change the hash
// ---------------------------------------------------------------------------

describe('structuralHash is stable across a cosmetic appendage edit', () => {
  it('is unchanged when name changes', () => {
    expect(structuralHash(stateWith({ ...base, name: 'Renamed Sump' }))).toBe(baseHash);
  });

  it('is unchanged when nominalThickness changes', () => {
    const a = structuralHash(stateWith({ ...base, nominalThickness: 10 }));
    const b = structuralHash(stateWith({ ...base, nominalThickness: 22 }));
    expect(a).toBe(b);
  });

  it('is unchanged when visible or locked toggle', () => {
    expect(structuralHash(stateWith({ ...base, visible: false }))).toBe(baseHash);
    expect(structuralHash(stateWith({ ...base, locked: true }))).toBe(baseHash);
  });
});

// ---------------------------------------------------------------------------
// Regression: a default vessel with no appendages is stable and unaffected by
// cosmetic (non-allowlisted) edits.
// ---------------------------------------------------------------------------

describe('structuralHash regression — no appendages', () => {
  it('is deterministic for the default vessel', () => {
    expect(structuralHash(DEFAULT_VESSEL_STATE)).toBe(structuralHash(DEFAULT_VESSEL_STATE));
  });

  it('is unaffected by a cosmetic visuals change but changes on a structural edit', () => {
    const cosmetic: VesselState = {
      ...DEFAULT_VESSEL_STATE,
      visuals: { ...DEFAULT_VESSEL_STATE.visuals, shellOpacity: 0.5 },
    };
    expect(structuralHash(cosmetic)).toBe(structuralHash(DEFAULT_VESSEL_STATE));

    const structural: VesselState = { ...DEFAULT_VESSEL_STATE, id: DEFAULT_VESSEL_STATE.id + 50 };
    expect(structuralHash(structural)).not.toBe(structuralHash(DEFAULT_VESSEL_STATE));
  });
});
