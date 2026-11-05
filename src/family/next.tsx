// The two level pieces the first screen needs (Home and Learn): which level to play next, and the confetti. They live
// apart from the level screen (play.tsx), which comes right after the first screen (level.ts, 5 Nov 2026).
import type { FamilyMe } from "../../convex/family";
import type { World } from "../../convex/lib/family";

/**
 * The level to play now: in his Stage now first, then in the newest book the teachers gave him (4 Nov 2026, his words:
 * "the unit I taught lastly"), else the first open Stage the phone can mark, in the map's order.
 */
export function nextPlay(me: FamilyMe | null): { world: World; n: number; d: number } | null {
  if (!me) return null;
  const ws = [...me.worlds].sort((a, b) => Number(b.now) - Number(a.now) || (b.given ?? 0) - (a.given ?? 0));
  for (const w of ws) {
    const l = w.book && w.open && w.phone ? w.levels.find((x) => x.s === "play") : undefined;
    if (l) return { world: w, n: l.n, d: l.d ?? l.n };
  }
  return null;
}

/** Confetti from behind the owl: more for a better level. */
export function Confetti(props: { n: number }) {
  return (
    <span class="f-confetti" aria-hidden="true">
      {Array.from({ length: props.n }, (_, i) => (
        <i
          key={i}
          class={`c${i % 4}`}
          style={{ "--a": `${(360 / props.n) * i + (i % 3) * 7}deg`, "--d": `${96 + (i % 4) * 22}px`, "--t": `${(i % 5) * 50}ms`, "--r": `${(i % 2 ? 1 : -1) * (160 + i * 23)}deg` }}
        />
      ))}
    </span>
  );
}
