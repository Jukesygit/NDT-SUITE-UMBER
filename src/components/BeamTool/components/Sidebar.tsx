import type { AppState, BeamMode, JointType, ProbeSide, WaveMode, WeldType } from '../types';
import { MATERIALS, WEDGES } from '../physics/materials';
import { NumberField, Segmented, SelectField, Toggle } from './controls';

type Patch = Partial<{ [K in keyof AppState]: Partial<AppState[K]> }>;

export function Sidebar(props: { state: AppState; update: (patch: Patch) => void }) {
  const { state, update } = props;
  const { part, weld, probe, beam } = state;

  return (
    <aside className="nbt-sidebar">
      <div className="nbt-section">
        <div className="nbt-section-title">Part</div>
        <div className="nbt-row">
          <NumberField
            label="Thickness"
            value={part.thickness}
            unit="mm"
            min={2}
            max={300}
            onChange={(v) => update({ part: { thickness: v } })}
          />
          <NumberField
            label="Half width"
            value={part.halfWidth}
            unit="mm"
            min={30}
            max={1000}
            step={10}
            onChange={(v) => update({ part: { halfWidth: v } })}
          />
        </div>
        <div className="nbt-row nbt-single">
          <SelectField
            label="Material"
            value={part.materialId}
            options={MATERIALS.map((m) => ({ value: m.id, label: m.name }))}
            onChange={(v) => update({ part: { materialId: v } })}
          />
        </div>
      </div>

      <div className="nbt-section">
        <div className="nbt-section-title">Weld</div>
        <div className="nbt-row nbt-single">
          <Segmented<JointType>
            value={weld.joint}
            accent="amber"
            options={[
              { value: 'butt', label: 'Butt' },
              { value: 'tee-fillet', label: 'T-fillet' },
            ]}
            onChange={(v) =>
              // the chord blocks side B on a T-joint — scan from the branch
              update(
                v === 'tee-fillet'
                  ? { weld: { joint: v }, probe: { side: 'A' } }
                  : { weld: { joint: v } }
              )
            }
          />
        </div>
        {weld.joint === 'butt' ? (
          <>
            <div className="nbt-row nbt-single">
              <Segmented<WeldType>
                value={weld.type}
                accent="amber"
                options={[
                  { value: 'single-v', label: 'Single V' },
                  { value: 'double-v', label: 'Double V' },
                ]}
                onChange={(v) => update({ weld: { type: v } })}
              />
            </div>
            <div className="nbt-row">
              <NumberField
                label="Bevel angle"
                value={weld.bevelAngle}
                unit="deg"
                min={0}
                max={60}
                onChange={(v) => update({ weld: { bevelAngle: v } })}
              />
              <NumberField
                label="Root gap"
                value={weld.rootGap}
                unit="mm"
                min={0}
                max={20}
                step={0.5}
                onChange={(v) => update({ weld: { rootGap: v } })}
              />
            </div>
            <div className="nbt-row">
              <NumberField
                label="Root face"
                value={weld.rootFace}
                unit="mm"
                min={0}
                max={Math.min(20, part.thickness)}
                step={0.5}
                onChange={(v) => update({ weld: { rootFace: v } })}
              />
              <NumberField
                label="Cap height"
                value={weld.capHeight}
                unit="mm"
                min={0}
                max={10}
                step={0.5}
                onChange={(v) => update({ weld: { capHeight: v } })}
              />
            </div>
            <div className="nbt-row">
              <NumberField
                label="Cap extra"
                value={weld.capExtra}
                unit="mm"
                min={0}
                max={15}
                step={0.5}
                onChange={(v) => update({ weld: { capExtra: v } })}
              />
              <NumberField
                label="HAZ width"
                value={weld.hazWidth}
                unit="mm"
                min={0}
                max={15}
                step={0.5}
                onChange={(v) => update({ weld: { hazWidth: v } })}
              />
            </div>
          </>
        ) : (
          <div className="nbt-row">
            <NumberField
              label="Fillet leg"
              value={weld.filletLeg}
              unit="mm"
              min={2}
              max={40}
              step={0.5}
              onChange={(v) => update({ weld: { filletLeg: v } })}
            />
            <NumberField
              label="Chord thick."
              value={weld.chordThickness}
              unit="mm"
              min={2}
              max={100}
              onChange={(v) => update({ weld: { chordThickness: v } })}
            />
            <NumberField
              label="HAZ width"
              value={weld.hazWidth}
              unit="mm"
              min={0}
              max={15}
              step={0.5}
              onChange={(v) => update({ weld: { hazWidth: v } })}
            />
          </div>
        )}
        <Toggle
          label="Show HAZ band"
          value={weld.showHaz}
          onChange={(v) => update({ weld: { showHaz: v } })}
        />
      </div>

      <div className="nbt-section">
        <div className="nbt-section-title">Probe &amp; Wedge</div>
        <div className={'nbt-row' + (weld.joint === 'tee-fillet' ? ' nbt-single' : '')}>
          {weld.joint === 'butt' && (
            <Segmented<ProbeSide>
              label="Side"
              value={probe.side}
              options={[
                { value: 'A', label: 'A (left)' },
                { value: 'B', label: 'B (right)' },
              ]}
              onChange={(v) => update({ probe: { side: v } })}
            />
          )}
          <NumberField
            label="Standoff"
            value={probe.standoff}
            unit="mm"
            min={2}
            max={part.halfWidth - 5}
            onChange={(v) => update({ probe: { standoff: v } })}
          />
        </div>
        <div className="nbt-row">
          <NumberField
            label="Frequency"
            value={probe.frequency}
            unit="MHz"
            min={0.5}
            max={20}
            step={0.5}
            onChange={(v) => update({ probe: { frequency: v } })}
          />
          <NumberField
            label="Crystal (conv.)"
            value={probe.elementSize}
            unit="mm"
            min={2}
            max={40}
            onChange={(v) => update({ probe: { elementSize: v } })}
          />
        </div>
        <div className="nbt-row">
          <NumberField
            label="Elements (PA)"
            value={probe.elements}
            min={1}
            max={128}
            onChange={(v) => update({ probe: { elements: Math.round(v) } })}
          />
          <NumberField
            label="Pitch (PA)"
            value={probe.pitch}
            unit="mm"
            min={0.1}
            max={5}
            step={0.1}
            onChange={(v) => update({ probe: { pitch: v } })}
          />
        </div>
        <div className="nbt-row">
          <SelectField
            label="Wedge"
            value={probe.wedgeId}
            options={WEDGES.map((w) => ({ value: w.id, label: w.name }))}
            onChange={(v) => update({ probe: { wedgeId: v } })}
          />
          <Segmented<WaveMode>
            label="Wave mode"
            value={probe.waveMode}
            options={[
              { value: 'shear', label: 'Shear' },
              { value: 'longitudinal', label: 'Long' },
            ]}
            onChange={(v) => update({ probe: { waveMode: v } })}
          />
        </div>
      </div>

      <div className="nbt-section">
        <div className="nbt-section-title">Beam</div>
        <div className="nbt-row nbt-single">
          <Segmented<BeamMode>
            value={beam.mode}
            options={[
              { value: 'conventional', label: 'Conventional' },
              { value: 'sectorial', label: 'S-scan' },
            ]}
            onChange={(v) => update({ beam: { mode: v } })}
          />
        </div>
        {beam.mode === 'conventional' ? (
          <>
            <div className="nbt-row">
              <NumberField
                label="Refracted angle"
                value={beam.angle}
                unit="deg"
                min={0}
                max={85}
                onChange={(v) => update({ beam: { angle: v } })}
              />
              <div className="nbt-field">
                <label>Presets</label>
                <div className="nbt-seg">
                  {[45, 60, 70].map((a) => (
                    <button
                      key={a}
                      className={beam.angle === a ? 'nbt-on' : ''}
                      onClick={() => update({ beam: { angle: a } })}
                    >
                      {a}°
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <Toggle
              label="Skip markers"
              value={beam.showSkipMarkers}
              onChange={(v) => update({ beam: { showSkipMarkers: v } })}
            />
          </>
        ) : (
          <div className="nbt-row nbt-triple">
            <NumberField
              label="Sweep start"
              value={beam.sweepStart}
              unit="deg"
              min={10}
              max={85}
              onChange={(v) => update({ beam: { sweepStart: Math.min(v, beam.sweepEnd) } })}
            />
            <NumberField
              label="Sweep end"
              value={beam.sweepEnd}
              unit="deg"
              min={10}
              max={85}
              onChange={(v) => update({ beam: { sweepEnd: Math.max(v, beam.sweepStart) } })}
            />
            <NumberField
              label="Step"
              value={beam.sweepStep}
              unit="deg"
              min={0.5}
              max={10}
              step={0.5}
              onChange={(v) => update({ beam: { sweepStep: v } })}
            />
          </div>
        )}
        <div className="nbt-row">
          <NumberField
            label="Legs (half-skips)"
            value={beam.legs}
            min={1}
            max={8}
            onChange={(v) => update({ beam: { legs: Math.round(v) } })}
          />
          <div className="nbt-field">
            <label>Spread drop</label>
            <div className="nbt-seg">
              {[6, 12, 20].map((db) => (
                <button
                  key={db}
                  className={beam.spreadDb === db ? 'nbt-on' : ''}
                  onClick={() => update({ beam: { spreadDb: db } })}
                >
                  −{db} dB
                </button>
              ))}
            </div>
          </div>
        </div>
        <Toggle
          label="Beam spread envelope"
          value={beam.showSpread}
          onChange={(v) => update({ beam: { showSpread: v } })}
        />
      </div>
    </aside>
  );
}
