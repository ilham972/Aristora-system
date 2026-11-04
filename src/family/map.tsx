// Learn: the whole syllabus of his grade as one map (his voice notes, 3 Nov 2026). Each school term is a World, each
// unit a Stage on its winding road, each Stage's Levels inside it. On the O/L map (4 Nov 2026: the teachers tick him in
// Settings → Students → O/L map) each paper part is a World and each O/L topic a Stage. The books he has from the other
// syllabus (an O/L book on a grade's map; his grade's books on the O/L map) come last, as one more World.
// - At the top, the Stage he is on: its name, how far he is, and Continue (his Level now, one tap).
// - A Stage he finished is purple with a ✓; the one he is on is the gold star with START; one the teachers opened shows
//   how far he is in it; a locked one has a lock; one whose workbook is not in the app yet says "soon".
// - Inside a Stage: its Levels on a smaller road. Only the Level he is on can be played (the paper is the truth, level
//   by level: convex/lib/family.ts); the others say where they are (marked, with the teacher, done before the app).

import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import type { FamilyMe } from "../../convex/family";
import type { World, WorldLevel } from "../../convex/lib/family";
import { nextPlay } from "./play";
import { buzz, sound } from "./sound";
import { Dashes, Flame, flameAtRisk, Gem, Icon, Owl, OwlBadge, OwlSays, PART_TA, Tag, TERM_TA, titleSize, toast, Waiting, type Mood } from "./ui";

// ---- The road: a smooth line through the stops (x in % of the width, y in px) ----

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

/** The road under the stops: lavender, a dashed white middle, purple up to where he is. */
function Road(props: { pts: { x: number; y: number }[]; height: number; reached: number }) {
  const d = roadThrough(props.pts);
  const r = props.reached > 0 ? roadThrough(props.pts.slice(0, props.reached + 1)) : "";
  return (
    <svg class="f-road" viewBox={`0 0 100 ${props.height}`} preserveAspectRatio="none" width="100%" height={props.height} aria-hidden="true">
      <path class="f-road-bed" d={d} vector-effect="non-scaling-stroke" />
      {r && <path class="f-road-done" d={r} vector-effect="non-scaling-stroke" />}
      <path class="f-road-mid" d={d} vector-effect="non-scaling-stroke" />
    </svg>
  );
}

// ---- The syllabus map ----

/** A World: its key, its number, its name (Tamil, the banner on the map) and `en` (English, a header's kicker). */
export type WorldGroup = { key: string; no: number; name: string; en: string; stages: World[] };

/** The O/L map's paper parts in English letters (a kicker): its `term` 1–4. */
const PART_EN: Record<number, string> = { 1: "Part 1A", 2: "Part 1B", 3: "Part 2A", 4: "Part 2B" };

/**
 * The Worlds: his map's units grouped by term (terms 1–3 in order, then any extra book), or by paper part on the O/L
 * map (Paper I A … II B); then the other syllabus's books he has, as one more World ("O/L", or his grade's).
 */
export function worldGroups(me: FamilyMe): WorldGroup[] {
  const main = me.worlds.filter((w) => !w.other);
  const terms = [...new Set(main.map((w) => w.term ?? 0))].sort((a, b) => (a || 9) - (b || 9));
  const out: WorldGroup[] = terms.map((term, i) => ({
    key: `t${term}`,
    no: i + 1,
    name: (me.ol ? PART_TA[term] : TERM_TA[term]) ?? `World ${i + 1}`,
    en: (me.ol ? PART_EN[term] : term ? `Term ${term}` : "Extra") ?? "",
    stages: main.filter((w) => (w.term ?? 0) === term),
  }));
  const other = me.worlds.filter((w) => w.other);
  if (other.length) {
    const own = me.ol ? (me.grade ? `Grade ${me.grade}` : "") : "O/L";
    out.push({ key: "other", no: out.length + 1, name: own || "பாடசாலை", en: own || "School", stages: other });
  }
  return out;
}

/** A Stage's levels finished (handed in, marked, or done before the app). */
export const levelsDone = (w: World) => w.levels.filter((l) => l.s !== "play" && l.s !== "later").length;

type NodeState = "done" | "now" | "open" | "lock" | "soon";

function stateOf(w: World, focus: World | null): NodeState {
  if (!w.book) return "soon";
  if (focus && w.unitId === focus.unitId) return "now";
  if (w.allDone) return "done";
  return w.open ? "open" : "lock";
}

