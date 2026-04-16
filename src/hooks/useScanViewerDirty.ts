/**
 * useScanViewerDirty — tracks unsaved gate settings changes.
 *
 * - Compares current vs saved gate settings (deep equality)
 * - Registers beforeunload handler when dirty
 * - Saves draft to localStorage (debounced 2s)
 * - Provides draft restore/discard on mount
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GateSettings } from '../types/companion';

interface UseScanViewerDirtyParams {
  projectId: string;
  vesselId: string;
  section: string | null;
  gateSettings: GateSettings;
  savedGateSettings: GateSettings;
}

interface UseScanViewerDirtyResult {
  isDirty: boolean;
  hasDraft: boolean;
  draftTimestamp: number | null;
  restoreDraft: () => GateSettings | null;
  discardDraft: () => void;
  clearDraft: () => void;
}

function draftKey(projectId: string, vesselId: string, section: string): string {
  return `scan-viewer-draft:${projectId}:${vesselId}:${section}`;
}

function deepEqual(a: GateSettings, b: GateSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useScanViewerDirty(params: UseScanViewerDirtyParams): UseScanViewerDirtyResult {
  const { projectId, vesselId, section, gateSettings, savedGateSettings } = params;
  const isDirty = !deepEqual(gateSettings, savedGateSettings);

  const [hasDraft, setHasDraft] = useState(false);
  const [draftTimestamp, setDraftTimestamp] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const key = section ? draftKey(projectId, vesselId, section) : null;

  // Check for existing draft on mount / section change
  useEffect(() => {
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        setHasDraft(true);
        setDraftTimestamp(parsed.timestamp ?? null);
      } else {
        setHasDraft(false);
        setDraftTimestamp(null);
      }
    } catch {
      setHasDraft(false);
    }
  }, [key]);

  // Save draft to localStorage (debounced)
  useEffect(() => {
    if (!isDirty || !key) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify({
          gateSettings,
          timestamp: Date.now(),
        }));
        setHasDraft(true);
      } catch { /* localStorage full — ignore */ }
    }, 2000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isDirty, gateSettings, key]);

  // beforeunload warning when dirty
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const restoreDraft = useCallback((): GateSettings | null => {
    if (!key) return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw).gateSettings;
    } catch {
      return null;
    }
  }, [key]);

  const discardDraft = useCallback(() => {
    if (key) localStorage.removeItem(key);
    setHasDraft(false);
    setDraftTimestamp(null);
  }, [key]);

  const clearDraft = useCallback(() => {
    if (key) localStorage.removeItem(key);
    setHasDraft(false);
    setDraftTimestamp(null);
  }, [key]);

  return { isDirty, hasDraft, draftTimestamp, restoreDraft, discardDraft, clearDraft };
}
