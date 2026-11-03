// A Level: one question at a time, his own pad, Check once; then the reveal.
// - The phone never has the answers: the server marks (convex/family.ts check).
// - Two ways to do it (his voice note, 3 Nov 2026): with his paper in hand he types only the answers; without it (a new
//   student who has no workbook yet) the eye at the top shows each question as printed above its boxes. The switch is
//   kept per child; pale when the Stage's questions are not in the app yet.
// - The reveal: his answers come back one question at a time, a bell for each right one that climbs higher with every
//   one in a row, then the score, the XP, the flame, a trophy if he won one. A tap shows everything at once.
// - A question only the teacher marks has no box: "do it on paper", the pad pale, → goes on (4 Nov 2026: a student
//   tapped the pad there and nothing happened). A level opens again on the question he left (kept per level).

import { Fragment } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { FamilyLevel, FamilyMe, FamilyQuestions, FamilyResult } from "../../convex/family";
import type { Trophy, World } from "../../convex/lib/family";
import type { Box } from "../../convex/lib/phone";
import { drawQuestion } from "../questionView";
import { keep, mutation, NetError, query } from "./net";
import { buzz, sound } from "./sound";
import { Flame, Gem, Icon, Medal, Owl, OwlBadge, pretty, problemWords, Roll, Tag, toast, useOwlTap, Waiting, type Mood } from "./ui";

export type Checked = {
  results: FamilyResult[];
  got: number;
  phoneMax: number;
  max: number;
  teacher: number[];
  xp: number;
  streak: { days: number; today: boolean };
  trophies: Trophy[];
};

type Spot = { qi: number; bi: number };

/** Every box of the level in order: question index, box index within its question, the box. */
function boxesOf(form: FamilyLevel): { qi: number; bi: number; box: Box }[] {
  const out: { qi: number; bi: number; box: Box }[] = [];
  form.qs.forEach((q, qi) => {
    let bi = 0;
    for (const p of q.parts) for (const b of p.boxes ?? []) out.push({ qi, bi: bi++, box: b });
  });
  return out;
}

/**
 * Where to open a level: the kept place if it still fits the level, else its first box. A level begun before places were
 * kept (`typed` given): the first box he hasn't filled.
 */
export function spotIn(form: FamilyLevel, at: Spot, typed: Record<number, string[]> | null): Spot {
  const all = boxesOf(form);
  if (typed && Object.keys(typed).length) {
    const gap = all.find((x) => !(typed[form.qs[x.qi].q]?.[x.bi] ?? "").trim());
    if (gap) return { qi: gap.qi, bi: gap.bi };
  }
  if (at.qi < 0 || at.qi >= form.qs.length) return { qi: 0, bi: 0 };
  const n = all.filter((x) => x.qi === at.qi).length;
  return at.bi < 0 || (at.bi > 0 && at.bi >= n) ? { qi: at.qi, bi: 0 } : at;
}

const NUM_KEYS = ["7", "8", "9", "⌫", "4", "5", "6", "/", "1", "2", "3", "-", ".", "0", " ", "→"];
const exprKeys = (v: string) => ["7", "8", "9", "⌫", "4", "5", "6", v, "1", "2", "3", "+", "0", "(", ")", "-", "*", "/", "^2", "→"];
const KEY_LABEL: Record<string, string> = { "-": "−", "*": "×", "^2": "x²", " ": "␣", "⌫": "⌫", "→": "→" };

/** His pad. On a question with no box (the teacher's) only → works: the other keys are pale. */
function Pad(props: { box: Box | null; onKey: (k: string) => void; last: boolean }) {
  const keys = props.box?.k === "expr" ? exprKeys(props.box.v) : NUM_KEYS;
  return (
    <div class={`f-padkeys${props.box?.k === "expr" ? " x" : ""}`} role="group" aria-label="Keys">
      {keys.map((k) => (
        <button
          type="button"
          key={k}
          aria-disabled={!props.box && k !== "→" ? "true" : undefined}
          class={`f-key${k === "→" ? " next" : ""}${k === "⌫" ? " del" : ""}${/^\d$/.test(k) ? "" : " op"}${!props.box && k !== "→" ? " f-keyoff" : ""}`}
          aria-label={k === "→" ? (props.last ? "Done" : "Next") : k === "⌫" ? "Delete" : k === " " ? "Space" : k === "^2" ? "squared" : k}
          onClick={() => props.onKey(k)}
        >
          {k === "^2" && props.box?.k === "expr" ? `${props.box.v}²` : (KEY_LABEL[k] ?? k)}
        </button>
      ))}
    </div>
  );
}

