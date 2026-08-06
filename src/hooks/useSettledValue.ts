import { useEffect, useRef, useState } from 'react';

/**
 * Trailing-debounce a value so heavy derived work never runs per streaming
 * frame. Returns a value that tracks `value` but only advances to the latest
 * input once updates stop arriving for `delayMs` — the settle point.
 *
 * Motivation (vessel-modeler R1/R2 perf): dragging a nozzle dispatches a vessel
 * update every pointer-move frame. Consumers that derive expensive results from
 * the streaming state (coverage/footprint sweeps, the baked heatmap footprint
 * cutout) must not recompute per frame — the owner asked for recalculation on
 * cursor release. Feeding those consumers a settled copy collapses a burst of
 * updates into ONE trailing recompute while the live state still drives the
 * lightweight per-frame work (the dragged mesh following the cursor).
 *
 * Guarantees:
 *  - Streaming coalescing: N updates within `delayMs` of each other produce a
 *    single trailing recompute (each change cancels the previous pending timer).
 *  - Trailing-edge correctness: the settled value always lands on the LAST input
 *    seen — no dropped final update — because the surviving timer reads the most
 *    recent value at fire time.
 *  - A single isolated change settles after exactly one `delayMs` tick, so
 *    non-drag edits (typing a value, adding/removing an item) still update
 *    promptly rather than waiting on some unrelated later event.
 *
 * This also transparently covers sidebar slider scrubbing (also a stream of
 * updates) without any drag-specific signal, so no reducer/history changes are
 * needed to obtain a "gesture ended" edge.
 *
 * @param value   The live value to track.
 * @param delayMs Trailing debounce window in ms (default 250).
 */
export function useSettledValue<T>(value: T, delayMs = 250): T {
  const [settled, setSettled] = useState<T>(value);

  // Always holds the newest value so the trailing timer settles on the final
  // input, even though the effect closure was created on an earlier render.
  const latestRef = useRef<T>(value);
  latestRef.current = value;

  useEffect(() => {
    const timer = setTimeout(() => setSettled(latestRef.current), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
