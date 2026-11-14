// A Stage's road (14 Nov 2026, his "build completely" on the idea picture 08). One of the parts right after the first
// screen (parts.ts: never import it straight); the Stage draws its road and Levels before they are here, these come on
// top. Its style is in profile.css (.f-rd-*, .f-mapowl).
// - The owl with its body stands on the Level he is on; when he finished one since he last looked, it walks along the
//   road to the next (the phone remembers where it stood).
// - Classmates' faces on the Level they are on: his Level and the ones ahead only (family.road never sends who is
//   behind him: nobody is shown as last). A tap says who. A workbook's road only (a tute's ladder isn't in the spots).
// - A chest after every 3rd Level (never the last: the cup is there): it shakes once its Level is done, a tap opens it
//   (a few coins for his Shop, never XP). A Level finished before the chests came shows its chest open and empty.
// - The last Level is the FINAL.

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { FamilyRoad } from "../../convex/family";
import type { World } from "../../convex/lib/family";
import { keep, mutation, query, sameOr, words } from "./net";
import { Buddy } from "./owlBody";
import { picOf, usePics } from "./pics";
import { Coffer, openChest } from "./quests";
import { buzz, sound } from "./sound";
import { Avatar, toast } from "./ui";

type Pt = { x: number; y: number };

/** The road's line between two stops (map.tsx roadThrough's curve), at t (0–1). */
function along(a: Pt, b: Pt, t: number): Pt {
  const k = (b.y - a.y) * 0.55;
  const u = 1 - t;
  const c1 = { x: a.x, y: a.y + k };
  const c2 = { x: b.x, y: b.y - k };
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
  };
}

/** The owl stands beside a stop, on its roomier side: its middle this far from the stop's (px). */
const OWL_SIDE = 64;
const sideOf = (p: Pt) => (p.x < 50 ? OWL_SIDE : -OWL_SIDE);