// ---- The questions as printed ----

/** Each Stage's book style, once per visit (it is large; a level's questions are kept with it for no signal). */
const cssOf = new Map<string, string>();

function useQuestions(world: World, n: number, on: boolean): { got: FamilyQuestions | null; failed: boolean } {
  const key = `qs.${world.unitId}.${n}`;
  const [got, setGot] = useState<FamilyQuestions | null>(() => keep<FamilyQuestions>(key));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!on || !world.q) return;
    let gone = false;
    const known = cssOf.get(world.unitId) ?? got?.css ?? null;
    query("family:questions", { unitId: world.unitId, n, css: known === null })
      .then((r) => {
        if (gone) return;
        const x = r as FamilyQuestions;
        const css = x.css ?? known;
        if (css) cssOf.set(world.unitId, css);
        const full = { css, qs: x.qs };
        keep(key, full);
        setGot(full);
      })
      .catch(() => {
        if (!gone && !got) setFailed(true);
      });
    return () => {
      gone = true;
    };
  }, [on, world.unitId, n]);
  return { got, failed };
}

/** The app's paper on the book's page: rounded, a little air (after the book's own rules). */
const PAPER_CSS = ".qv { border-radius: 14px; padding: 12px 10px 8px; }";

function Paper(props: { html: string; css: string; q: number }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    return drawQuestion(host.current, props.html, props.css, PAPER_CSS);
  }, [props.html, props.css]);
  return <div class="f-paper rise" ref={host} aria-label={`Q${props.q}`} />;
}

// ---- A level ----

