// The family app (app.aristora.org): the student does a level in his paper book, types the answers here, taps
// Check once, and sees ✓ and ✗ at once with his XP and streak. The phone never has the answers: the server marks.
// Words: Tamil first, a few game words in English (World, Level, XP). No school words (book, unit, marks).
// Light on purpose: no fonts to download, no client library, one small bundle.

import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { BoardRow, FamilyLevel, FamilyMe, FamilyResult } from "../../convex/family";
import type { World, WorldLevel } from "../../convex/lib/family";
import type { Box } from "../../convex/lib/phone";
import { isSignedOut, join, keep, mutation, NetError, peek, query, randomKey, saveToken, token } from "./net";
import { armSound, buzz, setSoundOn, sound, soundOn } from "./sound";

type Checked = {
  results: FamilyResult[];
  got: number;
  phoneMax: number;
  max: number;
  teacher: number[];
  xp: number;
  streak: { days: number; today: boolean };
};

type Screen =
  | { k: "load" }
  | { k: "join"; code: string }
  | { k: "nolink"; why?: string }
  | { k: "home" }
  | { k: "level"; world: World; n: number }
  | { k: "result"; world: World; form: FamilyLevel; res: Checked; typed: Record<number, string[]> }
  | { k: "board" };

const firstName = (name: string) => name.split(" ")[0];

/** "2n-1" → "2n − 1" for the eye; the typed text stays plain. */
export const pretty = (s: string) =>
  s
    .replace(/\^2/g, "²")
    .replace(/\^3/g, "³")
    .replace(/\*/g, "×")
    .replace(/-/g, "−");

// ---- Toast ----
let toastSet: ((t: { text: string; bad?: boolean } | null) => void) | null = null;
let toastTimer = 0;
function toast(text: string, bad = false) {
  toastSet?.({ text, bad });
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastSet?.(null), 3200);
}
function Toast() {
  const [t, setT] = useState<{ text: string; bad?: boolean } | null>(null);
  toastSet = setT;
  return t ? (
    <div class={`f-toast${t.bad ? " bad" : ""}`} role="status">
      {t.text}
    </div>
  ) : null;
}

function problemWords(e: unknown): string {
  if (e instanceof NetError && e.offline) return "இணையம் இல்லை. பிறகு மீண்டும் முயற்சி செய்.";
  return e instanceof Error ? e.message : String(e);
}

