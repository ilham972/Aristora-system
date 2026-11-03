// A Level: one question at a time, his own pad, Check once; then the reveal.
// - The phone never has the answers: the server marks (convex/family.ts check).
// - Two ways to do it (his voice note, 3 Nov 2026): with his paper in hand he types only the answers; without it (a new
//   student who has no workbook yet) the switch at the top shows each question as printed above its boxes. The
//   switch is kept per child; pale when the World's questions are not in the app yet.

import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { FamilyLevel, FamilyMe, FamilyQuestions, FamilyResult } from "../../convex/family";
import type { Trophy, World } from "../../convex/lib/family";
import type { Box } from "../../convex/lib/phone";
import { drawQuestion } from "../questionView";
import { keep, mutation, NetError, query } from "./net";
import { buzz, sound } from "./sound";
import { Icon, Lamp, Medal, Owl, pretty, problemWords, Spark, toast, useCount, Waiting } from "./ui";

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

const NUM_KEYS = ["7", "8", "9", "⌫", "4", "5", "6", "/", "1", "2", "3", "-", ".", "0", " ", "→"];
const exprKeys = (v: string) => ["7", "8", "9", "⌫", "4", "5", "6", v, "1", "2", "3", "+", "0", "(", ")", "-", "*", "/", "^2", "→"];
const KEY_LABEL: Record<string, string> = { "-": "−", "*": "×", "^2": "x²", " ": "␣", "⌫": "⌫", "→": "→" };

