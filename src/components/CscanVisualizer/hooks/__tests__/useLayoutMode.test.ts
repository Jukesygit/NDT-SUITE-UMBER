import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLayoutMode } from '../useLayoutMode';
import type { CscanData } from '../../types';

function makeScan(id: string, xAxis: number[], yAxis: number[]): CscanData {
  const width = xAxis.length;
  const height = yAxis.length;
  return {
    id,
    filename: `${id}.csv`,
    width,
    height,
    data: Array.from({ length: height }, () => Array(width).fill(5.0)),
    xAxis,
    yAxis,
  };
}

describe('useLayoutMode', () => {
  const scanA = makeScan('a', [0, 5, 10], [0, 1, 2, 3]);
  const scanB = makeScan('b', [100, 105, 110], [0, 1, 2, 3]);

  it('initializes positions from axis min values', () => {
    const { result } = renderHook(() => useLayoutMode([scanA, scanB]));

    const posA = result.current.scanPositions.get('a');
    const posB = result.current.scanPositions.get('b');
    expect(posA).toEqual({ x: 0, y: 0 });
    expect(posB).toEqual({ x: 100, y: 0 });
  });

  it('initializes z-order matching scan order', () => {
    const { result } = renderHook(() => useLayoutMode([scanA, scanB]));
    expect(result.current.zOrder).toEqual(['a', 'b']);
  });

  it('initializes camera centered on scan extents', () => {
    const { result } = renderHook(() => useLayoutMode([scanA, scanB]));
    expect(result.current.camera.zoom).toBeGreaterThan(0);
    expect(typeof result.current.camera.panX).toBe('number');
    expect(typeof result.current.camera.panY).toBe('number');
  });

  it('bringToFront moves scan to end of z-order', () => {
    const { result } = renderHook(() => useLayoutMode([scanA, scanB]));
    act(() => result.current.bringToFront('a'));
    expect(result.current.zOrder).toEqual(['b', 'a']);
  });

  it('setScanPosition updates position for a scan', () => {
    const { result } = renderHook(() => useLayoutMode([scanA, scanB]));
    act(() => result.current.setScanPosition('a', { x: 50, y: 25 }));
    expect(result.current.scanPositions.get('a')).toEqual({ x: 50, y: 25 });
  });

  it('resetPositions restores original axis-derived positions', () => {
    const { result } = renderHook(() => useLayoutMode([scanA, scanB]));
    act(() => result.current.setScanPosition('a', { x: 999, y: 999 }));
    act(() => result.current.resetPositions());
    expect(result.current.scanPositions.get('a')).toEqual({ x: 0, y: 0 });
  });
});
