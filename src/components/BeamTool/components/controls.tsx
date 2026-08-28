import { useEffect, useRef, useState } from 'react';

export function NumberField(props: {
  label: string;
  value: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const { label, value, unit, min, max, step, onChange } = props;
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const debounce = useRef<number | undefined>(undefined);

  // sync from outside (probe drag, central clamps) — never while the user types
  useEffect(() => {
    if (focused) return;
    setText((prev) => (parseFloat(prev) === value ? prev : String(round2(value))));
  }, [value, focused]);

  useEffect(() => () => window.clearTimeout(debounce.current), []);

  const inRange = (v: number) =>
    !Number.isNaN(v) && (min === undefined || v >= min) && (max === undefined || v <= max);

  const parsed = parseFloat(text);
  const invalid = text.trim() !== '' && !inRange(parsed);

  const commit = (raw: string) => {
    window.clearTimeout(debounce.current);
    let v = parseFloat(raw);
    if (Number.isNaN(v)) {
      setText(String(round2(value)));
      return;
    }
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    setText(String(round2(v)));
    onChange(v);
  };

  return (
    <div className="nbt-field">
      <label>{label}</label>
      <div
        className={'nbt-field-input' + (invalid ? ' nbt-invalid' : '')}
        title={min !== undefined || max !== undefined ? `${min ?? '…'} – ${max ?? '…'}` : undefined}
      >
        <input
          type="number"
          value={text}
          step={step ?? 1}
          min={min}
          max={max}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            // live-commit valid input on a short debounce so typing "60"
            // doesn't drive the canvas through 6° on the way
            window.clearTimeout(debounce.current);
            debounce.current = window.setTimeout(() => {
              const v = parseFloat(raw);
              if (inRange(v)) onChange(v);
            }, 300);
          }}
          onBlur={(e) => {
            setFocused(false);
            commit(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
          }}
        />
        {unit && <span className="nbt-field-unit">{unit}</span>}
      </div>
    </div>
  );
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function SelectField(props: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="nbt-field">
      <label>{props.label}</label>
      <div className="nbt-field-input">
        <select value={props.value} onChange={(e) => props.onChange(e.target.value)}>
          {props.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function Segmented<T extends string>(props: {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  accent?: 'green' | 'amber';
  onChange: (v: T) => void;
}) {
  return (
    <div className="nbt-field">
      {props.label && <label>{props.label}</label>}
      <div className="nbt-seg">
        {props.options.map((o) => (
          <button
            key={o.value}
            className={
              (props.value === o.value ? 'nbt-on ' : '') +
              (props.accent === 'amber' ? 'nbt-amber' : '')
            }
            onClick={() => props.onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle(props: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.value}
      className={'nbt-toggle' + (props.value ? ' nbt-on' : '')}
      onClick={() => props.onChange(!props.value)}
    >
      <span>{props.label}</span>
      <span className="nbt-pill" aria-hidden="true" />
    </button>
  );
}
