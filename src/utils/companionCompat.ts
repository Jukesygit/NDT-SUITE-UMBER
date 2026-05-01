import type { CompanionStatus } from '../types/companion';
import { MIN_COMPANION_VERSION, MAX_COMPANION_VERSION } from '../services/companion-service';

export type CompatState = 'compatible' | 'degraded' | 'incompatible';

export interface CompatResult {
  state: CompatState;
  missingFeatures: string[];
  companionVersion: number;
}

const EXPECTED_FEATURES = [
  'directory-params',
  'session-cache',
  'ws-backpressure',
];

export function checkCompanionCompat(status: CompanionStatus): CompatResult {
  const version = status.apiVersion ?? status.apiVersionLegacy ?? 1;

  if (version < MIN_COMPANION_VERSION) {
    return { state: 'incompatible', missingFeatures: EXPECTED_FEATURES, companionVersion: version };
  }

  const features = status.features ?? [];
  const missing = EXPECTED_FEATURES.filter((f) => !features.includes(f));

  if (version > MAX_COMPANION_VERSION) {
    return { state: 'degraded', missingFeatures: missing, companionVersion: version };
  }

  if (missing.length > 0) {
    return { state: 'degraded', missingFeatures: missing, companionVersion: version };
  }

  return { state: 'compatible', missingFeatures: [], companionVersion: version };
}

export function hasFeature(status: CompanionStatus | null | undefined, feature: string): boolean {
  return status?.features?.includes(feature) ?? false;
}
