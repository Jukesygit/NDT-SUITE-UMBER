/**
 * DrawingReviewPanel - editable review gating.
 *
 * Canvas-free panel, so no pdfjs/canvas mocking is needed. Verifies the
 * apply-gating contract: a review with a still-missing field blocks apply until
 * the user fills it, after which onApply receives the edited value.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DrawingReviewPanel from '../DrawingReviewPanel';
import type { ExtractionReview } from '../engine/drawing-parser';

const ev = <T,>(value: T | null, confidence: 'high' | 'medium' | 'low' | 'missing') => ({
  value,
  confidence,
  flags: [],
});

/** One high, one medium, one missing vessel scalar; no nozzles/saddles. */
function makeReview(): ExtractionReview {
  return {
    id: ev(1500, 'high'),
    length: ev(4000, 'medium'),
    headRatio: ev(null, 'missing'), // the gap the user must fill
    orientation: ev('horizontal', 'high'),
    nozzles: [],
    saddles: [],
  };
}

describe('DrawingReviewPanel', () => {
  it('disables apply while a field is missing, enables + emits after edit', () => {
    const onApply = vi.fn();
    render(
      <DrawingReviewPanel
        review={makeReview()}
        onApply={onApply}
        onBack={vi.fn()}
        onError={vi.fn()}
      />,
    );

    const applyBtn = screen.getByRole('button', { name: /Apply to Model/i });
    expect(applyBtn).toBeDisabled();
    expect(screen.getByText(/still need a value before you can apply/i)).toBeInTheDocument();

    // Head Ratio was 'missing' -> its input is empty. Fill it.
    const headRatio = screen.getByPlaceholderText('not read from drawing');
    fireEvent.change(headRatio, { target: { value: '2' } });

    expect(applyBtn).toBeEnabled();
    fireEvent.click(applyBtn);

    expect(onApply).toHaveBeenCalledTimes(1);
    const result = onApply.mock.calls[0][0];
    expect(result.headRatio).toBe(2);
    expect(result.id).toBe(1500);
    expect(result.length).toBe(4000);
    expect(result.orientation).toBe('horizontal');
  });
});
