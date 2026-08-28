import type { MaterialSpec, WedgeSpec } from '../types';

export const MATERIALS: MaterialSpec[] = [
  { id: 'carbon-steel', name: 'Carbon steel', vLong: 5920, vShear: 3240 },
  { id: 'stainless-304', name: 'Stainless 304', vLong: 5790, vShear: 3100 },
  { id: 'aluminum', name: 'Aluminium', vLong: 6320, vShear: 3130 },
  { id: 'titanium', name: 'Titanium', vLong: 6100, vShear: 3120 },
];

export const WEDGES: WedgeSpec[] = [
  { id: 'rexolite', name: 'Rexolite', velocity: 2337 },
  { id: 'acrylic', name: 'Acrylic (PMMA)', velocity: 2730 },
  { id: 'none', name: 'None (contact)', velocity: 0 },
];

export function materialById(id: string): MaterialSpec {
  return MATERIALS.find((m) => m.id === id) ?? MATERIALS[0];
}

export function wedgeById(id: string): WedgeSpec {
  return WEDGES.find((w) => w.id === id) ?? WEDGES[0];
}
