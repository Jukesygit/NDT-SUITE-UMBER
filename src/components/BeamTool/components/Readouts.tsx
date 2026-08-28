import type { AppState } from '../types';
import { readoutItems } from '../sheet';

export function Readouts(props: { state: AppState }) {
  const items = readoutItems(props.state);
  return (
    <div className="nbt-readout">
      {items.map((it) => (
        <div className="nbt-readout-item" key={it.k}>
          <span className="nbt-k">{it.k}</span>
          {/* `cls` stays a semantic token ('plain' | 'warn') in sheet.ts — which
              also drives the PNG export's canvas colours — so the nbt- prefix is
              applied here, where the class string is actually built. */}
          <span className={'nbt-v ' + (it.cls ? 'nbt-' + it.cls : '')}>{it.v}</span>
        </div>
      ))}
    </div>
  );
}