/** The owl on the road: beside the stop `at`; walks there from `from` (stops in order) along the road. */
function RoadOwl(props: { stops: Pt[]; at: number; from: number | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { stops, at } = props;
  const p = stops[at];
  const walking = props.from !== null && props.from < at;
  const [pose, setPose] = useState<"yes" | "hello">(walking ? "yes" : "hello");
  useLayoutEffect(() => {
    const el = ref.current;
    const w = el?.parentElement?.clientWidth ?? 0;
    if (!el || !walking || !w || typeof el.animate !== "function") return;
    const from = props.from!;
    // Along the road from the stop he was on to this one, stop by stop; the owl keeps beside the road.
    const frames: Keyframe[] = [];
    const per = 10;
    for (let s = from; s < at; s++) {
      for (let i = 0; i < per; i++) {
        const t = i / per;
        const q = along(stops[s], stops[s + 1], t);
        const side = sideOf(stops[s]) * (1 - t) + sideOf(stops[s + 1]) * t;
        frames.push({ transform: `translate(${((q.x - p.x) * w) / 100 + side - sideOf(p)}px, ${q.y - p.y}px)` });
      }
    }
    frames.push({ transform: "translate(0px, 0px)" });
    const a = el.animate(frames, { duration: 900 + 500 * (at - from), easing: "ease-in-out", fill: "backwards" });
    sound("whoosh");
    a.onfinish = () => setPose("hello");
    return () => a.cancel();
  }, []);
  return (
    <span ref={ref} class={`f-rd-owl ${p.x < 50 ? "r" : "l"}`} style={{ left: `${p.x}%`, top: `${p.y}px` }} aria-hidden="true">
      <Buddy pose={pose} key={pose} />
    </span>
  );
}

/** Classmates on one stop: up to 3 faces and how many more; a tap says who. */
function Faces(props: { g: FamilyRoad["mates"][number]; at: Pt; mine: boolean; side: "r" | "l"; label: string }) {
  const { g } = props;
  const names = g.f.map((f) => f.n).join(", ") + (g.c > g.f.length ? ` +${g.c - g.f.length}` : "");
  return (
    <button
      type="button"
      class={`f-rd-faces ${props.side}${props.mine ? " mine" : ""}`}
      style={{ left: `${props.at.x}%`, top: `${props.at.y}px` }}
      aria-label={`${names}: ${props.label}`}
      onClick={() => {
        buzz();
        sound("tap");
        toast(props.mine ? `${names}: உன்னுடன் இதே Level இல்!` : `${names}: ${props.label} இல்`);
      }}
    >
      {g.f.map((f) => (
        <span key={f.id}>
          <Avatar name={f.n} size="s" pic={picOf(f.pic)} />
        </span>
      ))}
      {g.c > g.f.length && <b>+{g.c - g.f.length}</b>}
    </button>
  );
}

/**
 * On top of a Stage's road (map.tsx StageScreen): the owl, classmates, the chests, FINAL. `pts` = its Levels' stops,
 * `cup` = the trophy's; `playIdx` = the Level he is on (−1: none to play).
 */
export function RoadPlus(props: { w: World; pts: Pt[]; cup: Pt; playIdx: number; onChange: () => void }) {
  const { w, pts, cup } = props;
  const n = w.levels.length;
  const key = `road.${w.unitId}`;
  const [road, setRoad] = useState<FamilyRoad | null>(() => keep<FamilyRoad>(key));
  const [busy, setBusy] = useState(false);
  const load = () =>
    query("family:road", { unitId: w.unitId })
      .then((x) => {
        keep(key, x);
        setRoad((shown) => sameOr(shown, x as FamilyRoad));
      })
      .catch(() => {});
  useEffect(() => {
    void load();
  }, [w.unitId]);
  // Where the owl stands: his Level, or the cup when every Level is done; and where it stood when he last looked.
  const stops = [...pts, cup];
  const doneIdx = w.levels.reduce((a, l, i) => (l.s === "done" || l.s === "check" || l.s === "class" || l.s === "pre" ? i : a), -1);
  const at = w.allDone ? n : props.playIdx >= 0 ? props.playIdx : Math.min(n, doneIdx + 1);
  const [from] = useState(() => keep<number>(`roadAt.${w.unitId}`));
  useEffect(() => {
    keep(`roadAt.${w.unitId}`, at);
  }, [at]);
  usePics((road?.mates ?? []).flatMap((g) => g.f.map((f) => f.pic)));
  const idxOf = (ln: number) => w.levels.findIndex((l) => l.n === ln);
  const last = n ? w.levels[n - 1].n : 0;
  const tapChest = (c: FamilyRoad["chests"][number]) => {
    buzz();
    if (c.s === "wait") {
      sound("wrong");
      return toast(`Level ${c.n} முடித்தால் இந்தப் பெட்டி திறக்கும்!`);
    }
    if (c.s === "old") return toast("இந்த Level ஐ பெட்டிகள் வரும் முன் முடித்தாய்.");
    if (c.s === "open") return toast(`திறந்தாய்: +${c.c ?? 0} coins.`);
    if (busy) return;
    setBusy(true);
    mutation("coins:roadChest", { unitId: w.unitId, n: c.n })
      .then((r) => {
        openChest((r as { c: number }).c, `Level ${c.n} · பெட்டி`);
        void load();
        props.onChange();
      })
      .catch((e) => toast(words(e)))
      .finally(() => setBusy(false));
  };
  return (
    <>
      {n > 1 && (
        <span class={`f-rd-final ${pts[n - 1].x < 50 ? "r" : "l"}`} style={{ left: `${pts[n - 1].x}%`, top: `${pts[n - 1].y}px` }} aria-hidden="true">
          FINAL
        </span>
      )}
      {(road?.chests ?? []).map((c) => {
        const i = idxOf(c.n);
        if (i < 0 || i >= n - 1) return null;
        const a = pts[i];
        const b = pts[i + 1];
        const mid = along(a, b, 0.5);
        const x = mid.x + (mid.x < 50 ? 19 : -19);
        return (
          <button
            key={c.n}
            type="button"
            class={`f-rd-chest ${c.s}`}
            style={{ left: `${x}%`, top: `${mid.y}px` }}
            aria-label={c.s === "ready" ? `Open the chest after Level ${c.n}` : `The chest after Level ${c.n}`}
            onClick={() => tapChest(c)}
          >
            <Coffer class={c.s === "open" || c.s === "old" ? "open" : ""} />
            {c.s === "open" && <b>+{c.c ?? 0}</b>}
          </button>
        );
      })}
      {/* A topic tute's road starts with its ladder (n < 0): where a classmate is there isn't in the spots, so no faces. */}
      {w.levels.every((l) => l.n > 0) && (road?.mates ?? []).map((g) => {
        const i = idxOf(g.n);
        const finished = i < 0 && g.n > last;
        if (i < 0 && !finished) return null;
        const p = finished ? cup : pts[i];
        const mine = i === at;
        // His own Level: the faces on the side the owl is not; ahead: the roomier side.
        const roomy = p.x < 50 ? "r" : "l";
        const side = mine ? (roomy === "r" ? "l" : "r") : roomy;
        return <Faces key={g.n} g={g} at={p} mine={mine} side={side} label={finished ? "Stage முடிந்தது" : `Level ${w.levels[i].d ?? g.n}`} />;
      })}
      {w.book && n > 0 && <RoadOwl stops={stops} at={at} from={from} />}
    </>
  );
}

/** The owl with its body beside the Stage he is on, on the syllabus map (map.tsx StageNode). */
export function MapOwl() {
  return (
    <span class="f-mapowl" aria-hidden="true">
      <Buddy pose="hello" />
    </span>
  );
}
