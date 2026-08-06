import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettledValue } from '../useSettledValue';

describe('useSettledValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the initial value immediately (before any settle)', () => {
    const { result } = renderHook(({ v }) => useSettledValue(v, 250), {
      initialProps: { v: 1 },
    });
    expect(result.current).toBe(1);
  });

  it('holds the previous settled value while updates stream, then settles once', () => {
    const { result, rerender } = renderHook(({ v }) => useSettledValue(v, 250), {
      initialProps: { v: 0 },
    });

    // Stream a burst of updates faster than the settle window.
    for (let v = 1; v <= 10; v++) {
      rerender({ v });
      act(() => {
        vi.advanceTimersByTime(50); // < 250ms between updates → keeps resetting
      });
    }

    // Nothing has settled yet — the value is still the pre-burst value.
    expect(result.current).toBe(0);

    // Let the window elapse: exactly one trailing recompute, to the LAST input.
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe(10);
  });

  it('coalesces N streamed updates into a single settle transition', () => {
    let renderedSettled: number[] = [];
    const { rerender } = renderHook(
      ({ v }) => {
        const s = useSettledValue(v, 200);
        renderedSettled.push(s);
        return s;
      },
      { initialProps: { v: 0 } }
    );

    renderedSettled = [];
    for (let v = 1; v <= 20; v++) {
      rerender({ v });
      act(() => vi.advanceTimersByTime(20));
    }
    act(() => vi.advanceTimersByTime(200));

    // The settled value only ever transitions through 0 → 20, never the
    // intermediate frames: distinct settled values seen are just the final one.
    const distinctSettled = [...new Set(renderedSettled)];
    expect(distinctSettled).toEqual([0, 20]);
  });

  it('settles a single isolated change after one debounce tick', () => {
    const { result, rerender } = renderHook(({ v }) => useSettledValue(v, 300), {
      initialProps: { v: 'a' },
    });

    rerender({ v: 'b' });
    expect(result.current).toBe('a'); // not yet

    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe('a'); // still within window

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('b'); // one tick → settled
  });

  it('always lands on the final value even after multiple settle rounds', () => {
    const { result, rerender } = renderHook(({ v }) => useSettledValue(v, 100), {
      initialProps: { v: 1 },
    });

    rerender({ v: 2 });
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe(2);

    rerender({ v: 3 });
    rerender({ v: 4 });
    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe(4);
  });
});
