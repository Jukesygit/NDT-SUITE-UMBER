import { useEffect, useState } from 'react';
import type { AppState } from './types';
import { Canvas } from './components/Canvas';
import { Sidebar } from './components/Sidebar';
import { Readouts } from './components/Readouts';
import './beam-tool.css';

const INITIAL: AppState = {
  part: { thickness: 25, halfWidth: 150, materialId: 'carbon-steel' },
  weld: {
    joint: 'butt',
    type: 'single-v',
    filletLeg: 8,
    chordThickness: 20,
    bevelAngle: 30,
    rootGap: 2,
    rootFace: 2,
    capExtra: 2,
    capHeight: 2,
    hazWidth: 3,
    showHaz: true,
  },
  probe: {
    side: 'A',
    standoff: 45,
    elementSize: 9,
    elements: 16,
    pitch: 0.6,
    frequency: 4,
    wedgeId: 'rexolite',
    waveMode: 'shear',
  },
  beam: {
    mode: 'conventional',
    angle: 60,
    sweepStart: 40,
    sweepEnd: 70,
    sweepStep: 2,
    legs: 2,
    showSpread: true,
    spreadDb: 6,
    showSkipMarkers: true,
  },
};

type Patch = Partial<{ [K in keyof AppState]: Partial<AppState[K]> }>;

export type Theme = 'dark' | 'light';

function initialTheme(): Theme {
  try {
    return localStorage.getItem('notbeamtool-theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export default function BeamTool() {
  const [state, setState] = useState<AppState>(INITIAL);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    try {
      localStorage.setItem('notbeamtool-theme', theme);
    } catch {
      // storage unavailable — theme just won't persist
    }
  }, [theme]);

  const update = (patch: Patch) => {
    setState((s) => {
      const next = { ...s };
      for (const key of Object.keys(patch) as (keyof AppState)[]) {
        next[key] = { ...s[key], ...patch[key] } as never;
      }
      // keep the probe on the plate when half-width shrinks
      const maxStandoff = next.part.halfWidth - 5;
      if (next.probe.standoff > maxStandoff) {
        next.probe = { ...next.probe, standoff: Math.max(2, maxStandoff) };
      }
      return next;
    });
  };

  return (
    <div className="nbt-app nbt-page" data-nbt-theme={theme}>
      <header className="nbt-header">
        <div className="nbt-brand">
          <span className="nbt-brand-name">
            <span className="nbt-not">NOT</span>BEAMTOOL
          </span>
          <span className="nbt-brand-sub">UT Technique Designer</span>
        </div>
        <div className="nbt-header-spacer" />
        <button
          className="nbt-btn"
          role="switch"
          aria-checked={theme === 'light'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? 'LIGHT MODE' : 'DARK MODE'}
        </button>
      </header>
      <Canvas
        state={state}
        theme={theme}
        onStandoff={(v) => update({ probe: { standoff: v } })}
        onSide={(v) => update({ probe: { side: v } })}
      />
      <Sidebar state={state} update={update} />
      <Readouts state={state} />
    </div>
  );
}