function Pad(props: { box: Box | null; onKey: (k: string) => void; last: boolean }) {
  const keys = props.box?.k === "expr" ? exprKeys(props.box.v) : NUM_KEYS;
  return (
    <div class={`f-padkeys${props.box?.k === "expr" ? " x" : ""}`} role="group" aria-label="Keys">
      {keys.map((k) => (
        <button
          type="button"
          key={k}
          class={`f-key${k === "→" ? " next" : ""}${k === "⌫" ? " del" : ""}${/^\d$/.test(k) ? "" : " op"}`}
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

/** Each World's book style, once per visit (it is large; a level's questions are kept with it for no signal). */
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
  const [form, setForm] = useState<FamilyLevel | null>(() => keep<FamilyLevel>(formKey));
  const [typed, setTyped] = useState<Record<number, string[]>>(() => keep<Record<number, string[]>>(draftKey) ?? {});
  const [at, setAt] = useState<Spot>({ qi: 0, bi: 0 });
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [qOn, setQOn] = useState<boolean>(() => !!keep<boolean>("qmode"));
  const showQ = qOn && props.world.q;
  const qs = useQuestions(props.world, props.n, showQ);
  const strip = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);

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
  useEffect(() => {
    strip.current?.querySelector(".on")?.scrollIntoView({ block: "nearest", inline: "center" });
    if (showQ) card.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [at.qi]);

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
    if (!box) return;
    const cur = val(at.qi, at.bi);
    if (k === "⌫") return set(at.qi, at.bi, cur.endsWith("^2") ? cur.slice(0, -2) : cur.slice(0, -1));
    if (cur.length >= 30) return;
    set(at.qi, at.bi, cur + k);
  };
  const flipQ = () => {
    buzz();
    if (!props.world.q) return toast("இந்த World இன் கேள்விகள் விரைவில் phone இல் வரும்.");
    keep("qmode", !qOn);
    setQOn(!qOn);
  };
  const empty = all.filter((x) => !val(x.qi, x.bi).trim()).length;
  const teacherQs = form.qs.filter((x) => x.parts.some((p) => !p.boxes)).length;

  const check = async () => {
    setBusy(true);
    try {
      const res = (await mutation("family:check", {
        unitId: form.unitId,
        n: form.n,
        typed: form.qs.map((x) => ({ q: x.q, a: (typed[x.q] ?? []).map((s) => s.trim()) })),
      })) as Checked;
      keep(draftKey, null);
      keep(formKey, null);
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
    <div class={`f-play${showQ ? " withq" : ""}`}>
      <header class="f-top play">
        <button type="button" class="f-icon" aria-label="Back" onClick={props.onBack}>
          <Icon name="close" />
        </button>
        <b class="f-title">
          <small>World {form.no}</small> Level {form.n}
        </b>
        <span class="f-sp" />
        <button
          type="button"
          class={`f-qmode${showQ ? " on" : ""}${props.world.q ? "" : " pale"}`}
          aria-pressed={showQ}
          aria-label="கேள்விகளைக் காட்டு · Show the questions"
          onClick={flipQ}
        >
          <Icon name="eye" size={17} />
          <span class="f-knob" aria-hidden="true" />
        </button>
        <button type="button" class="f-btn small go" onClick={() => setReview(true)}>
          சரிபார்
        </button>
      </header>
      <div class="f-prog" aria-hidden="true">
        <i style={{ width: `${Math.round(((all.length - empty) / Math.max(1, all.length)) * 100)}%` }} />
      </div>
      <div class="f-strip" ref={strip}>
        {form.qs.map((x, qi) => (
          <button
            type="button"
            key={x.q}
            class={`f-qchip ${filled(qi)}${qi === at.qi && !review ? " on" : ""}`}
            onClick={() => {
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
          <Owl class="mid" />
          <h2 class="f-h2">Level {form.n} சரிபார்க்கவா?</h2>
          <ul class="f-sum">
            <li>
              <b>{all.length - empty}</b> விடைகள் போட்டாய்
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
          <p class="f-muted small">சரிபார்த்த பின் மாற்ற முடியாது. · After Check you can't change them.</p>
          <button type="button" class="f-btn go big" disabled={busy} onClick={() => void check()}>
            {busy ? "…" : "சரிபார் ✓"}
          </button>
          <button type="button" class="f-btn ghost" onClick={() => setReview(false)}>
            இன்னும் பார்க்க
          </button>
        </section>
      ) : (
        <section class="f-card rise" key={q.q} ref={card}>
          <div class="f-qhead">
            <b class="f-qn">Q{q.q}</b>
            <small>
              <Spark size={14} /> {q.max} XP
            </small>
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
                        <button
                          type="button"
                          key={i}
                          class={`f-box${at.bi === i ? " on" : ""}${b.k === "expr" ? " x" : ""}`}
                          onClick={() => setAt({ qi: at.qi, bi: i })}
                          aria-label={`${b.l ?? ""} answer ${i + 1}`}
                        >
                          {b.l && <span class="f-blabel">{pretty(b.l)}</span>}
                          <span class={v ? "f-bval" : "f-bval empty"}>{v ? pretty(v) : "?"}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p class="f-teach">✍ இதை உன் ஆசிரியர் திருத்துவார்</p>
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
      <Owl class="mid" />
      <p class="f-lead">{props.text}</p>
      <button type="button" class="f-btn go" onClick={props.onBack}>
        பின் செல்
      </button>
    </div>
  );
}

// ---- The reveal ----

/** The level to play now: in his World now first, else the first open World the phone can mark. */
export function nextPlay(me: FamilyMe | null): { world: World; n: number } | null {
  if (!me) return null;
  const ws = [...me.worlds].sort((a, b) => Number(b.now) - Number(a.now));
  for (const w of ws) {
    const l = w.open && w.phone ? w.levels.find((x) => x.s === "play") : undefined;
    if (l) return { world: w, n: l.n };
  }
  return null;
}

/** Sparks flying out behind the owl: more for a better level. */
function Burst(props: { n: number }) {
  return (
    <span class="f-burst" aria-hidden="true">
      {Array.from({ length: props.n }, (_, i) => (
        <i key={i} style={{ "--a": `${(360 / props.n) * i + (i % 2) * 9}deg`, "--d": `${92 + (i % 3) * 26}px`, "--t": `${(i % 4) * 70}ms` }} />
      ))}
    </span>
  );
}

export function Result(props: {
  world: World;
  form: FamilyLevel;
  res: Checked;
  typed: Record<number, string[]>;
  before: Trophy[];
  me: FamilyMe | null;
  onHome: () => void;
  onNext: (w: World, n: number) => void;
}) {
  const { res, form } = props;
  const pct = res.phoneMax ? res.got / res.phoneMax : 0;
  const shown = useCount(res.got);
  const fresh = (res.trophies ?? []).filter((t) => !props.before.includes(t));
  useEffect(() => {
    sound(fresh.length > 0 ? "trophy" : pct >= 0.9 ? "star" : "level");
  }, []);
  const cheer = pct >= 0.9 ? "அருமை!" : pct >= 0.7 ? "நன்று!" : pct >= 0.5 ? "நல்ல முயற்சி!" : "முயற்சி தொடரட்டும்!";
  const next = nextPlay(props.me);
  const nextHere = next && next.world.unitId === props.world.unitId && next.n !== form.n ? next : null;
  return (
    <div class="f-result">
      <header class="f-top play">
        <b class="f-title">
          <small>World {form.no}</small> Level {form.n}
        </b>
      </header>
      <main class="f-main">
        <section class={`f-score rise${pct >= 0.7 ? " glow" : ""}`}>
          {pct >= 0.5 && <Burst n={pct >= 0.9 ? 16 : 10} />}
          <Owl class="big" />
          <h1 class="f-cheer">{cheer}</h1>
          <p class="f-big">
            <b>{shown}</b>
            <small> / {res.phoneMax}</small>
          </p>
          <p class="f-gain">
            <span class="f-pill xp">
              <Spark size={16} /> +{res.got} XP
            </span>
            <span class={`f-pill lamp${res.streak.today ? " lit" : ""}`}>
              <Lamp lit={res.streak.today} size={16} /> {res.streak.days} நாள்
            </span>
          </p>
          {res.teacher.length > 0 && <p class="f-teach">✍ {res.teacher.map((q) => `Q${q}`).join(", ")}: ஆசிரியர் திருத்துவார்</p>}
        </section>
        {fresh.length > 0 && (
          <section class="f-newcup rise">
            <h2>புதிய கோப்பை!</h2>
            <div class="f-medals">
              {fresh.map((t) => (
                <Medal key={t} t={t} won fresh />
              ))}
            </div>
          </section>
        )}
        <p class="f-tip">✎ உன் தாளில் ✓ ✗ போடு. தவறியவற்றை வகுப்பில் விளக்குவார்கள்.</p>
        <ul class="f-res">
          {res.results.map((r, i) => {
            const fq = form.qs.find((x) => x.q === r.q);
            const whole = r.got !== null;
            const ok = whole && r.got === r.max;
            return (
              <li key={r.q} class={`f-rrow rise ${!whole ? "teach" : ok ? "ok" : r.got! > 0 ? "part" : "bad"}`} style={{ animationDelay: `${120 + i * 60}ms` }}>
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
                <small class="f-rgot">{whole ? `${r.got}/${r.max}` : `${r.phoneGot} + ✍`}</small>
              </li>
            );
          })}
        </ul>
        <div class="f-actions">
          {nextHere && (
            <button type="button" class="f-btn go big" onClick={() => props.onNext(nextHere.world, nextHere.n)}>
              அடுத்த Level {nextHere.n} ▶
            </button>
          )}
          <button type="button" class={`f-btn ${nextHere ? "ghost" : "go big"}`} onClick={props.onHome}>
            <Icon name="map" size={20} /> வரைபடம்
          </button>
        </div>
      </main>
    </div>
  );
}
