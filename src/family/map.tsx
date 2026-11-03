// The map (his voice note, 3 Nov 2026: "a beautiful map, not a straight line, like a game"): every World of his grade
// is a stretch of a night road winding down the screen, its Levels the stops on it. A Level he finished glows gold (its
// ring = how much of its XP he won), his Level now carries the owl and "Start", the rest wait; a locked World is dim.
// Only the Level he is on can be played (the paper is the truth, level by level: convex/lib/family.ts).

import { useEffect, useRef, useState } from "preact/hooks";
import type { FamilyMe } from "../../convex/family";
import type { World, WorldLevel } from "../../convex/lib/family";
import { buzz, sound } from "./sound";
import { Icon, Lamp, Owl, toast } from "./ui";

/** px between two Levels on the road. */
const STEP = 96;
/** px from a World's banner to its first Level (room for the owl and "Start" above it), and from its last Level to its cup. */
const HEAD = 84;
const TAIL = 92;
/** How far the road swings left and right of the middle (% of the width). */
const SWAY = 25;
/** Each World its own colour (hue), in turn: violet, blue, cyan, rose, amber, indigo. */
const HUES = [265, 224, 192, 336, 36, 248];

/** Where the i-th stop of the w-th World sits: x in % of the width, y in px below the top of its road. */
export function spot(i: number, w: number): { x: number; y: number } {
  return { x: 50 + SWAY * Math.sin(i * 0.92 + w * 1.9), y: HEAD + i * STEP };
}

