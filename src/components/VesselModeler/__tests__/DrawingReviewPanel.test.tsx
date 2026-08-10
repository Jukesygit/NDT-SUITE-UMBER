/**
 * DrawingReviewPanel - compact editable review (Phase E).
 *
 * Canvas-free panel, so no pdfjs/canvas mocking is needed. Covers the apply
 * gating contract: a still-missing field blocks apply; mount always gates and a
 * shell->head switch newly requires a centerline offset; the "show issues only"
 * filter hides clean rows while keeping rows that need attention.
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

/** All scalars + one fully-resolved shell nozzle -> apply enabled from the start. */
function makeResolvedReview(): ExtractionReview {
  return {
    id: ev(1500, 'high'),
    length: ev(4000, 'high'),
    headRatio: ev(2, 'high'),
    orientation: ev('horizontal', 'high'),
    nozzles: [
      {
        name: ev('N1', 'high'),
        pos: ev(1000, 'high'),
        proj: ev(150, 'high'),
        angle: ev(0, 'high'),
        size: ev(100, 'high'),
        mount: ev('shell', 'high'),
        radialOffset: ev(null, 'high'), // shell sentinel: never gates
        nozzleOrientation: ev('radial', 'high'),
        elevation: ev(null, 'high'), // radial sentinel: never gates
      },
    ],
    saddles: [],
  };
}

/** All scalars + one fully-resolved horizontal nozzle (facing 90, EL 300). */
function makeHorizontalReview(): ExtractionReview {
  return {
    id: ev(2000, 'high'),
    length: ev(6000, 'high'),
    headRatio: ev(2, 'high'),
    orientation: ev('horizontal', 'high'),
    nozzles: [
      {
        name: ev('LB1', 'high'),
        pos: ev(1000, 'high'),
        proj: ev(150, 'high'),
        angle: ev(90, 'high'),
        size: ev(100, 'high'),
        mount: ev('shell', 'high'),
        radialOffset: ev(null, 'high'),
        nozzleOrientation: ev('horizontal', 'high'),
        elevation: ev(300, 'high'),
      },
    ],
    saddles: [],
  };
}

