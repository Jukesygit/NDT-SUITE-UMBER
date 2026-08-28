import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BeamTool from '../BeamTool';

// jsdom has no ResizeObserver; Canvas observes its wrapper on mount.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('BeamTool', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('renders the brand and the computed readouts', () => {
    const { container } = render(<BeamTool />);

    expect(screen.getByText('NOT')).toBeInTheDocument();
    expect(screen.getByText('BEAMTOOL')).toBeInTheDocument();
    expect(screen.getByText('UT Technique Designer')).toBeInTheDocument();

    // default state is conventional 60° — the readout strip is computed, not static
    expect(screen.getByText('Refracted')).toBeInTheDocument();
    expect(screen.getByText('60.0°')).toBeInTheDocument();
    expect(container.querySelectorAll('.nbt-readout-item').length).toBeGreaterThan(0);
  });

  it('flips its own root data-nbt-theme without touching documentElement', async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.theme = 'suite-theme';

    const { container } = render(<BeamTool />);
    const root = container.querySelector('.nbt-page') as HTMLElement;

    expect(root).not.toBeNull();
    // the tool's own attribute, not `data-theme` — the suite's bare
    // [data-theme=…] selectors must not reach into the tool subtree
    expect(root.dataset.nbtTheme).toBe('dark');
    expect(root.dataset.theme).toBeUndefined();
    expect(document.documentElement.dataset.theme).toBe('suite-theme');

    // the header toggle carries an explicit role="switch"
    await user.click(screen.getByRole('switch', { name: 'LIGHT MODE' }));

    expect(root.dataset.nbtTheme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('suite-theme');
  });
});
