// The GOAT (11 Nov 2026, his voice note: "an all-time ranking of all grades ... greatest of all time; for that student we
// can give the badge like GOAT, and this needs to be a very stylish badge"; his answer: it moves the moment someone
// passes him). ARISTORA's own medal: a gold coin with depth in a gold laurel, a violet star, a violet ribbon with GOAT;
// a light sweeps across it now and then (transform only, none for reduce motion). Small faces wear a gold ring and a
// GOAT chip instead (the medal would be a smudge at 36 px). Who it is: convex/lib/race.ts goatOf.

import { useState } from "preact/hooks";

/** Each medal its own gradient ids (several on one screen). */
let seq = 0;
const nextId = () => `goat${++seq}`;

/** The laurel's leaves on one side (the other is its mirror): a bow of 6 from the ribbon up. */
const LEAVES = Array.from({ length: 6 }, (_, i) => {
  const deg = 218 - i * 20;
  const a = (deg * Math.PI) / 180;
  // Along the bow (its tangent), tipped out a little like a laurel's leaves.
  return { x: +(60 + 45 * Math.cos(a)).toFixed(1), y: +(56 - 45 * Math.sin(a)).toFixed(1), r: 20 - deg };
});

/** A laurel leaf, pointed at both ends, 20 long. */
const LEAF = "M0-10C5.2-5 5.2 5 0 10C-5.2 5-5.2-5 0-10z";

/** The medal: `size` in px (120 on the GOAT's card, 60 on his Me and profile). */
export function GoatMedal(props: { size?: number; class?: string }) {
  const [id] = useState(nextId);
  const n = props.size ?? 120;
  return (
    <svg class={`f-goat ${props.class ?? ""}`} viewBox="0 0 120 120" width={n} height={n} role="img" aria-label="GOAT: greatest of all time">
      <defs>
        <radialGradient id={`${id}f`} cx="40%" cy="32%" r="75%">
          <stop offset="0" stop-color="#fff2c4" />
          <stop offset="0.45" stop-color="#ffd25e" />
          <stop offset="1" stop-color="#f0a400" />
        </radialGradient>
        <clipPath id={`${id}c`}>
          <circle cx="60" cy="54" r="33" />
        </clipPath>
      </defs>
      <g class="f-goat-laurel">
        {LEAVES.map((l, i) => (
          <g key={i}>
            <path d={LEAF} transform={`translate(${l.x} ${l.y}) rotate(${l.r})`} />
            <path d={LEAF} transform={`translate(${120 - l.x} ${l.y}) rotate(${-l.r})`} />
          </g>
        ))}
      </g>
      <circle cx="60" cy="56" r="35" class="f-goat-edge" />
      <circle cx="60" cy="54" r="33" fill={`url(#${id}f)`} />
      <circle cx="60" cy="54" r="26.5" class="f-goat-ring" />
      <path class="f-goat-star" d="M60 35.5l5.6 11.4 12.6 1.8-9.1 8.9 2.1 12.5L60 64.2l-11.2 5.9 2.1-12.5-9.1-8.9 12.6-1.8z" />
      <g clip-path={`url(#${id}c)`}>
        <g transform="rotate(20 60 54)">
          <rect class="f-goat-shine" x="-30" y="0" width="16" height="120" />
        </g>
      </g>
      <path class="f-goat-tail" d="M22 86l10-4v18l-10 4 5-9z M98 86l-10-4v18l10 4-5-9z" />
      <path class="f-goat-band" d="M28 80h64l-3 9 3 9H28l3-9z" />
      <text x="60" y="94" class="f-goat-t">
        GOAT
      </text>
    </svg>
  );
}

/** The chip under a small face: GOAT on gold. */
export function GoatChip() {
  return (
    <i class="f-goatchip" aria-label="GOAT">
      GOAT
    </i>
  );
}

/**
 * What he keeps for good, under his name on Me and on a profile (11 Nov 2026, in place of the rank badges): the GOAT's
 * medal, or his place in his grade's all-time list. Nothing before his first XP (or from a server before).
 */
export function EverLine(props: { ever?: { place: number | null; of: number; goat: boolean }; grade: number | null }) {
  const e = props.ever;
  if (!e) return null;
  if (e.goat)
    return (
      <p class="f-everl goat">
        <GoatMedal size={46} />
        <span>
          <b>GOAT</b>
          <small>Greatest of all time · every grade</small>
        </span>
      </p>
    );
  if (e.place === null) return null;
  return (
    <p class="f-everl">
      <b>All time #{e.place}</b>
      <small>
        of {e.of}
        {props.grade ? ` · Grade ${props.grade}` : ""}
      </small>
    </p>
  );
}
