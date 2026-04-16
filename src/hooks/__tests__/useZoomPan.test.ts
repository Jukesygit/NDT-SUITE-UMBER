import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useZoomPan } from '../useZoomPan';

describe('useZoomPan', () => {
  const defaultParams = {
    dataWidth: 100,
    dataHeight: 50,
    viewportWidth: 800,
    viewportHeight: 400,
  };

  it('initializes with zoom 1 and centered view', () => {
    const { result } = renderHook(() => useZoomPan(defaultParams));

    expect(result.current.zoom).toBe(1);
    expect(result.current.centerX).toBe(50); // dataWidth / 2
    expect(result.current.centerY).toBe(25); // dataHeight / 2
  });

  it('provides a transform string', () => {
    const { result } = renderHook(() => useZoomPan(defaultParams));
    expect(result.current.transform).toMatch(/translate\(.*px,.*px\) scale\(.*\)/);
  });

  it('pixelToData and dataToPixel are inverses', () => {
    const { result } = renderHook(() => useZoomPan(defaultParams));

    const testX = 30;
    const testY = 15;
    const pixel = result.current.dataToPixel(testX, testY);
    const data = result.current.pixelToData(pixel.px, pixel.py);

    expect(data.scanMm).toBeCloseTo(testX, 1);
    expect(data.indexMm).toBeCloseTo(testY, 1);
  });

  it('pixelToData returns center of data at center of viewport', () => {
    const { result } = renderHook(() => useZoomPan(defaultParams));

    const center = result.current.pixelToData(400, 200); // viewport center
    expect(center.scanMm).toBeCloseTo(50, 0); // data center
    expect(center.indexMm).toBeCloseTo(25, 0);
  });
});