/** A header's kicker: "WORLD 1 · TERM 2", "WORLD 3 · PART 2A", "WORLD 5 · O/L" (English letters only: a kicker is
 *  spaced out, and spaced Tamil reads badly). The World's Tamil name is its banner on the map. */
const worldWords = (g: WorldGroup | undefined) => `World ${g?.no ?? 1}${g?.en ? ` · ${g.en}` : ""}`;

/** Where the i-th Stage of a World sits: swinging well left and right (so START over his Stage never covers the one
 *  before it), a little differently in each World. */
const STAGE_STEP = 132;
const STAGE_HEAD = 104;
const stagePos = (i: number, g: number) => ({ x: 50 + 25 * Math.sin(i * 1.6 + g * 1.7), y: STAGE_HEAD + i * STAGE_STEP });

function StageNode(props: { w: World; st: NodeState; at: { x: number; y: number }; onOpen: () => void }) {
  const { w, st, at } = props;
  const done = levelsDone(w);
  const pct = w.levels.length ? Math.round((done / w.levels.length) * 100) : 0;
  const right = at.x < 50; // the words go to the roomier side
  const tap = () => {
    buzz();
    if (st === "soon") return toast(`Stage ${w.no}: விரைவில் app இல் வரும்.`);
    if (st === "lock") {
      sound("wrong");
      return toast("இது பூட்டப்பட்டுள்ளது: முன்னுள்ள Stage ஐ முடி, அல்லது வகுப்பில் கேள்.");
    }
    sound("pop");
    props.onOpen();
  };
  return (
    <div class={`f-nodewrap ${right ? "r" : "l"}`} style={{ left: `${at.x}%`, top: `${at.y}px`, "--room": String(Math.round(right ? 100 - at.x : at.x)) }}>
      {st === "now" && (
        <span class="f-start" aria-hidden="true">
          START
        </span>
      )}
      <button type="button" class={`f-node s-${st}`} style={{ "--p": String(pct) }} aria-label={`Stage ${w.no}: ${w.ta}`} onClick={tap}>
        {st === "now" && <span class="f-node-ring" aria-hidden="true" />}
        <span class="f-node-c">
          {st === "done" ? (
            <Icon name="check" size={30} />
          ) : st === "lock" ? (
            <Icon name="lock" size={24} />
          ) : st === "now" ? (
            <Icon name="star" size={34} class="fill" />
          ) : (
            <b>{w.no}</b>
          )}
        </span>
      </button>
      <span class="f-cap">
        <small>
          Stage {w.no}
          {st === "soon" ? " · soon" : st === "open" || st === "now" ? ` · ${done}/${w.levels.length}` : ""}
        </small>
        <b>{w.ta}</b>
      </span>
    </div>
  );
}

function WorldMap(props: { g: WorldGroup; focus: World | null; onStage: (unitId: string) => void }) {
  const { g, focus } = props;
  const n = g.stages.length;
  const pts = g.stages.map((_, i) => stagePos(i, g.no));
  const chest = { x: stagePos(n, g.no).x, y: (pts[n - 1]?.y ?? STAGE_HEAD) + STAGE_STEP - 10 };
  const height = chest.y + 64;
  const states = g.stages.map((w) => stateOf(w, focus));
  const finished = g.stages.filter((w) => w.book && w.allDone).length;
  const books = g.stages.filter((w) => w.book).length;
  const allDone = books > 0 && finished === books;
  // Purple road up to his Stage now (or past every Stage he finished).
  const nowAt = states.indexOf("now");
  let reached = nowAt;
  if (reached < 0) {
    reached = -1;
    states.forEach((s, i) => {
      if (s === "done") reached = i;
    });
    if (allDone) reached = n;
  }
  return (
    <section class={`f-world${allDone ? " won" : ""}`} aria-label={`World ${g.no}`}>
      <header class="f-wbanner">
        <span class="f-wno">
          <small>World</small>
          <b>{g.no}</b>
        </span>
        <span class="f-wname">
          <b>{g.name}</b>
          <small>
            {n} Stages{books < n ? ` · ${books} ready` : ""}
          </small>
        </span>
        <span class="f-wdone" style={{ "--p": String(books ? Math.round((finished / books) * 100) : 0) }}>
          {finished}/{books}
        </span>
      </header>
      <div class="f-roadbox" style={{ height: `${height}px` }}>
        <Road pts={[...pts, chest]} height={height} reached={reached} />
        {g.stages.map((w, i) => (
          <StageNode key={w.unitId} w={w} st={states[i]} at={pts[i]} onOpen={() => props.onStage(w.unitId)} />
        ))}
        <span class={`f-chest${allDone ? " won" : ""}`} style={{ left: `${chest.x}%`, top: `${chest.y}px` }} aria-label={allDone ? `World ${g.no}: won` : undefined}>
          <Icon name="trophy" size={26} />
        </span>
      </div>
    </section>
  );
}

