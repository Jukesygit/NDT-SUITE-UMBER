// =============================================================================
// Published bundle — the exclusion sweep
// =============================================================================
// The design's verification plan asks for "an automated grep over a test
// bundle": proof that a published file carries no rect planning notes and no
// personnel identifiers. That is this file.
//
// It runs against the WORST case on purpose — every layer ticked — because the
// exclusions are hard-coded, not options, and the only interesting question is
// whether they hold when the publisher has asked for everything.
//
// The sweep walks the bundle's file bodies, which are wire-identical JSON (the
// builder round-trips them), so what is asserted here is exactly what a client
// would receive.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  DEFAULT_VESSEL_STATE,
  type AnnotationShapeConfig,
  type CoverageRectConfig,
  type VesselState,
} from '../../VesselModeler/types';
import type { LayerKey } from '../../VesselModeler/outliner-tree';
import { SHARE_LAYER_DEFAULTS } from '../bundle-types';
import { buildShareBundle } from '../bundle-builder';

const RECT: CoverageRectConfig = {
  id: 1,
  name: 'Shell band A',
  pos: 2000,
  angle: 90,
  width: 400,
  height: 400,
  color: '#ffffff',
  lineWidth: 10,
  filled: false,
  fillOpacity: 0.2,
  technique: 'other',
  techniqueOther: 'ask Dave about the rate',
  note: 'Client contact is Jane Roe, 07700 900000 — do not scan during shift change',
};

const ANNOTATION = {
  id: 1,
  name: 'Pitting cluster',
  type: 'rectangle',
  pos: 1000,
  angle: 90,
  width: 200,
  height: 200,
  color: '#ff0000',
  lineWidth: 5,
  showLabel: true,
} as AnnotationShapeConfig;

const state: VesselState = {
  ...DEFAULT_VESSEL_STATE,
  coverageRects: [RECT],
  annotations: [ANNOTATION],
};

const bundle = buildShareBundle({
  project: { name: 'Karstoe 2026' },
  vessels: [{ id: 'v-1', name: 'Knockout Drum', vesselState: state }],
  published: new Set(Object.keys(SHARE_LAYER_DEFAULTS) as LayerKey[]),
  revision: 1,
  publishedAt: '2026-08-20T09:00:00.000Z',
});

const jsonFiles = bundle.files.filter((f) => !(f.body instanceof Blob)).map((f) => f.body);

/** Every string value anywhere in a JSON payload, however deeply nested. */
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, out));
  else if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((v) => allStrings(v, out));
  }
  return out;
}

/** Every property name anywhere in a JSON payload. */
function allKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out.push(key);
      allKeys(child, out);
    }
  }
  return out;
}

describe('published bundle contains nothing it must not', () => {
  it('carries no rect note text anywhere', () => {
    const strings = allStrings(jsonFiles);
    expect(strings.some((s) => s.includes('Jane Roe'))).toBe(false);
    expect(strings.some((s) => s.includes('07700 900000'))).toBe(false);
    expect(strings.some((s) => s.includes('ask Dave'))).toBe(false);
  });

  it('carries no `note` or `techniqueOther` key anywhere', () => {
    const keys = new Set(allKeys(jsonFiles));
    expect(keys.has('note')).toBe(false);
    expect(keys.has('techniqueOther')).toBe(false);
  });

  it('carries no personnel or account identifiers', () => {
    const keys = new Set(allKeys(jsonFiles));
    for (const forbidden of [
      'created_by',
      'createdBy',
      'user_id',
      'userId',
      'organization_id',
      'organizationId',
      'email',
      'inspector',
      'profile',
    ]) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });

  it('still publishes the inspection content itself', () => {
    // The sweep must not pass by publishing nothing at all.
    const strings = allStrings(jsonFiles);
    expect(strings).toContain('Shell band A');
    expect(strings).toContain('Pitting cluster');
    expect(strings).toContain('Knockout Drum');
  });
});