// ---- The app ----
export function App() {
  const [screen, setScreen] = useState<Screen>({ k: "load" });
  const [me, setMe] = useState<FamilyMe | null>(() => keep<FamilyMe>("me"));
  const [offline, setOffline] = useState(false);

  const loadMe = async () => {
    try {
      const m = (await query("family:me")) as FamilyMe;
      keep("me", m);
      setMe(m);
      setOffline(false);
      return m;
    } catch (e) {
      if (isSignedOut(e)) {
        saveToken(null);
        keep("me", null);
        setScreen({ k: "nolink", why: "இந்த phone இலிருந்து வெளியேற்றப்பட்டது." });
      } else if (e instanceof NetError && e.offline) setOffline(true);
      else toast(problemWords(e), true);
      return null;
    }
  };

  useEffect(() => {
    const code = /[#&]join=([A-Za-z0-9_-]+)/.exec(location.hash)?.[1];
    if (code) {
      setScreen({ k: "join", code });
      return;
    }
    if (!token()) {
      setScreen({ k: "nolink" });
      return;
    }
    setScreen({ k: "home" });
    void loadMe();
    // Keeps this phone signed in (once a day is enough).
    const last = keep<number>("hello") ?? 0;
    if (Date.now() - last > 20 * 60 * 60_000) void mutation("family:hello").then(() => keep("hello", Date.now())).catch(() => {});
  }, []);

  // The phone's Back button returns to the home screen.
  useEffect(() => {
    const back = () => setScreen((s) => (s.k === "level" || s.k === "board" || s.k === "result" ? { k: "home" } : s));
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const go = (s: Screen) => {
    if (s.k !== "home" && screen.k === "home") history.pushState({ f: s.k }, "");
    setScreen(s);
    window.scrollTo(0, 0);
  };
  const home = () => {
    if (history.state?.f) history.back();
    else setScreen({ k: "home" });
    void loadMe();
  };

  let body: ComponentChildren;
  if (screen.k === "load") body = <Splash />;
  else if (screen.k === "join") body = <Join code={screen.code} onIn={() => { history.replaceState(null, "", location.pathname); setScreen({ k: "home" }); void loadMe(); }} />;
  else if (screen.k === "nolink") body = <NoLink why={screen.why} />;
  else if (screen.k === "board") body = <Board onBack={home} />;
  else if (screen.k === "level")
    body = (
      <Play
        world={screen.world}
        n={screen.n}
        onBack={home}
        onChecked={(form, res, typed) => {
          setScreen({ k: "result", world: screen.world, form, res, typed });
          window.scrollTo(0, 0);
          void loadMe();
        }}
      />
    );
  else if (screen.k === "result")
    body = (
      <Result
        world={screen.world}
        form={screen.form}
        res={screen.res}
        typed={screen.typed}
        me={me}
        onHome={home}
        onNext={(w, n) => {
          setScreen({ k: "level", world: w, n });
          window.scrollTo(0, 0);
        }}
      />
    );
  else body = <Home me={me} offline={offline} onPlay={(world, n) => go({ k: "level", world, n })} onBoard={() => go({ k: "board" })} />;
  return (
    <div class="f-app" onPointerDown={armSound}>
      {body}
      <Toast />
    </div>
  );
}

function Splash() {
  return (
    <div class="f-center">
      <img class="f-owl big hop" src="/icon.svg" alt="" />
    </div>
  );
}

function NoLink(props: { why?: string }) {
  return (
    <div class="f-center f-pad">
      <img class="f-owl big" src="/icon.svg" alt="ARISTORA" />
      <h1 class="f-h1">ARISTORA</h1>
      {props.why && <p class="f-muted">{props.why}</p>}
      <p class="f-lead">உன் வகுப்பிடம் உனக்கான link ஐக் கேள். அதை இந்த phone இல் திற.</p>
      <p class="f-muted small">Ask the class for your family link, then open it on this phone.</p>
    </div>
  );
}

function Join(props: { code: string; onIn: () => void }) {
  const [state, setState] = useState<{ name: string | null; problem: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    peek(props.code)
      .then(setState)
      .catch((e) => setState({ name: null, problem: problemWords(e) }));
  }, [props.code]);
  const start = async () => {
    setBusy(true);
    const t = randomKey(32);
    try {
      await join(props.code, t);
      saveToken(t);
      keep("me", null);
      sound("level");
      props.onIn();
    } catch (e) {
      setState({ name: null, problem: problemWords(e) });
    } finally {
      setBusy(false);
    }
  };
  if (!state) return <Splash />;
  return (
    <div class="f-center f-pad">
      <img class="f-owl big hop" src="/icon.svg" alt="ARISTORA" />
      {state.name ? (
        <>
          <h1 class="f-h1">வணக்கம், {firstName(state.name)}!</h1>
          <p class="f-lead">ஒவ்வொரு Level ஐயும் உன் தாளில் செய்து முடித்ததும், விடைகளை இங்கே போடு. உடனே ✓ ✗ தெரியும்.</p>
          <p class="f-muted small">Do each Level on paper, then type the answers here: ✓ and ✗ at once.</p>
          <button type="button" class="f-btn go big" disabled={busy} onClick={() => void start()}>
            தொடங்கு
          </button>
        </>
      ) : (
        <>
          <h1 class="f-h1">இந்த link வேலை செய்யவில்லை</h1>
          <p class="f-lead">{state.problem}</p>
        </>
      )}
    </div>
  );
}

// ---- Home: XP, streak, the next level, every World ----

/** The level to play now: in his World now first, else the first open World the phone can mark. */
function nextPlay(me: FamilyMe | null): { world: World; n: number } | null {
  if (!me) return null;
  const ws = [...me.worlds].sort((a, b) => Number(b.now) - Number(a.now));
  for (const w of ws) {
    const l = w.open && w.phone ? w.levels.find((x) => x.s === "play") : undefined;
    if (l) return { world: w, n: l.n };
  }
  return null;
}

function TopBar(props: { me: FamilyMe | null; onBoard?: () => void; offline?: boolean }) {
  const [on, setOn] = useState(soundOn());
  const me = props.me;
  return (
    <header class="f-top">
      <img class="f-owl" src="/icon.svg" alt="ARISTORA" />
      <b class="f-name">{me ? firstName(me.name) : ""}</b>
      {props.offline && <span class="f-off" title="No internet">இணையம் இல்லை</span>}
      <span class="f-sp" />
      <span class={`f-chip flame${me?.streak.today ? " lit" : ""}`} aria-label={`${me?.streak.days ?? 0} day streak`}>
        <i aria-hidden="true">🔥</i>
        {me?.streak.days ?? 0}
      </span>
      <button type="button" class="f-chip xp" onClick={props.onBoard} aria-label={`${me?.xp ?? 0} XP this week`}>
        <i aria-hidden="true">⚡</i>
        {me?.xp ?? 0}
      </button>
      <button
        type="button"
        class="f-icon"
        aria-label={on ? "Sound off" : "Sound on"}
        onClick={() => {
          setSoundOn(!on);
          setOn(!on);
        }}
      >
        {on ? "🔊" : "🔇"}
      </button>
    </header>
  );
}

const STATE_WORDS: Record<WorldLevel["s"], string> = {
  done: "முடிந்தது",
  check: "ஆசிரியர் உன் தாளைப் பார்ப்பார்",
  class: "ஆசிரியரிடம் உள்ளது",
  pre: "app க்கு முன் முடித்தது",
  play: "இப்போது இது",
  later: "முந்தைய Level ஐ முடி",
};

function pctClass(l: WorldLevel): string {
  if (l.got === undefined || !l.max) return "";
  const p = l.got / l.max;
  return p >= 0.75 ? " good" : p >= 0.5 ? " mid" : " low";
}

function Node(props: { w: World; l: WorldLevel; onPlay: () => void }) {
  const { w, l } = props;
  const playable = l.s === "play" && w.open && w.phone;
  const tap = () => {
    buzz();
    if (playable) return props.onPlay();
    if (!w.open) return toast("இந்த World பூட்டப்பட்டுள்ளது. முந்தைய World ஐ முடி.");
    if (l.s === "play") return toast("இந்த World ஐ இன்னும் phone இல் சரிபார்க்க முடியாது. தாளை வகுப்பில் கொடு.");
    toast(`Level ${l.n}: ${l.got !== undefined ? `${l.got} / ${l.max} · ` : ""}${STATE_WORDS[l.s]}`);
  };
  return (
    <button
      type="button"
      class={`f-node s-${l.s}${pctClass(l)}${playable ? " live" : ""}`}
      aria-label={`Level ${l.n}: ${STATE_WORDS[l.s]}`}
      onClick={tap}
    >
      {l.s === "check" ? "⌂" : l.s === "class" ? "⏳" : l.s === "pre" ? "✓" : l.n}
    </button>
  );
}

function WorldCard(props: { w: World; onPlay: (n: number) => void }) {
  const { w } = props;
  const done = w.levels.filter((l) => l.s !== "play" && l.s !== "later").length;
  return (
    <section class={`f-world${w.open ? "" : " locked"}${w.now ? " now" : ""}`} aria-label={`World ${w.no}`}>
      <div class="f-world-h">
        <b class="f-wno">World {w.no}</b>
        <span class="f-wname">{w.ta}</span>
        <small class="f-wdone">
          {w.open ? `${done}/${w.levels.length}` : "🔒"}
        </small>
      </div>
      {!w.phone && w.open && <p class="f-soon">விரைவில் phone இல் · On the phone soon</p>}
      <div class="f-nodes">
        {w.levels.map((l) => (
          <Node key={l.n} w={w} l={l} onPlay={() => props.onPlay(l.n)} />
        ))}
      </div>
    </section>
  );
}

function Home(props: { me: FamilyMe | null; offline: boolean; onPlay: (w: World, n: number) => void; onBoard: () => void }) {
  const me = props.me;
  const next = nextPlay(me);
  const open = me?.worlds.filter((w) => w.open) ?? [];
  const locked = me?.worlds.filter((w) => !w.open) ?? [];
  return (
    <>
      <TopBar me={me} onBoard={props.onBoard} offline={props.offline} />
      <main class="f-main">
        {!me ? (
          <p class="f-muted f-pad">…</p>
        ) : (
          <>
            {next ? (
              <button type="button" class="f-next rise" onClick={() => props.onPlay(next.world, next.n)}>
                <small>அடுத்து · World {next.world.no}</small>
                <b>Level {next.n}</b>
                <span class="f-next-go">விளையாடு ▶</span>
              </button>
            ) : (
              <p class="f-next none rise">இப்போது phone இல் செய்ய Level இல்லை. உன் தாளை வகுப்பில் கொடு.</p>
            )}
            {!me.streak.today && me.streak.days > 0 && (
              <p class="f-keep">🔥 இன்று ஒரு Level செய்தால் {me.streak.days + 1} நாள்!</p>
            )}
            {open.map((w) => (
              <WorldCard key={w.unitId} w={w} onPlay={(n) => props.onPlay(w, n)} />
            ))}
            {locked.length > 0 && <h2 class="f-h2">🔒 பூட்டிய Worlds</h2>}
            {locked.map((w) => (
              <WorldCard key={w.unitId} w={w} onPlay={() => {}} />
            ))}
            {me.worlds.length === 0 && <p class="f-muted f-pad">உன் Worlds விரைவில் வரும்.</p>}
          </>
        )}
      </main>
    </>
  );
}

// ---- A level: one question at a time, his own pad, Check once ----

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

function Play(props: { world: World; n: number; onBack: () => void; onChecked: (f: FamilyLevel, r: Checked, typed: Record<number, string[]>) => void }) {
  const draftKey = `draft.${props.world.unitId}.${props.n}`;
  const [form, setForm] = useState<FamilyLevel | null>(() => keep<FamilyLevel>(`form.${props.world.unitId}.${props.n}`));
  const [typed, setTyped] = useState<Record<number, string[]>>(() => keep<Record<number, string[]>>(draftKey) ?? {});
  const [at, setAt] = useState<Spot>({ qi: 0, bi: 0 });
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    query("family:level", { unitId: props.world.unitId, n: props.n })
      .then((f) => {
        keep(`form.${props.world.unitId}.${props.n}`, f as FamilyLevel);
        setForm(f as FamilyLevel);
      })
      .catch((e) => {
        if (!form) setErr(problemWords(e));
      });
  }, [props.world.unitId, props.n]);
  useEffect(() => {
    strip.current?.querySelector(".on")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [at.qi]);

  const all = useMemo(() => (form ? boxesOf(form) : []), [form]);
  if (err) return <Oops text={err} onBack={props.onBack} />;
  if (!form) return <Splash />;

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
      props.onChecked(form, res, typed);
    } catch (e) {
      toast(e instanceof NetError && e.offline ? "இணையம் இல்லை. உன் விடைகள் இந்த phone இல் உள்ளன: இணையம் வந்ததும் மீண்டும் அழுத்து." : problemWords(e), true);
    } finally {
      setBusy(false);
    }
  };

  let bi = 0;
  return (
    <div class="f-play">
      <header class="f-top play">
        <button type="button" class="f-icon" aria-label="Back" onClick={props.onBack}>
          ✕
        </button>
        <b class="f-name">
          World {form.no} · Level {form.n}
        </b>
        <span class="f-sp" />
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
            class={`f-qchip ${filled(qi)}${qi === at.qi ? " on" : ""}`}
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
        <section class="f-card rise" key={q.q}>
          <div class="f-qhead">
            <b class="f-qn">Q{q.q}</b>
            <small>{q.max} XP</small>
          </div>
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
      <img class="f-owl big" src="/icon.svg" alt="" />
      <p class="f-lead">{props.text}</p>
      <button type="button" class="f-btn go" onClick={props.onBack}>
        பின் செல்
      </button>
    </div>
  );
}

