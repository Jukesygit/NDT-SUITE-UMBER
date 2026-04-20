import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScanViewerDirty } from '../useScanViewerDirty';
import { DEFAULT_GATE_SETTINGS } from '../../types/companion';

describe('useScanViewerDirty', () => {
  const baseParams = {
    projectId: 'proj-1',
    vesselId: 'vessel-1',
    section: 'Shell',
    gateSettings: { ...DEFAULT_GATE_SETTINGS },
    savedGateSettings: { ...DEFAULT_GATE_SETTINGS },
  };

  beforeEach(() => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    vi.mocked(localStorage.setItem).mockClear();
    vi.mocked(localStorage.removeItem).mockClear();
  });

  it('is not dirty when gate settings match saved', () => {
    const { result } = renderHook(() => useScanViewerDirty(baseParams));
    expect(result.current.isDirty).toBe(false);
  });

  it('is dirty when gate settings differ from saved', () => {
    const { result } = renderHook(() =>
      useScanViewerDirty({
        ...baseParams,
        gateSettings: { ...DEFAULT_GATE_SETTINGS, gateMode: 'B-A' },
      }),
    );
    expect(result.current.isDirty).toBe(true);
  });

  it('detects existing draft from localStorage', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({ gateSettings: { ...DEFAULT_GATE_SETTINGS, gateMode: 'B-A' }, timestamp: 1000 }),
    );

    const { result } = renderHook(() => useScanViewerDirty(baseParams));
    expect(result.current.hasDraft).toBe(true);
    expect(result.current.draftTimestamp).toBe(1000);
  });

  it('restoreDraft returns saved gate settings', () => {
    const draft = { ...DEFAULT_GATE_SETTINGS, gateMode: 'B-A' };
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({ gateSettings: draft, timestamp: 1000 }),
    );

    const { result } = renderHook(() => useScanViewerDirty(baseParams));
    const restored = result.current.restoreDraft();
    expect(restored).toEqual(draft);
  });

  it('discardDraft removes from localStorage', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(
      JSON.stringify({ gateSettings: DEFAULT_GATE_SETTINGS, timestamp: 1000 }),
    );

    const { result } = renderHook(() => useScanViewerDirty(baseParams));
    act(() => result.current.discardDraft());

    expect(localStorage.removeItem).toHaveBeenCalledWith('scan-viewer-draft:proj-1:vessel-1:Shell');
    expect(result.current.hasDraft).toBe(false);
  });

  it('handles null section gracefully', () => {
    const { result } = renderHook(() =>
      useScanViewerDirty({ ...baseParams, section: null }),
    );
    expect(result.current.isDirty).toBe(false);
    expect(result.current.hasDraft).toBe(false);
  });
});