export function Play(props: {
  world: World;
  n: number;
  onBack: () => void;
  onChecked: (f: FamilyLevel, r: Checked, typed: Record<number, string[]>) => void;
}) {
  const formKey = `form.${props.world.unitId}.${props.n}`;
  const draftKey = `draft.${props.world.unitId}.${props.n}`;
  const spotKey = `spot.${props.world.unitId}.${props.n}`;
  const [form, setForm] = useState<FamilyLevel | null>(() => keep<FamilyLevel>(formKey));
  const [typed, setTyped] = useState<Record<number, string[]>>(() => keep<Record<number, string[]>>(draftKey) ?? {});
  // The question he left (his ask, 4 Nov 2026: "exactly that question want to focus and continue from that").
  const [kept] = useState(() => keep<Spot>(spotKey));
  const [at, setAt] = useState<Spot>(() => kept ?? { qi: 0, bi: 0 });
  const placed = useRef(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [qOn, setQOn] = useState<boolean>(() => !!keep<boolean>("qmode"));
  const showQ = qOn && props.world.q;
  const qs = useQuestions(props.world, props.n, showQ);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    query("family:level", { unitId: props.world.unitId, n: props.n })
      .then((f) => {
        keep(formKey, f as FamilyLevel);
        setForm(f as FamilyLevel);
      })
      .catch((e) => {
        if (!form) setErr(problemWords(e));
      });
  }, [props.world.unitId, props.n]);
  // A new question (his report, 4 Nov 2026: after → the screen jumped up and came back down). Only the strip moves,
  // sideways, to his chip: scrollIntoView moved the page too (up to the strip, then the card's smooth scroll back
  // down). A new question is a new page: if he had scrolled down (a tall printed question), it starts at the top,
  // set before the screen is drawn, so the only motion is the page sliding in from the side. (Its printed question
  // is drawn a frame later: for that frame the page is shorter and the browser had already moved it part-way.)
  const placedRow = useRef(false);
  useLayoutEffect(() => {
    const row = strip.current;
    const chip = row?.querySelector<HTMLElement>(".f-qchip.on");
    if (!row || !chip) return;
    const r = chip.getBoundingClientRect();
    const s = row.getBoundingClientRect();
    row.scrollTo({ left: row.scrollLeft + r.left - s.left - (s.width - r.width) / 2, behavior: placedRow.current && !instant() ? "smooth" : "auto" });
    if (placedRow.current && window.scrollY > 0) window.scrollTo(0, 0);
    placedRow.current = true;
  }, [at.qi, !!form]);
  // The review after his last → is a new page too.
  useLayoutEffect(() => {
    if (review && window.scrollY > 0) window.scrollTo(0, 0);
  }, [review]);
  // His place on this level: checked against the level when it comes (it may have changed), then kept as he moves.
  useEffect(() => {
    if (!form) return;
    const fit = spotIn(form, at, kept || placed.current ? null : typed);
    placed.current = true;
    if (fit.qi !== at.qi || fit.bi !== at.bi) setAt(fit);
  }, [form]);
  useEffect(() => {
    if (form) keep(spotKey, at);
  }, [at.qi, at.bi, !!form]);

  const all = useMemo(() => (form ? boxesOf(form) : []), [form]);
  if (err) return <Oops text={err} onBack={props.onBack} />;
  if (!form) return <Waiting />;

  const q = form.qs[at.qi];
  const flat = all.findIndex((x) => x.qi === at.qi && x.bi === at.bi);
  const box = flat >= 0 ? all[flat].box : null;
  const val = (qi: number, bi: number) => typed[form.qs[qi].q]?.[bi] ?? "";
  const set = (qi: number, bi: number, s: string) => {
    const qn = form.qs[qi].q;
    const arr = [...(typed[qn] ?? [])];
    arr[bi] = s;
    const next = { ...typed, [qn]: arr };
    setTyped(next);
    keep(draftKey, next);
  };
  const boxesIn = (qi: number) => all.filter((x) => x.qi === qi).length;
  const filled = (qi: number) => {
    const n = boxesIn(qi);
    let f = 0;
    for (let i = 0; i < n; i++) if (val(qi, i).trim()) f++;
    return n === 0 ? "teacher" : f === n ? "full" : f > 0 ? "part" : "empty";
  };
  const goNext = () => {
    if (flat >= 0 && flat + 1 < all.length && all[flat + 1].qi === at.qi) return setAt({ qi: at.qi, bi: at.bi + 1 });
    if (at.qi + 1 < form.qs.length) return setAt({ qi: at.qi + 1, bi: 0 });
    setReview(true);
  };
  const onKey = (k: string) => {
    buzz(6);
    sound("key");
    if (k === "→") return goNext();
    if (!box) return toast("இதைத் தாளில் செய்: உன் ஆசிரியர் வகுப்பில் திருத்துவார். → அடுத்த கேள்வி.");
    const cur = val(at.qi, at.bi);
    if (k === "⌫") return set(at.qi, at.bi, cur.endsWith("^2") ? cur.slice(0, -2) : cur.slice(0, -1));
    if (cur.length >= 30) return;
    set(at.qi, at.bi, cur + k);
  };
  const flipQ = () => {
    buzz();
    if (!props.world.q) return toast("இந்த Stage இன் கேள்விகள் விரைவில் phone இல் வரும்.");
    sound("tap");
    keep("qmode", !qOn);
    setQOn(!qOn);
  };
  const empty = all.filter((x) => !val(x.qi, x.bi).trim()).length;
  const done = all.length - empty;
  const teacherQs = form.qs.filter((x) => x.parts.some((p) => !p.boxes)).length;

  const check = async () => {
    setBusy(true);
    try {
      const res = (await mutation("family:check", {
        unitId: form.unitId,
        n: form.n,
        // A box he skipped is a gap in his list (or null, kept on the phone): it goes as "" (the server's ✗).
        typed: form.qs.map((x) => ({ q: x.q, a: Array.from(typed[x.q] ?? [], (s) => (s ?? "").trim()) })),
      })) as Checked;
      keep(draftKey, null);
      keep(formKey, null);
      keep(spotKey, null);
      keep(`qs.${form.unitId}.${form.n}`, null);
      props.onChecked(form, res, typed);
    } catch (e) {
      toast(e instanceof NetError && e.offline ? "இணையம் இல்லை. உன் விடைகள் இந்த phone இல் உள்ளன: இணையம் வந்ததும் மீண்டும் அழுத்து." : problemWords(e), true);
    } finally {
      setBusy(false);
    }
  };

  const printed = showQ ? qs.got?.qs.find((x) => x.q === q.q) : undefined;
  const css = qs.got?.css ?? null;
  let bi = 0;
  return (
    <div class={`f-play${showQ ? " withq" : ""}${review ? " rev" : ""}${box?.k === "expr" ? " xpad" : ""}`}>
      <header class="f-ptop">
        <button type="button" class="f-round" aria-label="Back" onClick={props.onBack}>
          <Icon name="close" size={20} />
        </button>
        <div class={`f-pbar${all.length > 0 && done === all.length ? " full" : ""}`} aria-label={`${done} of ${all.length} answered`}>
          <i style={{ width: `${Math.round((done / Math.max(1, all.length)) * 100)}%` }}>{done > 0 && <b key={done} />}</i>
          <span class="f-ptag">
            {done}/{all.length}
          </span>
        </div>
        <button
          type="button"
          class={`f-qmode${showQ ? " on" : ""}${props.world.q ? "" : " pale"}`}
          aria-pressed={showQ}
          aria-label="Show the questions"
          onClick={flipQ}
        >
          <Icon name="eye" size={16} />
          <span class="f-knob" aria-hidden="true" />
        </button>
      </header>
      <div class="f-prow">
        <p class="f-kicker">
          Stage {form.no} · Level {form.n}
        </p>
        <button type="button" class="f-checkpill" onClick={() => setReview(true)}>
          Check
        </button>
      </div>
      <div class="f-strip" ref={strip}>
        {form.qs.map((x, qi) => (
          <button
            type="button"
            key={x.q}
            class={`f-qchip ${filled(qi)}${qi === at.qi && !review ? " on" : ""}`}
            onClick={() => {
              buzz();
              setReview(false);
              setAt({ qi, bi: 0 });
            }}
          >
            {x.q}
          </button>
        ))}
      </div>

      {review ? (
        <section class="f-card rise f-review">
          <OwlBadge mood="think" class="mid" />
          <h2 class="f-h2">Level {form.n} சரிபார்க்கவா?</h2>
          <ul class="f-sum">
            <li>
              <b>{done}</b> விடைகள் போட்டாய்
            </li>
            {empty > 0 && (
              <li class="warn">
                <b>{empty}</b> காலியாக உள்ளன (அவை ✗)
              </li>
            )}
            {teacherQs > 0 && (
              <li class="teach">
                <b>{teacherQs}</b> கேள்விகளை ஆசிரியர் திருத்துவார் ✍
              </li>
            )}
          </ul>
          <p class="f-muted small">Check செய்த பின் விடைகளை மாற்ற முடியாது.</p>
          <button type="button" class="f-btn gold big shine" disabled={busy} onClick={() => void check()}>
            {busy ? "…" : "Check ✓"}
          </button>
          <button type="button" class="f-btn ghost" onClick={() => setReview(false)}>
            Look again
          </button>
        </section>
      ) : (
        <section class="f-card f-qcard slide" key={q.q}>
          <div class="f-qhead">
            <b class="f-qn">Q{q.q}</b>
            <span class="f-xpchip">
              <Gem size={15} /> {q.max} XP
            </span>
          </div>
          {showQ &&
            (printed && css !== null ? (
              <Paper html={printed.html} css={css} q={q.q} />
            ) : (
              <p class="f-paper-note">
                {qs.failed ? "இணையம் இல்லை: கேள்வியைக் கொண்டுவர முடியவில்லை." : qs.got ? "இந்தக் கேள்வி இன்னும் phone இல் இல்லை." : "கேள்வி வருகிறது…"}
              </p>
            ))}
          {q.parts.map((p, pi) => {
            if (p.boxes && p.boxes.length === 0) return null;
            return (
              <div class="f-part" key={pi}>
                {p.p && <span class="f-plabel">({p.p})</span>}
                {p.boxes ? (
                  <div class="f-boxes">
                    {p.boxes.map((b) => {
                      const i = bi++;
                      const v = val(at.qi, i);
                      return (
                        <Fragment key={i}>
                          {b.j && (
                            <span class="f-bjoin" aria-hidden="true">
                              {b.j}
                            </span>
                          )}
                          <button
                            type="button"
                            class={`f-box${at.bi === i ? " on" : ""}${b.k === "expr" ? " x" : ""}${v ? " has" : ""}`}
                            onClick={() => setAt({ qi: at.qi, bi: i })}
                            aria-label={`${b.l ?? ""} answer ${i + 1}${b.u ? ` (${b.u})` : ""}`}
                          >
                            {b.l && <span class="f-blabel">{pretty(b.l)}</span>}
                            <span class="f-bline">
                              <span key={at.bi === i ? v.length : 0} class={v ? `f-bval${at.bi === i ? " typed" : ""}` : "f-bval empty"}>
                                {v ? pretty(v) : "?"}
                              </span>
                              {b.u && <span class="f-bunit">{b.u}</span>}
                            </span>
                          </button>
                        </Fragment>
                      );
                    })}
                  </div>
                ) : (
                  <p class="f-teach">
                    <Icon name="pen" size={16} /> இதைத் தாளில் செய்: உன் ஆசிரியர் வகுப்பில் திருத்துவார்
                  </p>
                )}
              </div>
            );
          })}
        </section>
      )}

      {!review && <Pad box={box} onKey={onKey} last={flat === all.length - 1} />}
    </div>
  );
}