// ---- The reveal ----

function useCount(to: number, ms = 900): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setN(Math.round(to * (1 - (1 - k) * (1 - k))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return n;
}

function Result(props: {
  world: World;
  form: FamilyLevel;
  res: Checked;
  typed: Record<number, string[]>;
  me: FamilyMe | null;
  onHome: () => void;
  onNext: (w: World, n: number) => void;
}) {
  const { res, form } = props;
  const pct = res.phoneMax ? res.got / res.phoneMax : 0;
  const xp = useCount(res.got);
  useEffect(() => {
    sound(pct >= 0.9 ? "star" : "level");
  }, []);
  const cheer = pct >= 0.9 ? "அருமை!" : pct >= 0.7 ? "நன்று!" : pct >= 0.5 ? "நல்ல முயற்சி!" : "முயற்சி தொடரட்டும்!";
  const next = nextPlay(props.me);
  const nextHere = next && next.world.unitId === props.world.unitId && next.n !== form.n ? next : null;
  return (
    <div class="f-result">
      <header class="f-top play">
        <b class="f-name">
          World {form.no} · Level {form.n}
        </b>
      </header>
      <main class="f-main">
        <section class="f-score rise">
          <img class={`f-owl big${pct >= 0.7 ? " hop" : ""}`} src="/icon.svg" alt="" />
          <h1 class="f-cheer">{cheer}</h1>
          <p class="f-big">
            {res.got} <small>/ {res.phoneMax}</small>
          </p>
          <p class="f-gain">
            <span class="f-chip xp">⚡ +{xp} XP</span>
            <span class={`f-chip flame${res.streak.today ? " lit" : ""}`}>🔥 {res.streak.days} நாள்</span>
          </p>
          {res.teacher.length > 0 && <p class="f-teach">✍ {res.teacher.map((q) => `Q${q}`).join(", ")}: ஆசிரியர் திருத்துவார்</p>}
        </section>
        <p class="f-tip">✎ உன் தாளில் ✓ ✗ போடு. தவறியவற்றை வகுப்பில் விளக்குவார்கள்.</p>
        <ul class="f-res">
          {res.results.map((r, i) => {
            const fq = form.qs.find((x) => x.q === r.q);
            const whole = r.got !== null;
            const ok = whole && r.got === r.max;
            return (
              <li key={r.q} class={`f-rrow rise ${!whole ? "teach" : ok ? "ok" : r.got! > 0 ? "part" : "bad"}`} style={{ animationDelay: `${120 + i * 70}ms` }}>
                <b class="f-rq">Q{r.q}</b>
                <span class="f-rmarks">
                  {r.ok.map((part, pi) =>
                    part === null ? (
                      <i key={pi} class="t">✍</i>
                    ) : (
                      part.map((g, bi) => (
                        <i key={`${pi}.${bi}`} class={g ? "y" : "n"} title={pretty((props.typed[r.q] ?? [])[fq ? fq.parts.slice(0, pi).reduce((s, p) => s + (p.boxes?.length ?? 0), 0) + bi : bi] ?? "")}>
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
            Worlds
          </button>
        </div>
      </main>
    </div>
  );
}

// ---- This week's board ----

const MEDAL = ["🥇", "🥈", "🥉"];

function Board(props: { onBack: () => void }) {
  const [b, setB] = useState<{ top: BoardRow[]; me: BoardRow | null; count: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    query("family:board")
      .then((x) => setB(x as typeof b))
      .catch((e) => setErr(problemWords(e)));
  }, []);
  const row = (r: BoardRow, i: number) => (
    <li key={`${r.name}${i}`} class={`f-brow rise${r.me ? " me" : ""}`} style={{ animationDelay: `${i * 50}ms` }}>
      <span class="f-rank">{r.rank <= 3 && r.xp > 0 ? MEDAL[r.rank - 1] : r.rank}</span>
      <b class="f-bname">{r.me ? `${r.name} (நீ)` : r.name}</b>
      <span class="f-bxp">⚡ {r.xp}</span>
    </li>
  );
  return (
    <div>
      <header class="f-top play">
        <button type="button" class="f-icon" aria-label="Back" onClick={props.onBack}>
          ←
        </button>
        <b class="f-name">இந்த வாரம்</b>
      </header>
      <main class="f-main">
        <p class="f-muted small f-center-t">திங்கள் காலை எல்லோரும் 0 இலிருந்து · Everyone starts at 0 on Monday</p>
        {err && <p class="f-lead">{err}</p>}
        {!b && !err && <p class="f-muted f-pad">…</p>}
        {b && (
          <>
            <ol class="f-board">{b.top.map(row)}</ol>
            {b.top.length === 0 && <p class="f-lead f-center-t">இந்த வாரம் இன்னும் யாரும் இல்லை. நீ முதலாவதாக வா!</p>}
            {b.me && !b.top.some((r) => r.me) && (
              <ol class="f-board you">
                {row(b.me, 0)}
              </ol>
            )}
          </>
        )}
      </main>
    </div>
  );
}
