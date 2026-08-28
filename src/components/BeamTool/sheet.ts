import type { AppState } from './types';
import { materialById, wedgeById } from './physics/materials';
import { activeAperture, derived, traceFan } from './physics/raytrace';

/** One key/value line; cls picks the value colour (default = green). */
export interface SheetLine {
  k: string;
  v: string;
  cls?: 'plain' | 'warn';
}

export interface SheetSection {
  title: string;
  lines: SheetLine[];
}

/** The computed readout strip (shared by the UI and the PNG export). */
export function readoutItems(state: AppState): SheetLine[] {
  const fan = traceFan(state);
  const d = derived(state);
  const conventional = state.beam.mode === 'conventional';
  const contact = wedgeById(state.probe.wedgeId).velocity <= 0;

  const incident: SheetLine = contact
    ? { k: 'Incident (wedge)', v: 'CONTACT', cls: 'plain' }
    : Number.isNaN(fan.incidentAngle)
      ? { k: 'Incident (wedge)', v: 'BEYOND CRIT', cls: 'warn' }
      : { k: 'Incident (wedge)', v: `${fan.incidentAngle.toFixed(1)}°` };

  const items: SheetLine[] = conventional
    ? [
        { k: 'Refracted', v: `${state.beam.angle.toFixed(1)}°` },
        incident,
        { k: 'Spread ±', v: `${fan.spreadHalfAngle.toFixed(1)}°` },
        { k: '½ skip', v: `${d.halfSkip.toFixed(1)} mm`, cls: 'plain' },
        { k: 'Full skip', v: `${d.fullSkip.toFixed(1)} mm`, cls: 'plain' },
        { k: 'Leg path', v: `${d.legPath.toFixed(1)} mm`, cls: 'plain' },
        { k: 'Velocity', v: `${d.vPart} m/s`, cls: 'plain' },
      ]
    : [
        {
          k: 'Sweep',
          v: `${Math.min(state.beam.sweepStart, state.beam.sweepEnd)}–${Math.max(state.beam.sweepStart, state.beam.sweepEnd)}°`,
        },
        { k: 'Step', v: `${state.beam.sweepStep}°` },
        { k: 'Rays', v: `${fan.center.length}`, cls: 'plain' },
        {
          k: 'Aperture',
          v: `${activeAperture(state.probe.elements, state.probe.pitch).toFixed(1)} mm`,
        },
        { k: 'Spread ±', v: `${fan.spreadHalfAngle.toFixed(1)}°` },
        { k: 'Velocity', v: `${d.vPart} m/s`, cls: 'plain' },
      ];

  if (fan.beamWarning) {
    items.push({ k: 'Caveat', v: fan.beamWarning, cls: 'warn' });
  }
  return items;
}

const onOff = (v: boolean) => (v ? 'On' : 'Off');

/**
 * Everything that defines the technique: every input variable plus the
 * computed readouts, grouped for the exported sheet. The caveat is pulled
 * out so the export can render it full-width.
 */
export function techniqueSheet(state: AppState): {
  sections: SheetSection[];
  caveat: string | null;
} {
  const { part, weld, probe, beam } = state;
  const mat = materialById(part.materialId);
  const wedge = wedgeById(probe.wedgeId);
  const tee = weld.joint === 'tee-fillet';

  const partLines: SheetLine[] = [
    { k: 'Thickness', v: `${part.thickness} mm`, cls: 'plain' },
    { k: 'Half width', v: `${part.halfWidth} mm`, cls: 'plain' },
    { k: 'Material', v: mat.name, cls: 'plain' },
  ];

  const weldLines: SheetLine[] = tee
    ? [
        { k: 'Joint', v: 'T-fillet', cls: 'plain' },
        { k: 'Fillet leg', v: `${weld.filletLeg} mm`, cls: 'plain' },
        { k: 'Chord thickness', v: `${weld.chordThickness} mm`, cls: 'plain' },
        { k: 'HAZ width', v: `${weld.hazWidth} mm`, cls: 'plain' },
        { k: 'HAZ band', v: onOff(weld.showHaz), cls: 'plain' },
      ]
    : [
        { k: 'Joint', v: 'Butt', cls: 'plain' },
        { k: 'Type', v: weld.type === 'single-v' ? 'Single V' : 'Double V', cls: 'plain' },
        { k: 'Bevel angle', v: `${weld.bevelAngle}°`, cls: 'plain' },
        { k: 'Root gap', v: `${weld.rootGap} mm`, cls: 'plain' },
        { k: 'Root face', v: `${weld.rootFace} mm`, cls: 'plain' },
        { k: 'Cap height', v: `${weld.capHeight} mm`, cls: 'plain' },
        { k: 'Cap extra', v: `${weld.capExtra} mm`, cls: 'plain' },
        { k: 'HAZ width', v: `${weld.hazWidth} mm`, cls: 'plain' },
        { k: 'HAZ band', v: onOff(weld.showHaz), cls: 'plain' },
      ];

  const probeLines: SheetLine[] = [
    {
      k: 'Side',
      v: tee ? 'A (branch)' : probe.side === 'A' ? 'A (left)' : 'B (right)',
      cls: 'plain',
    },
    { k: 'Standoff', v: `${probe.standoff} mm`, cls: 'plain' },
    { k: 'Frequency', v: `${probe.frequency} MHz`, cls: 'plain' },
    { k: 'Crystal (conv.)', v: `${probe.elementSize} mm`, cls: 'plain' },
    { k: 'Elements (PA)', v: `${probe.elements}`, cls: 'plain' },
    { k: 'Pitch (PA)', v: `${probe.pitch} mm`, cls: 'plain' },
    { k: 'Wedge', v: wedge.name, cls: 'plain' },
    { k: 'Wave mode', v: probe.waveMode === 'shear' ? 'Shear' : 'Longitudinal', cls: 'plain' },
  ];

  const beamLines: SheetLine[] =
    beam.mode === 'conventional'
      ? [
          { k: 'Mode', v: 'Conventional', cls: 'plain' },
          { k: 'Refracted angle', v: `${beam.angle}°`, cls: 'plain' },
          { k: 'Legs (half-skips)', v: `${beam.legs}`, cls: 'plain' },
          { k: 'Beam spread', v: onOff(beam.showSpread), cls: 'plain' },
          { k: 'Spread drop', v: `−${beam.spreadDb} dB`, cls: 'plain' },
          { k: 'Skip markers', v: onOff(beam.showSkipMarkers), cls: 'plain' },
        ]
      : [
          { k: 'Mode', v: 'S-scan', cls: 'plain' },
          { k: 'Sweep start', v: `${beam.sweepStart}°`, cls: 'plain' },
          { k: 'Sweep end', v: `${beam.sweepEnd}°`, cls: 'plain' },
          { k: 'Step', v: `${beam.sweepStep}°`, cls: 'plain' },
          { k: 'Legs (half-skips)', v: `${beam.legs}`, cls: 'plain' },
          { k: 'Beam spread', v: onOff(beam.showSpread), cls: 'plain' },
          { k: 'Spread drop', v: `−${beam.spreadDb} dB`, cls: 'plain' },
        ];

  const readouts = readoutItems(state);
  const caveatItem = readouts.find((i) => i.k === 'Caveat');

  return {
    sections: [
      { title: 'Part', lines: partLines },
      { title: 'Weld', lines: weldLines },
      { title: 'Probe & Wedge', lines: probeLines },
      { title: 'Beam', lines: beamLines },
      { title: 'Readouts', lines: readouts.filter((i) => i.k !== 'Caveat') },
    ],
    caveat: caveatItem ? caveatItem.v : null,
  };
}
