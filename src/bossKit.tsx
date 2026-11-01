// The Owner page's small pieces (src/boss.tsx, and the Sim tab src/simTab.tsx): a tile, a dot, a meter, columns to tap,
// a list of names that open a student's sheet.

import { useState } from "preact/hooks";
import { busyTone, type Tone } from "./bossData";

export function Tile(props: { v: string | number; k: string; sub?: string; tone?: Tone }) {
  return (
    <div class={`boss-tile${props.tone ? ` t-${props.tone}` : ""}`}>
      <b>{props.v}</b>
      <span>{props.k}</span>
      {props.sub && <small>{props.sub}</small>}
    </div>
  );
}

export function Dot(props: { tone: Tone; label: string }) {
  return <i class={`boss-dot t-${props.tone}`} role="img" aria-label={props.label} />;
}

/** A share of the class time as a bar: green under 65%, amber to 85%, red above. */
export function Meter(props: { label: string; share: number | null; words: string }) {
  const t = busyTone(props.share);
  return (
    <div class="boss-meter">
      <span class="boss-ml">{props.label}</span>
      <span class="boss-mb" aria-hidden="true">
        <i class={`t-${t}`} style={{ width: `${Math.min(100, Math.round((props.share ?? 0) * 100))}%` }} />
      </span>
      <span class="boss-mv">{props.share === null ? "–" : `${Math.round(props.share * 100)}%`}</span>
      <small class="boss-mw">{props.words}</small>
    </div>
  );
}

/**
 * Columns with a value each; tap one to read it (a phone's hover). `sel`/`onPick` share one reading between several
 * rows on the same time line (then the parent shows the words); without them it reads itself on the line below.
 */
export function Bars(props: {
  values: number[];
  tones?: (Tone | "plain")[];
  words: (i: number) => string;
  hint?: string;
  max?: number;
  marks?: string[];
  sel?: number | null;
  onPick?: (i: number | null) => void;
}) {
  const [own, setOwn] = useState<number | null>(null);
  const sel = props.onPick ? (props.sel ?? null) : own;
  const setSel = props.onPick ?? setOwn;
  const max = Math.max(1, props.max ?? 0, ...props.values);
  return (
    <div class="boss-bars">
      <div class="boss-plot">
        {props.values.map((v, i) => (
          <button
            key={i}
            type="button"
            class={`boss-col${sel === i ? " sel" : ""}`}
            aria-label={props.words(i)}
            onClick={() => setSel(sel === i ? null : i)}
          >
            <i class={`t-${props.tones?.[i] ?? "plain"}`} style={{ height: `${v > 0 ? Math.max(4, (v / max) * 100) : 0}%` }} />
          </button>
        ))}
      </div>
      {props.marks && (
        <div class="boss-xm" aria-hidden="true">
          {props.marks.map((m, i) => (
            <span key={i}>{m}</span>
          ))}
        </div>
      )}
      {!props.onPick && <p class="boss-read">{sel !== null && sel < props.values.length ? props.words(sel) : (props.hint ?? "")}</p>}
    </div>
  );
}

export function Names(props: { items: { id: string; name: string; right: string; tone?: Tone }[]; onOpen: (id: string) => void; empty?: string }) {
  if (!props.items.length) return props.empty ? <p class="muted small">{props.empty}</p> : null;
  return (
    <ul class="boss-names">
      {props.items.map((x) => (
        <li key={x.id}>
          <button type="button" class="boss-nm" onClick={() => props.onOpen(x.id)}>
            {x.tone && <Dot tone={x.tone} label={x.tone === "red" ? "urgent" : "watch"} />}
            <b>{x.name}</b>
            <span>{x.right}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