function Oops(props: { text: string; onBack: () => void }) {
  return (
    <div class="f-center f-pad">
      <Owl mood="dizzy" class="mid" />
      <p class="f-lead">{props.text}</p>
      <button type="button" class="f-btn go" onClick={props.onBack}>
        Back
      </button>
    </div>
  );
}

// ---- The reveal ----

/**
 * The level to play now: in his Stage now first, then in the newest book the teachers gave him (4 Nov 2026, his words:
 * "the unit I taught lastly"), else the first open Stage the phone can mark, in the map's order.
 */
export function nextPlay(me: FamilyMe | null): { world: World; n: number } | null {
  if (!me) return null;
  const ws = [...me.worlds].sort((a, b) => Number(b.now) - Number(a.now) || (b.given ?? 0) - (a.given ?? 0));
  for (const w of ws) {
    const l = w.book && w.open && w.phone ? w.levels.find((x) => x.s === "play") : undefined;
    if (l) return { world: w, n: l.n };
  }
  return null;
}

type RowKind = "ok" | "part" | "bad" | "teach";
const kindOf = (r: FamilyResult): RowKind => (r.got === null ? "teach" : r.got === r.max ? "ok" : r.got > 0 ? "part" : "bad");

/** No waiting in tests or for "reduce motion": everything at once. */
const instant = () =>
  (typeof navigator !== "undefined" && navigator.webdriver === true) ||
  (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);