/** A smooth road through the stops (x in %, y in px: the SVG stretches only sideways). */
function roadThrough(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  let d = `M${pts[0].x.toFixed(2)} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const k = (b.y - a.y) * 0.55;
    d += ` C${a.x.toFixed(2)} ${a.y + k} ${b.x.toFixed(2)} ${b.y - k} ${b.x.toFixed(2)} ${b.y}`;
  }
  return d;
}

const STATE_WORDS: Record<WorldLevel["s"], string> = {
  done: "முடிந்தது",
  check: "phone சரிபார்த்தது: ஆசிரியர் உன் தாளைப் பார்ப்பார்",
  class: "ஆசிரியரிடம் உள்ளது",
  pre: "app க்கு முன் முடித்தது",
  play: "இப்போது இது",
  later: "முந்தைய Level ஐ முடி",
};

function LevelStop(props: { w: World; l: WorldLevel; at: { x: number; y: number }; onPlay: () => void; live: boolean; refLive?: (el: HTMLButtonElement | null) => void }) {
  const { w, l } = props;
  const pct = l.got !== undefined && l.max ? Math.round((l.got / l.max) * 100) : l.s === "pre" ? 100 : 0;
  const tap = () => {
    buzz();
    if (props.live) {
      sound("pop");
      return props.onPlay();
    }
    if (!w.open) return toast("இந்த World பூட்டப்பட்டுள்ளது. முந்தைய World ஐ முடி.");
    if (l.s === "play") return toast("இந்த World ஐ இன்னும் phone இல் சரிபார்க்க முடியாது. தாளை வகுப்பில் கொடு.");
    toast(`Level ${l.n}: ${l.got !== undefined ? `${l.got} / ${l.max} XP · ` : ""}${STATE_WORDS[l.s]}`);
  };
  const face = l.s === "pre" ? <Icon name="check" size={22} /> : <b>{l.n}</b>;
  // A finished Level is a medal: gold from 75% of its XP, silver from half, bronze below.
  const medal = l.s === "done" || l.s === "check" ? (pct >= 75 ? " m-gold" : pct >= 50 ? " m-silver" : " m-bronze") : "";
  return (
    <button
      type="button"
      ref={props.refLive}
      class={`f-stop s-${l.s}${medal}${props.live ? " live" : ""}${w.open ? "" : " shut"}`}
      style={{ left: `${props.at.x}%`, top: `${props.at.y}px`, "--p": String(pct) }}
      aria-label={`Level ${l.n}: ${props.live ? "தொடங்கு" : STATE_WORDS[l.s]}`}
      onClick={tap}
    >
      <span class="f-stop-ring" aria-hidden="true" />
      <span class="f-stop-face">{face}</span>
      {l.s === "check" && <i class="f-stop-tag home">⌂</i>}
      {l.s === "class" && <i class="f-stop-tag wait">⏳</i>}
      {props.live && props.refLive && (
        <>
          <span class="f-perch">
            <Owl class="tiny" />
          </span>
          <span class="f-go">தொடங்கு</span>
        </>
      )}
    </button>
  );
}

function WorldRoad(props: { w: World; wi: number; onPlay: (n: number) => void; refLive?: (el: HTMLButtonElement | null) => void }) {
  const { w, wi } = props;
  const n = w.levels.length;
  const stops = w.levels.map((_, i) => spot(i, wi));
  const cup = { x: spot(n, wi).x, y: (stops[n - 1]?.y ?? HEAD) + TAIL };
  const height = cup.y + 56;
  const playIdx = w.levels.findIndex((l) => l.s === "play");
  // The road is gold up to where he is: through every finished stop, and on to the cup when the World is done.
  const reached = w.allDone ? n : playIdx >= 0 ? playIdx : w.levels.filter((l) => l.s !== "later").length - 1;
  const all = [...stops, cup];
  const done = w.levels.filter((l) => l.s !== "play" && l.s !== "later").length;
  const xp = w.levels.reduce((s, l) => s + (l.got ?? 0), 0);
  return (
    <section class={`f-world${w.open ? "" : " shut"}${w.now ? " now" : ""}`} style={{ "--wh": String(HUES[wi % HUES.length]) }} aria-label={`World ${w.no}`}>
      <header class="f-wb">
        <span class="f-wb-no">
          <small>World</small>
          <b>{w.no}</b>
        </span>
        <span class="f-wb-name">{w.ta}</span>
        <span class="f-wb-done">
          {w.open ? (
            <>
              {done}/{n}
            </>
          ) : (
            <Icon name="lock" size={17} />
          )}
        </span>
      </header>
      {w.open && !w.phone && <p class="f-soon">விரைவில் phone இல் · On the phone soon</p>}
      <div class="f-road" style={{ height: `${height}px` }}>
        <svg class="f-road-svg" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" width="100%" height={height} aria-hidden="true">
          <path class="f-road-bed" d={roadThrough(all)} />
          <path class="f-road-dots" d={roadThrough(all)} />
          {reached > 0 && <path class="f-road-glow" d={roadThrough(all.slice(0, reached + 1))} />}
          {reached > 0 && <path class="f-road-gold" d={roadThrough(all.slice(0, reached + 1))} />}
        </svg>
        {w.levels.map((l, i) => {
          const live = l.s === "play" && w.open && w.phone;
          return <LevelStop key={l.n} w={w} l={l} at={stops[i]} live={live} refLive={live ? props.refLive : undefined} onPlay={() => props.onPlay(l.n)} />;
        })}
        <span class={`f-cup${w.allDone ? " won" : ""}`} style={{ left: `${cup.x}%`, top: `${cup.y}px` }} aria-label={w.allDone ? "World முடிந்தது" : undefined}>
          <Icon name="cup" size={26} />
          {w.allDone && <small>{xp} XP</small>}
        </span>
      </div>
    </section>
  );
}

export function MapTab(props: { me: FamilyMe | null; onPlay: (w: World, n: number) => void }) {
  const me = props.me;
  const live = useRef<HTMLButtonElement | null>(null);
  const [away, setAway] = useState(false);
  const firstScroll = useRef(false);

  // Opens on his Level now (the road above it is behind him), and offers a way back when he scrolls away.
  useEffect(() => {
    const el = live.current;
    if (!el) return;
    if (!firstScroll.current) {
      firstScroll.current = true;
      el.scrollIntoView({ block: "center" });
    }
    if (typeof IntersectionObserver !== "function") return;
    const io = new IntersectionObserver(([e]) => setAway(!e.isIntersecting), { rootMargin: "-90px 0px -110px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [me]);

  if (!me) return <p class="f-muted f-pad f-center-t">…</p>;
  // His Level now: in the World he is on in class first, else the first open World the phone can mark.
  const playable = (w: World) => w.open && w.phone && w.levels.some((l) => l.s === "play");
  const liveWorld = me.worlds.find((w) => w.now && playable(w)) ?? me.worlds.find(playable);
  const liveN = liveWorld?.levels.find((l) => l.s === "play")?.n;
  return (
    <div class="f-map">
      <span class="f-moon" aria-hidden="true" />
      {!me.streak.today && (
        <p class="f-keep rise">
          <Lamp size={20} />
          {me.streak.days > 0 ? `இன்று ஒரு Level செய்தால் ${me.streak.days + 1} நாள்!` : "இன்று ஒரு Level செய்து விளக்கை ஏற்று!"}
        </p>
      )}
      {!liveWorld && me.worlds.length > 0 && <p class="f-none rise">இப்போது phone இல் செய்ய Level இல்லை. உன் தாளை வகுப்பில் கொடு.</p>}
      {me.worlds.map((w, wi) => (
        <WorldRoad
          key={w.unitId}
          w={w}
          wi={wi}
          onPlay={(n) => props.onPlay(w, n)}
          refLive={
            w === liveWorld
              ? (el) => {
                  live.current = el;
                }
              : undefined
          }
        />
      ))}
      {me.worlds.length === 0 && <p class="f-none">உன் Worlds விரைவில் வரும்.</p>}
      {away && liveWorld && liveN !== undefined && (
        <button type="button" class="f-jump rise" onClick={() => live.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>
          <Icon name="play" size={16} />
          World {liveWorld.no} · Level {liveN}
        </button>
      )}
    </div>
  );
}