/** Two shell nozzles: one clean, one with a missing size (needs attention). */
function makeTwoNozzleReview(): ExtractionReview {
  const nozzle = (name: string, size: number | null, sizeConf: 'high' | 'missing') => ({
    name: ev(name, 'high'),
    pos: ev(1000, 'high'),
    proj: ev(150, 'high'),
    angle: ev(0, 'high'),
    size: ev(size, sizeConf),
    mount: ev('shell', 'high'),
    radialOffset: ev(null, 'high'),
    nozzleOrientation: ev('radial', 'high'),
    elevation: ev(null, 'high'),
  });
  return {
    id: ev(1500, 'high'),
    length: ev(4000, 'high'),
    headRatio: ev(2, 'high'),
    orientation: ev('horizontal', 'high'),
    nozzles: [nozzle('CLEAN', 100, 'high'), nozzle('PROBLEM', null, 'missing')],
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
      />
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

  it('re-gates on a shell->head mount switch until an offset is entered', () => {
    const onApply = vi.fn();
    render(
      <DrawingReviewPanel
        review={makeResolvedReview()}
        onApply={onApply}
        onBack={vi.fn()}
        onError={vi.fn()}
      />
    );

    const applyBtn = screen.getByRole('button', { name: /Apply to Model/i });
    expect(applyBtn).toBeEnabled();

    // Switch the nozzle mount shell -> head-left: its centerline offset is now
    // required and unread, so apply must disable.
    fireEvent.change(screen.getByDisplayValue('Shell'), { target: { value: 'head-left' } });
    expect(applyBtn).toBeDisabled();

    // The position column now edits the offset (empty). Fill it -> apply re-enables.
    fireEvent.change(screen.getByPlaceholderText('not read from drawing'), {
      target: { value: '500' },
    });
    expect(applyBtn).toBeEnabled();

    fireEvent.click(applyBtn);
    expect(onApply).toHaveBeenCalledTimes(1);
    const nozzle = onApply.mock.calls[0][0].nozzles[0];
    expect(nozzle.mount).toBe('head-left');
    expect(nozzle.radialOffset).toBe(500);
  });

  it('filters to rows needing attention when "show issues only" is on', () => {
    render(
      <DrawingReviewPanel
        review={makeTwoNozzleReview()}
        onApply={vi.fn()}
        onBack={vi.fn()}
        onError={vi.fn()}
      />
    );

    // Both rows visible initially.
    expect(screen.getByDisplayValue('CLEAN')).toBeInTheDocument();
    expect(screen.getByDisplayValue('PROBLEM')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show issues only/i }));

    // The clean row is hidden; the problem row (missing size) stays.
    expect(screen.queryByDisplayValue('CLEAN')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('PROBLEM')).toBeInTheDocument();
  });

  it('rotate-all +90 rotates every nozzle angle and applies the rotated value', () => {
    const onApply = vi.fn();
    render(
      <DrawingReviewPanel
        review={makeResolvedReview()}
        onApply={onApply}
        onBack={vi.fn()}
        onError={vi.fn()}
      />
    );

    // Angle starts drawing-native at 0.
    expect(screen.getByDisplayValue('0')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(/Add 90/i));
    // The angle cell now shows the rotated value.
    expect(screen.getByDisplayValue('90')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Apply to Model/i }));
    // onApply receives the rotated (still drawing-native) angle; conversion to
    // engine convention happens later, in placeExtractedNozzle.
    expect(onApply.mock.calls[0][0].nozzles[0].angle).toBe(90);
  });

  it('re-gates on a radial->horizontal orientation switch until an elevation is entered', () => {
    const onApply = vi.fn();
    render(
      <DrawingReviewPanel
        review={makeResolvedReview()}
        onApply={onApply}
        onBack={vi.fn()}
        onError={vi.fn()}
      />
    );

    const applyBtn = screen.getByRole('button', { name: /Apply to Model/i });
    expect(applyBtn).toBeEnabled();

    // Switch the nozzle orientation radial -> horizontal: its centerline
    // elevation is now required and unread, so apply must disable.
    fireEvent.change(screen.getByDisplayValue('Radial'), { target: { value: 'horizontal' } });
    expect(applyBtn).toBeDisabled();

    // The newly-shown EL cell is empty. Fill it -> apply re-enables.
    fireEvent.change(screen.getByPlaceholderText('not read from drawing'), {
      target: { value: '250' },
    });
    expect(applyBtn).toBeEnabled();

    fireEvent.click(applyBtn);
    const nozzle = onApply.mock.calls[0][0].nozzles[0];
    expect(nozzle.nozzleOrientation).toBe('horizontal');
    expect(nozzle.elevation).toBe(250);
  });

  it('rotate-all mirror swaps a horizontal nozzle facing 90 -> 270; +90 leaves it alone', () => {
    const onApply = vi.fn();
    render(
      <DrawingReviewPanel
        review={makeHorizontalReview()}
        onApply={onApply}
        onBack={vi.fn()}
        onError={vi.fn()}
      />
    );

    // A horizontal nozzle's angle is a facing side: +90/-90/180 skip it.
    expect(screen.getByDisplayValue('90')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(/Add 90/i));
    expect(screen.getByDisplayValue('90')).toBeInTheDocument(); // unchanged

    // Mirror is the one control that may touch it: 90 -> 270.
    fireEvent.click(screen.getByTitle(/^Mirror/i));
    expect(screen.getByDisplayValue('270')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Apply to Model/i }));
    const nozzle = onApply.mock.calls[0][0].nozzles[0];
    expect(nozzle.angle).toBe(270);
    expect(nozzle.nozzleOrientation).toBe('horizontal');
    expect(nozzle.elevation).toBe(300);
  });

  it('rotate-all mirror flips a nozzle angle 90 -> 270', () => {
    const review = makeResolvedReview();
    review.nozzles[0].angle = ev(90, 'high');
    const onApply = vi.fn();
    render(
      <DrawingReviewPanel review={review} onApply={onApply} onBack={vi.fn()} onError={vi.fn()} />
    );

    expect(screen.getByDisplayValue('90')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle(/^Mirror/i));
    expect(screen.getByDisplayValue('270')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Apply to Model/i }));
    expect(onApply.mock.calls[0][0].nozzles[0].angle).toBe(270);
  });
});