/** What the owl says on the map: today's flame first, then how close the Stage is. */
function coachWords(me: FamilyMe, focus: World | null, n: number | null): { mood: Mood; text: string } {
  if (!me.streak.today && n !== null) {
    return me.streak.days > 0
      ? { mood: flameAtRisk(me.streak) ? "grumpy" : "wave", text: `இன்று ஒரு Level செய்தால் ${me.streak.days + 1} நாள் தொடர்! தீயை அணைய விடாதே.` }
      : { mood: "wave", text: "இன்று ஒரு Level செய்து உன் தீயை மூட்டு!" };
  }
  if (focus && n !== null) {
    const left = focus.levels.length - levelsDone(focus);
    return { mood: "happy", text: left <= 2 ? `இன்னும் ${left} Level: Stage ${focus.no} முடியப் போகிறது!` : `Stage ${focus.no}: ${left} Levels மீதம். தொடர்ந்து செல்!` };
  }
  return { mood: "sleep", text: "இப்போது phone இல் செய்ய Level இல்லை. உன் தாளை வகுப்பில் கொடு." };
}

export function LearnTab(props: { top: ComponentChildren; me: FamilyMe | null; onStage: (unitId: string) => void; onPlay: () => void }) {
  const me = props.me;
  if (!me) {
    return (
      <>
        <header class="f-hero">{props.top}</header>
        <Waiting />
      </>
    );
  }
  const next = nextPlay(me);
  const focus = next?.world ?? me.worlds.find((w) => w.now && w.book && w.open) ?? me.worlds.find((w) => w.book && w.open && !w.allDone) ?? null;
  const groups = worldGroups(me);
  const g = focus ? groups.find((x) => x.stages.includes(focus)) : undefined;
  const coach = coachWords(me, focus, next?.n ?? null);
  return (
    <>
      <header class="f-hero">
        {props.top}
        {focus ? (
          <div class="f-hero-in">
            <div class="f-hero-w">
              <p class="f-kicker">{worldWords(g)}</p>
              <h1 class={`f-title${titleSize(focus.ta)}`}>{focus.ta}</h1>
              <p class="f-hsub">{focus.en}</p>
              <Tag tone="glass">Stage {focus.no}</Tag>
            </div>
            <OwlBadge mood={focus.allDone ? "champ" : "happy"} class="hero" />
            <div class="f-hero-foot">
              <span class="f-hprog">
                <Dashes done={levelsDone(focus)} of={focus.levels.length} />
                <small>
                  {levelsDone(focus)} / {focus.levels.length} Levels
                </small>
              </span>
              {next ? (
                <button type="button" class={`f-btn gold f-cont${me.streak.today ? "" : " shine"}`} onClick={props.onPlay}>
                  Level {next.d} <Icon name="play" size={15} class="fill" />
                </button>
              ) : (
                <button type="button" class="f-btn white f-cont" onClick={() => props.onStage(focus.unitId)}>
                  Stage {focus.no} <Icon name="next" size={16} />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div class="f-hero-in">
            <div class="f-hero-w">
              <p class="f-kicker">{me.ol ? "O/L" : me.grade ? `Grade ${me.grade}` : "ARISTORA"}</p>
              <h1 class="f-title">Your syllabus</h1>
              <p class="f-hsub">{me.ol ? "ஒவ்வொரு பகுதியும் ஒரு World." : "ஒவ்வொரு தவணையும் ஒரு World."}</p>
            </div>
            <OwlBadge mood="wave" class="hero" />
          </div>
        )}
      </header>
      <OwlSays mood={coach.mood} class="f-coach rise">
        {!me.streak.today && next && <Flame lit={false} size={16} />} {coach.text}
      </OwlSays>
      <div class="f-map">
        {groups.map((x) => (
          <WorldMap key={x.key} g={x} focus={focus} onStage={props.onStage} />
        ))}
        {me.worlds.length === 0 && <p class="f-none">உன் பாடத்திட்டம் விரைவில் வரும்.</p>}
      </div>
    </>
  );
}

// ---- Inside a Stage: its Levels ----

const STATE_WORDS: Record<WorldLevel["s"], string> = {
  done: "Done ✓",
  check: "phone சரிபார்த்தது: ஆசிரியர் உன் தாளைப் பார்ப்பார்",
  class: "ஆசிரியரிடம் உள்ளது",
  pre: "app க்கு முன் முடித்தது",
  play: "Now",
  later: "முந்தைய Level ஐ முடி",
};

const LV_STEP = 124;
const LV_HEAD = 86;
const lvPos = (i: number) => ({ x: 50 + 24 * Math.sin(i * 1.6), y: LV_HEAD + i * LV_STEP });

export function StageScreen(props: {
  me: FamilyMe;
  world: World;
  onBack: () => void;
  onPlay: (n: number) => void;
  onBook: (n: number) => void;
  /** The level whose photos he owes (his limit): its book, in this Stage or another. */
  onPhotos: (b: NonNullable<FamilyMe["blocked"]>) => void;
  /** Every Level done: the Stage's certificate (4 Nov 2026). */
  onCert?: () => void;
}) {
  const { me, world: w } = props;
  const groups = worldGroups(me);
  const g = groups.find((x) => x.stages.some((s) => s.unitId === w.unitId));
  const n = w.levels.length;
  const done = levelsDone(w);
  const pts = w.levels.map((_, i) => lvPos(i));
  const cup = { x: lvPos(n).x, y: (pts[n - 1]?.y ?? LV_HEAD) + LV_STEP - 6 };
  const height = cup.y + 60;
  const playIdx = w.levels.findIndex((l) => l.s === "play");
  const reached = w.allDone ? n : playIdx >= 0 ? playIdx : done - 1;
  const canPlay = w.book && w.open && w.phone;
  useEffect(() => {
    const el = document.querySelector(".f-lv.play");
    if (el && el.getBoundingClientRect().top > window.innerHeight - 160) el.scrollIntoView({ block: "center" });
  }, []);
  // His limit (4 Nov 2026): 2 levels at most after one that still owes photos.
  const stop = me.blocked;
  const tap = (l: WorldLevel) => {
    buzz();
    if (l.s === "play" && canPlay && stop) {
      sound("wrong");
      toast(`📷 முதலில் Stage ${stop.no} · Level ${stop.n} இன் படங்களை அனுப்பு.`);
      return props.onPhotos(stop);
    }
    if (l.s === "play" && canPlay) return props.onPlay(l.n);
    // A level marked at home: its book (solutions, photos, the teacher's answers).
    if (l.hm) {
      sound("tap");
      return props.onBook(l.n);
    }
    if (!w.open) {
      sound("wrong");
      return toast("இந்த Stage பூட்டப்பட்டுள்ளது.");
    }
    if (l.s === "play") return toast("இந்த Stage ஐ இன்னும் phone இல் சரிபார்க்க முடியாது. தாளை வகுப்பில் கொடு.");
    sound("tap");
    toast(`Level ${l.d ?? l.n}: ${l.got !== undefined ? `${l.got} / ${l.max} XP · ` : ""}${STATE_WORDS[l.s]}`);
  };
  return (
    <div class={`f-stage${stop && canPlay && playIdx >= 0 ? " stopped" : ""}`}>
      <header class="f-hero">
        <div class="f-toprow">
          <button type="button" class="f-round on-brand" aria-label="Back" onClick={props.onBack}>
            <Icon name="back" size={20} />
          </button>
          <span class="f-sp" />
          <span class={`f-pill fire${me.streak.today ? " lit" : ""}`}>
            <Flame lit={me.streak.today} />
            {me.streak.days}
          </span>
          <span class="f-pill gem">
            <Gem />
            {me.total.toLocaleString("en")}
          </span>
        </div>
        <div class="f-hero-in">
          <div class="f-hero-w">
            <p class="f-kicker">{worldWords(g)}</p>
            <h1 class={`f-title${titleSize(w.ta)}`}>{w.ta}</h1>
            <p class="f-hsub">{w.en}</p>
            <Tag tone="glass">Stage {w.no}</Tag>
          </div>
          <OwlBadge mood={!w.book ? "sleep" : w.allDone ? "champ" : "happy"} class="hero" />
          {w.book && (
            <div class="f-hero-foot">
              <span class="f-hprog">
                <Dashes done={done} of={n} />
                <small>
                  {done} / {n} Levels
                </small>
              </span>
            </div>
          )}
        </div>
      </header>
      {!w.book ? (
        <div class="f-center f-pad">
          <Owl mood="sleep" class="mid" />
          <p class="f-lead">இந்த Stage விரைவில் app இல் வரும். அதுவரை வகுப்பில் செய்.</p>
        </div>
      ) : (
        <>
          {!w.open && <p class="f-note lock">இந்த Stage பூட்டப்பட்டுள்ளது: முன்னுள்ள Stage ஐ முடி, அல்லது வகுப்பில் கேள்.</p>}
          {w.open && !w.phone && <p class="f-note">இந்த Stage விரைவில் phone இல்: இப்போது தாளை வகுப்பில் கொடு.</p>}
          {stop && canPlay && playIdx >= 0 && (
            // Why the next level stays shut (his report, 4 Nov 2026: "not showing the reason"): said where he looks.
            <button type="button" class="f-note f-stopnote" onClick={() => {
              buzz();
              props.onPhotos(stop);
            }}>
              <Icon name="camera" size={18} />
              <span>
                Level {w.levels[playIdx].d ?? w.levels[playIdx].n} திறக்க, முதலில் Stage {stop.no} · Level {stop.n} இன் <b>{stop.owed} படங்களை</b> அனுப்பு.
              </span>
              <b class="f-stopgo">அனுப்பு →</b>
            </button>
          )}
          <div class="f-roadbox lv" style={{ height: `${height}px` }}>
            <Road pts={[...pts, cup]} height={height} reached={reached} />
            {w.levels.map((l, i) => {
              const live = l.s === "play" && canPlay;
              const pct = l.got !== undefined && l.max ? l.got / l.max : 0;
              return (
                <div key={l.n} class={`f-lvwrap ${pts[i].x < 50 ? "r" : "l"}`} style={{ left: `${pts[i].x}%`, top: `${pts[i].y}px` }}>
                  {live && (
                    <span class="f-start" aria-hidden="true">
                      {stop ? "📷" : "START"}
                    </span>
                  )}
                  <button
                    type="button"
                    class={`f-lv s-${l.s}${live ? " play" : ""}${w.open ? "" : " shut"}${pct >= 1 ? " full" : ""}`}
                    aria-label={`Level ${l.d ?? l.n}: ${live ? (stop ? "photos first" : "START") : STATE_WORDS[l.s]}${l.ph ? `, ${l.ph} photos to send` : ""}`}
                    onClick={() => tap(l)}
                  >
                    {live && <span class="f-node-ring" aria-hidden="true" />}
                    <span class="f-node-c">
                      {l.s === "later" ? <Icon name="lock" size={20} /> : l.s === "pre" ? <Icon name="check" size={24} /> : <b>{l.d ?? l.n}</b>}
                    </span>
                    {l.s === "check" && !l.ph && (
                      <i class="f-lv-tag home" title="phone இல் சரிபார்த்தது">
                        <Icon name="home" size={12} />
                      </i>
                    )}
                    {!!l.ph && (
                      <i class="f-lv-tag cam" title={`${l.ph} படங்கள் அனுப்ப வேண்டும்`}>
                        <Icon name="camera" size={12} />
                        {l.ph}
                      </i>
                    )}
                    {!!l.nw && <i class="f-lv-dot" title="ஆசிரியரின் பதில்" />}
                    {live && stop && (
                      <i class="f-lv-tag stop" title="படங்கள் முதலில்">
                        <Icon name="lock" size={12} />
                      </i>
                    )}
                    {l.s === "class" && (
                      <i class="f-lv-tag wait" title="ஆசிரியரிடம்">
                        <Icon name="clock" size={12} />
                      </i>
                    )}
                  </button>
                  {l.got !== undefined && (
                    <small class="f-lv-xp">
                      {l.got}/{l.max}
                    </small>
                  )}
                </div>
              );
            })}
            <span class={`f-chest${w.allDone ? " won" : ""}`} style={{ left: `${cup.x}%`, top: `${cup.y}px` }}>
              <Icon name="trophy" size={24} />
            </span>
          </div>
          {w.allDone && props.onCert && (
            <div class="f-pad-x f-stage-cert">
              <button type="button" class="f-btn gold big" onClick={props.onCert}>
                <Icon name="award" size={20} /> Certificate
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