/** The score ring round the owl: its radius and length. */
const RING_R = 54;
const RING_C = Math.round(2 * Math.PI * RING_R * 100) / 100;

/** Confetti from behind the owl: more for a better level. */
function Confetti(props: { n: number }) {
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

export function Result(props: {
  world: World;
  form: FamilyLevel;
  res: Checked;
  typed: Record<number, string[]>;
  /** Before this level: his trophies and his streak. */
  before: { trophies: Trophy[]; days: number; today: boolean; best: number };
  me: FamilyMe | null;
  onStage: () => void;
  onNext: (n: number) => void;
}) {
  const { res, form, before } = props;
  const rows = res.results;
  const [shown, setShown] = useState(() => (instant() ? rows.length : 0));
  const done = shown >= rows.length;
  const pct = res.phoneMax ? res.got / res.phoneMax : 0;
  const fresh = (res.trophies ?? []).filter((t) => !before.trophies.includes(t));
  const lit = !before.today && res.streak.today;
  const best = res.streak.days > before.best && res.streak.days > 1;

  // Each answer's run of right ones (a question the teacher marks keeps the run going).
  const runs = useMemo(() => {
    let run = 0;
    return rows.map((r) => {
      const k = kindOf(r);
      if (k === "ok") run++;
      else if (k !== "teach") run = 0;
      return run;
    });
  }, [rows]);
  const topRun = Math.max(0, ...runs);
  const runNow = shown > 0 ? runs[shown - 1] : 0;
  const score = rows.slice(0, shown).reduce((s, r) => s + (r.got ?? 0), 0);

  // One answer at a time, each with its sound; then the finale.
  useEffect(() => {
    if (done) return;
    const t = window.setTimeout(
      () => {
        const r = rows[shown];
        const k = kindOf(r);
        if (k === "ok") sound("right", runs[shown] - 1);
        else if (k === "bad") sound("wrong");
        else sound("pop");
        if (k === "ok") buzz(6);
        setShown(shown + 1);
      },
      shown === 0 ? 700 : 380,
    );
    return () => window.clearTimeout(t);
  }, [shown]);
  useEffect(() => {
    if (!done) return;
    const ts: number[] = [];
    const later = (ms: number, f: () => void) => ts.push(window.setTimeout(f, ms));
    later(instant() ? 0 : 250, () => sound(pct >= 1 ? "perfect" : "level"));
    let at = 1300;
    if (fresh.length) {
      later(at, () => sound("trophy"));
      at += 1300;
    }
    if (lit) later(at, () => sound("streak"));
    return () => ts.forEach((x) => window.clearTimeout(x));
  }, [done]);

  // The owl's words (Tamil: its voice), by the score.
  const cheer = pct >= 1 ? "எல்லாம் சரி!" : pct >= 0.9 ? "அருமை!" : pct >= 0.7 ? "நன்று!" : pct >= 0.5 ? "நல்ல முயற்சி!" : "தொடர்ந்து முயற்சி செய்!";
  // The owl acts the score (stars for every mark, a party, a happy hop, a headband to keep going), then flexes a medal
  // when a trophy comes; tap it for more.
  const [medal, setMedal] = useState(false);
  useEffect(() => {
    if (!done || !fresh.length) return;
    const id = window.setTimeout(() => setMedal(true), instant() ? 0 : 1400);
    return () => window.clearTimeout(id);
  }, [done]);
  const mood: Mood = !done ? "think" : medal ? "champ" : pct >= 1 ? "star" : pct >= 0.9 ? "party" : pct >= 0.7 ? "cheer" : "strong";
  const [owlMood, tapOwl] = useOwlTap(mood);
  const next = nextPlay(props.me);
  const nextHere = next && next.world.unitId === props.world.unitId && next.n !== form.n ? next : null;
  // The ring round the owl fills as his marks come in.
  const ringK = res.phoneMax ? (done ? res.got : score) / res.phoneMax : 0;
  return (
    <div class={`f-result${done ? " done" : ""}`} onClick={() => !done && setShown(rows.length)}>
      <p class="f-kicker f-center-t">
        Stage {form.no} · Level {form.n}
      </p>
      <section class={`f-score${done ? " done" : ""}${done && pct >= 0.7 ? " glow" : ""}`}>
        {done && pct >= 0.7 && <Confetti n={pct >= 0.9 ? 18 : 12} />}
        <div class={`f-ring${done && pct >= 1 ? " full" : ""}`}>
          <svg class="f-ring-s" viewBox="0 0 120 120" aria-hidden="true">
            <circle class="f-ring-t" cx="60" cy="60" r={RING_R} />
            <circle class="f-ring-p" cx="60" cy="60" r={RING_R} stroke-dasharray={RING_C} stroke-dashoffset={RING_C * (1 - Math.min(1, ringK))} />
          </svg>
          <span
            class="tap"
            onClick={(e) => {
              if (!done) return;
              e.stopPropagation();
              tapOwl();
            }}
          >
            <Owl mood={owlMood} key={owlMood} />
          </span>
        </div>
        <h1 class="f-cheer" key={done ? "done" : "wait"}>
          {done ? cheer : "பார்ப்போம்…"}
        </h1>
        <p class="f-big">
          <b key={done ? "done" : score} class={score > 0 || done ? "bump" : ""}>
            {done ? res.got : score}
          </b>
          <small> / {res.phoneMax}</small>
        </p>
        <div class="f-runbox">
          {(done ? topRun : runNow) >= 2 && (
            <Tag tone="gold" class="f-run" key={done ? "top" : runNow}>
              {done ? topRun : runNow} in a row!
            </Tag>
          )}
        </div>
        {done ? (
          <p class="f-gain rise">
            <span class="f-pill gem">
              <Gem size={17} /> +{res.got} XP
            </span>
            <span class={`f-pill fire${res.streak.today ? " lit" : ""}${lit ? " pop" : ""}`}>
              <Flame lit={res.streak.today} size={17} /> {res.streak.days} {res.streak.days === 1 ? "day" : "days"}
            </span>
          </p>
        ) : (
          <p class="f-gain wait" aria-hidden="true" />
        )}
        {done && best && (
          <Tag tone="gold" class="f-pb">
            PERSONAL BEST
          </Tag>
        )}
        {res.teacher.length > 0 && (
          <p class="f-teach">
            <Icon name="pen" size={16} /> {res.teacher.map((q) => `Q${q}`).join(", ")}: ஆசிரியர் திருத்துவார்
          </p>
        )}
      </section>
      {done && lit && (
        <section class="f-streakup rise">
          <Flame lit size={44} />
          <div>
            <b>
              <Roll from={before.days} to={res.streak.days} />
              <em>{res.streak.days === 1 ? "day streak" : "days in a row"}</em>
            </b>
            <small>{res.streak.days === 1 ? "தீ மூண்டது! நாளையும் ஒரு Level செய்து இதை வளர்." : "நாளையும் வா: தீ அணையாமல் பார்."}</small>
          </div>
        </section>
      )}
      {done && fresh.length > 0 && (
        <section class="f-newcup rise">
          <h2>NEW TROPHY!</h2>
          <div class="f-medals">
            {fresh.map((t) => (
              <Medal key={t} t={t} won fresh />
            ))}
          </div>
        </section>
      )}
      <ul class="f-res">
        {rows.map((r, i) => {
          const fq = form.qs.find((x) => x.q === r.q);
          const k = kindOf(r);
          return (
            <li key={r.q} class={`f-rrow ${k}${i < shown ? " in" : ""}`}>
              <b class="f-rq">Q{r.q}</b>
              <span class="f-rmarks">
                {r.ok.map((part, pi) =>
                  part === null ? (
                    <i key={pi} class="t">
                      ✍
                    </i>
                  ) : (
                    part.map((g, bi) => (
                      <i
                        key={`${pi}.${bi}`}
                        class={g ? "y" : "n"}
                        title={pretty((props.typed[r.q] ?? [])[fq ? fq.parts.slice(0, pi).reduce((s, p) => s + (p.boxes?.length ?? 0), 0) + bi : bi] ?? "")}
                      >
                        {g ? "✓" : "✗"}
                      </i>
                    ))
                  ),
                )}
              </span>
              <small class="f-rgot">{r.got !== null ? `${r.got}/${r.max}` : `${r.phoneGot} + ✍`}</small>
            </li>
          );
        })}
      </ul>
      {done && (
        <>
          <p class="f-tip rise">✎ உன் தாளிலும் ✓ ✗ போடு. தவறியவற்றை வகுப்பில் விளக்குவார்கள்.</p>
          <div class={`f-actions rise${nextHere ? " two" : ""}`}>
            {nextHere ? (
              <>
                <button type="button" class="f-btn ghost f-act-map" aria-label={`Stage ${form.no}`} onClick={props.onStage}>
                  <Icon name="map" size={22} />
                </button>
                <button type="button" class="f-btn gold big shine" onClick={() => props.onNext(nextHere.n)}>
                  Next: Level {nextHere.n} <Icon name="play" size={16} class="fill" />
                </button>
              </>
            ) : (
              <button type="button" class="f-btn go big" onClick={props.onStage}>
                <Icon name="map" size={19} /> Stage {form.no}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
