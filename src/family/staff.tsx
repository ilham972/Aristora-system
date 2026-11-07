// The class app's Us tab (7 Nov 2026, his voice note: "build the tab for the teachers on the Aristora system app ... the
// same UI UX that you used in the family app, otherwise they can't get the same feeling ... these teachers are going to
// run the community"). The family app's own Us and Race screens, shown inside the class app (src/usFrame.tsx: /f/?staff
// in an iframe on the class system's own address), with the teacher's own sign-in (the class system's, kept on that
// address): nothing new to remember, nothing new in the class app's files. Only teachers' reads and changes go out
// (net.ts staffWith). A teacher:
// - Us: every grade's lines; 👏 on a line (her name on the phones; the student gets an alert), a name = his profile;
//   🌟 a shout-out (a grade, a student, a reason), ✍️ a post and ⋯ pin / remove (the owner and the Community tick);
//   her own guide the first time (what Us is, what she does in two minutes, how it should feel).
// - Posts and doubts (7 Nov 2026, his voice note: "teachers will put the posters ... the screenshot of the question ...
//   the name is visible to the teachers only"): ✍️ Post has photos, grades (everyone, one or several) and ❓ Question;
//   a question or a doubt opens (usPost.tsx ThreadScreen): every answer with its name, ✓ / ✗ / ✎ her words / ✕; a
//   doubt's replies, her own reply; ⚑ To do = answers to mark, doubts no teacher answered, reports.
// - Race: the students' race, a grade or ARISTORA; a name = his profile, with 🌟 instead of a classmate's 👏.
// No XP, flame, trophies or ranking of teachers (his rule: never trophies on the teachers' pages).
// This file is its own: students' phones never download it (scripts/build.mjs: not prefetched, its own budget).

import { render, type ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { UsBoard, UsBoardItem, UsFeed } from "../../convex/us";
import type { UsItem } from "../../convex/lib/us";
import type { RaceRow } from "../../convex/lib/race";
import type { Board } from "./board";
import type { Mood, SheetRender } from "./ui";

/**
 * What it uses of the students' app, handed over by main.tsx (never imported here: an import of any of them would make
 * the bundler split the students' first load into more files, ~1 KB more for every phone; tests/usStaff.test.ts checks).
 */
export type Kit = Pick<typeof import("./board"), "BoardTab" | "keptBoard"> &
  Pick<typeof import("./later"), "useParts" | "useUsParts"> &
  Pick<typeof import("./net"), "keep" | "mutation" | "query" | "staffWith"> &
  Pick<typeof import("./sound"), "armSound" | "buzz" | "sound"> &
  Pick<typeof import("./ui"), "Avatar" | "problemWords" | "setSheetHost" | "Sheet" | "toast" | "Toast" | "Waiting">;
let K: Kit;

/** Her style (her screens only): a string here, so the students' style files carry none of it. */
const CSS = `
.t-seg{display:flex;gap:2px;padding:3px;border-radius:999px;background:rgba(255,255,255,.18)}
.t-seg button{height:34px;padding:2px 16px 0;border-radius:999px;color:#fff;font:800 14.5px/1 var(--display)}
.t-seg button.on{background:#fff;color:var(--brand-2)}
.t-me{display:flex;align-items:center;gap:8px;min-width:0;color:#fff;font:800 15px/1 var(--display)}
.t-me i{font-style:normal;font-size:12px;opacity:.8}
.t-head{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 16px 0}
.t-head.one{grid-template-columns:1fr}
.t-head .f-btn{min-height:46px;font-size:15.5px;padding:2px 8px 0;margin-bottom:5px}
.t-acts{display:flex;align-items:center;gap:2px}
.t-more{width:30px;height:40px;border-radius:12px;color:var(--ink3);font:800 22px/1 var(--display)}
.t-grades{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;margin:2px 0 12px}
.t-grades.all{grid-template-columns:2.4fr repeat(6,1fr)}
.t-chip{min-height:40px;padding:2px 4px 0;border-radius:12px;background:var(--brand-soft);color:var(--brand-2);font:800 15px/1.2 var(--display);border:1.5px solid var(--lav)}
.t-chip.on{background:var(--brand);color:#fff;border-color:transparent}
.f-hero .t-grades{margin:12px 0 0}
.f-hero .t-chip{background:rgba(255,255,255,.18);color:#fff;border-color:transparent}
.f-hero .t-chip.on{background:#fff;color:var(--brand-2)}
.t-kids{display:flex;flex-wrap:wrap;gap:6px;max-height:190px;overflow-y:auto;margin:0 0 12px}
.t-kids .t-chip{padding:2px 12px 0;font-size:14.5px}
.t-why{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0 0 12px}
.t-why .t-chip{padding:7px 8px 5px;font-size:14px;text-align:center}
.t-lab{display:block;margin:4px 0 6px;font:800 13px/1 var(--display);color:var(--ink3);letter-spacing:.04em;text-transform:uppercase}
.t-text{display:block;width:100%;min-height:110px;padding:10px 12px;border-radius:14px;border:1.5px solid var(--line-2);font:500 15.5px/1.5 var(--text);color:var(--ink);resize:vertical}
.t-row{display:flex;align-items:center;gap:8px;margin:8px 0 12px;font-size:14px;color:var(--ink2)}
.t-sheet .f-btn{width:100%}
.t-sheet .f-btn+.f-btn{margin-top:8px}
.t-end{display:grid;justify-items:center;gap:10px;margin:22px 16px 0;text-align:center}
.t-end p{max-width:300px;font-size:14.5px;line-height:1.5;color:var(--ink2)}
.t-two{display:grid;grid-template-columns:1fr 1.6fr;gap:6px;margin:0 0 6px}
.t-two .t-chip{padding:7px 8px 5px;font-size:14px}
.t-note{margin:0 0 10px;font-size:13px;line-height:1.45;color:var(--ink3)}
`;

/** Her three cards, the first time (again from the ?): what Us is, what she does, how it should feel. */
const GUIDE: { mood: Mood; h: string; p: string }[] = [
  {
    mood: "wave",
    h: "இது Us: மாணவர்கள் பார்ப்பது",
    p: "எல்லா மாணவர்களின் phone இலும் இதே வரிகள். ஆந்தை ஒவ்வொரு முயற்சியையும் இங்கே சொல்லும்: phone இல் முதல் Level, பிறந்தநாள், ஒரு Stage முடிவு, மீண்டும் வருகை.",
  },
  {
    mood: "cheer",
    h: "நீங்கள் செய்வது: 2 நிமிடம்",
    p: "👏 இன்றைய வரிகளுக்கு, 🌟 ஒரு நாளைக்கு 2–3 shout-outs, ✍️ ஒரு கேள்வி அல்லது poster. ⚑ To do: விடைகளுக்கு ✓ / ✗, சந்தேகங்களுக்குப் பதில், 💡 பதிவுகளுக்கு ✓. ஒவ்வொரு வரியையும் திறந்து எழுதுங்கள்; தவறான விளக்கத்துக்கு ✎ திருத்தம்.",
  },
  {
    mood: "love",
    h: "எப்படி உணர வேண்டும்",
    p: "ஒவ்வொருவரும் பார்க்கப்படுகிறார்கள், யாரும் வெட்கப்படுவதில்லை. marks அல்ல, முயற்சியைப் பாராட்டுங்கள். இதுவரை shout-out கிடைக்காதவர்களுக்கு முதலில்.",
  },
];

const WHY: [string, string][] = [
  ["try", "எப்போதும் விடாமுயற்சி"],
  ["help", "நண்பருக்கு உதவினார்"],
  ["work", "தெளிவான working"],
  ["up", "பெரிய முன்னேற்றம்"],
  ["focus", "வகுப்பில் முழுக் கவனம்"],
  ["ask", "அருமையான கேள்வி"],
];
const GRADES = [6, 7, 8, 9, 10, 11];
const STARTERS: [string, string][] = [
  ["Tip", "💡 இன்றைய குறிப்பு: "],
  ["Well done", "👏 வாழ்த்துக்கள்! "],
  ["Reminder", "⏰ நினைவூட்டல்: "],
  ["Challenge", "🎯 இந்த வார சவால்: "],
];

export function startStaff(el: HTMLElement, kit: Kit): void {
  K = kit;
  let t: string | null = null;
  try {
    t = localStorage.getItem("aristora.token"); // the class system's sign-in on this address
  } catch {
    /* private mode */
  }
  K.staffWith(t ?? "");
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  render(<StaffApp />, el);
}

function StaffApp() {
  const parts = K.useParts();
  const usp = K.useUsParts();
  const [tab, setTab] = useState<"us" | "race">(() => (K.keep<string>("tab") === "race" ? "race" : "us"));
  const [b, setB] = useState<UsBoard | null>(() => K.keep<UsBoard>("usb"));
  const [err, setErr] = useState<string | null>(null);
  const [mate, setMate] = useState<{ id: string; row: RaceRow | null } | null>(null);
  // A post or a doubt opened (its answers or replies).
  const [thread, setThread] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetRender | null>(null);
  const [grade, setGrade] = useState<number>(() => K.keep<number>("grade") ?? 8);
  const mateRef = useRef(mate);
  mateRef.current = mate;
  const threadRef = useRef(thread);
  threadRef.current = thread;
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;

  const load = () =>
    K.query("us:board")
      .then((x) => {
        K.keep("usb", x);
        setB(x as UsBoard);
        setErr(null);
      })
      .catch((e) => setErr(K.problemWords(e)));
  // One step in the history per sheet or profile, so the phone's Back closes it (as in the students' app).
  const openSheet = (r: SheetRender) => {
    K.buzz();
    K.sound("pop");
    if (sheetRef.current) history.replaceState({ t: 1 }, "");
    else history.pushState({ t: 1 }, "");
    setSheet(() => r);
  };
  const closeSheet = () => {
    if (history.state?.t) history.back();
    else setSheet(null);
  };
  const openMate = (id: string, row: RaceRow | null) => {
    K.buzz();
    K.sound("tap");
    history.pushState({ t: 1 }, "");
    setMate({ id, row });
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    void load();
    // The loading owl goes at once (here, not src/splash.ts: importing it would split it out of the students' first
    // load into a file of its own).
    const owl = document.getElementById("splash");
    if (owl) {
      owl.classList.add("out");
      window.setTimeout(() => owl.remove(), 320);
    }
    K.setSheetHost(openSheet);
    // The class app asks for the newest lines each time its Us tab opens (src/usFrame.tsx).
    const told = (e: MessageEvent) => {
      if (e.origin === location.origin && (e.data as { k?: string } | null)?.k === "us-refresh") void load();
    };
    const back = () => {
      if (sheetRef.current) setSheet(null);
      else if (mateRef.current) setMate(null);
      else if (threadRef.current) {
        setThread(null);
        void load();
      }
    };
    window.addEventListener("message", told);
    window.addEventListener("popstate", back);
    return () => {
      K.setSheetHost(null);
      window.removeEventListener("message", told);
      window.removeEventListener("popstate", back);
    };
  }, []);

  const pick = (x: "us" | "race") => {
    if (x === tab) return;
    K.buzz();
    K.sound("tap");
    setTab(x);
    K.keep("tab", x);
    window.scrollTo(0, 0);
  };
  const post = !!b?.post;
  const shout = (pre: { id: string; name: string } | null) =>
    openSheet((close) => <ShoutSheet pre={pre} shouted={b?.shouted ?? []} onClose={close} onDone={() => void load()} />);
  const write = () => openSheet((close) => <PostSheet onClose={close} onDone={() => void load()} />);
  const tclap = (m: UsBoardItem) => {
    if (m.tme || !b) return;
    K.buzz();
    K.sound("pop");
    setB({ ...b, items: b.items.map((x) => (x.id === m.id ? { ...x, tme: true, tc: [...(x.tc ?? []), b.me] } : x)) });
    K.mutation("us:tclap", { id: m.id })
      .then(() => load())
      .catch((e) => K.toast(K.problemWords(e), true));
  };
  const moderate = (m: UsBoardItem) => openSheet((close) => <ModSheet m={m} onClose={close} onDone={() => void load()} />);
  const openThread = (id: string) => {
    history.pushState({ t: 1 }, "");
    setThread(id);
    window.scrollTo(0, 0);
  };

  const top = (
    <div class="f-toprow">
      <span class="t-me">
        <K.Avatar name={b?.me || "?"} size="s" />
        <span>
          {b?.me ?? ""} <i>· ஆசிரியர்</i>
        </span>
      </span>
      <span class="f-sp" />
      <div class="t-seg" role="group" aria-label="Us or the race">
        <button type="button" class={tab === "us" ? "on" : ""} aria-pressed={tab === "us"} onClick={() => pick("us")}>
          Us
        </button>
        <button type="button" class={tab === "race" ? "on" : ""} aria-pressed={tab === "race"} onClick={() => pick("race")}>
          Race
        </button>
      </div>
    </div>
  );

  const feed: UsFeed | null = b ? { open: b.cfg.open, welcome: b.cfg.welcome, today: b.today, items: b.items, you: "" } : null;
  const act = (m: UsItem) => {
    const x = m as UsBoardItem;
    if (m.k === "count") return post ? <MoreButton onClick={() => moderate(x)} /> : null;
    return (
      <span class="t-acts">
        {!x.tmine && m.k !== "ask" && (
          <button type="button" class={`f-us-clap${x.tme ? " done" : ""}`} aria-pressed={x.tme} aria-label={x.tme ? "You cheered" : "Cheer"} onClick={() => tclap(x)}>
            👏<b>{m.c > 0 ? m.c : ""}</b>
          </button>
        )}
        {post && <MoreButton onClick={() => moderate(x)} />}
      </span>
    );
  };

  let body: ComponentChildren;
  if (thread && !mate) {
    body = usp ? (
      <usp.ThreadScreen key={thread} id={thread} staff me={b?.me} onBack={closeMateBack} onMate={(id) => openMate(id, null)} />
    ) : (
      <K.Waiting />
    );
  } else if (mate) {
    body = parts ? (
      <parts.MateScreen key={mate.id} id={mate.id} row={mate.row} board={K.keptBoard()} me={null} onBack={closeMateBack} onShout={(id, name) => shout({ id, name })} />
    ) : (
      <K.Waiting />
    );
  } else if (tab === "race") {
    body = (
      <K.BoardTab
        top={top}
        me={null}
        grade={grade}
        gradeRow={
          <div class="t-grades" role="group" aria-label="Grade">
            {GRADES.map((g) => (
              <button
                key={g}
                type="button"
                class={`t-chip${g === grade ? " on" : ""}`}
                aria-pressed={g === grade}
                aria-label={`Grade ${g}`}
                onClick={() => {
                  K.buzz();
                  setGrade(g);
                  K.keep("grade", g);
                }}
              >
                {g}
              </button>
            ))}
          </div>
        }
        onOpen={(r) => openMate(r.id, r)}
      />
    );
  } else {
    body = usp ? (
      <usp.UsTab
        top={top}
        me={null}
        onPlay={() => {}}
        onMe={() => {}}
        onMate={(id) => openMate(id, null)}
        onOpen={openThread}
        staff={{
          feed,
          err: b ? null : err,
          head: (
            <div class={`t-head${post ? "" : " one"}`}>
              <button type="button" class="f-btn gold" onClick={() => shout(null)}>
                🌟 Shout-out
              </button>
              {post && (
                <button type="button" class="f-btn go" onClick={write}>
                  ✍️ Post
                </button>
              )}
            </div>
          ),
          act,
          guide: GUIDE,
          end: (
            <section class="t-end rise">
              <p>இன்றைய வரிகள் இவ்வளவுதான். app பார்க்காத முயற்சிக்கு ஒரு shout-out கொடுங்கள்!</p>
              <button type="button" class="f-btn gold" onClick={() => shout(null)}>
                🌟 Shout-out
              </button>
            </section>
          ),
        }}
      />
    ) : (
      <>
        <header class="f-hero">{top}</header>
        <K.Waiting />
      </>
    );
  }
  function closeMateBack() {
    if (history.state?.t) history.back();
    else if (mateRef.current) setMate(null);
    else {
      setThread(null);
      void load();
    }
  }
  return (
    <div class={`f-app s-${mate || thread ? "mate" : "main"} t-staff`} onPointerDown={K.armSound}>
      <main class={`f-main t-${tab}`}>{body}</main>
      {sheet && sheet(closeSheet)}
      <K.Toast />
    </div>
  );
}

function MoreButton(props: { onClick: () => void }) {
  return (
    <button type="button" class="t-more" aria-label="Pin or remove" onClick={props.onClick}>
      ⋯
    </button>
  );
}

/** 🌟 A shout-out: a grade, one of its students (from the race: everyone), a reason; his phone gets an alert. */
function ShoutSheet(props: { pre: { id: string; name: string } | null; shouted: string[]; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<RaceRow[]>(() => K.keptBoard()?.rows ?? []);
  const [grade, setGrade] = useState<number>(() => K.keep<number>("grade") ?? 8);
  const [who, setWho] = useState<{ id: string; name: string } | null>(props.pre);
  const [why, setWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (props.pre) return;
    K.query("family:board")
      .then((x) => {
        K.keep("board", x);
        setRows((x as Board).rows);
      })
      .catch((e) => K.toast(K.problemWords(e), true));
  }, []);
  const kids = rows.filter((r) => r.g === grade).sort((a, b) => a.n.localeCompare(b.n));
  const send = async () => {
    if (!who || !why || busy) return;
    setBusy(true);
    try {
      await K.mutation("us:shout", { studentId: who.id, why });
      K.sound("level");
      K.toast(`🌟 ${who.name}: shout-out போனது. அவருக்கு அறிவிப்பு போகும்.`);
      props.onDone();
      props.onClose();
    } catch (e) {
      K.toast(K.problemWords(e), true);
      setBusy(false);
    }
  };
  return (
    <K.Sheet title="🌟 Shout-out" sub={who && props.pre ? `${who.name} க்கு: எதற்காக?` : "யாருக்கு, எதற்காக? அவருடைய phone இல் அறிவிப்பு வரும்."} onClose={props.onClose} class="t-sheet">
      {!props.pre && (
        <>
          <span class="t-lab">Grade</span>
          <div class="t-grades" role="group" aria-label="Grade">
            {GRADES.map((g) => (
              <button
                key={g}
                type="button"
                class={`t-chip${g === grade ? " on" : ""}`}
                aria-pressed={g === grade}
                aria-label={`Grade ${g}`}
                onClick={() => {
                  setGrade(g);
                  setWho(null);
                }}
              >
                {g}
              </button>
            ))}
          </div>
          <span class="t-lab">Student</span>
          <div class="t-kids" role="group" aria-label="Student">
            {rows.length === 0 && <K.Waiting />}
            {kids.map((r) => (
              <button key={r.id} type="button" class={`t-chip${who?.id === r.id ? " on" : ""}`} aria-pressed={who?.id === r.id} onClick={() => setWho({ id: r.id, name: r.n })}>
                {r.n}
                {props.shouted.includes(r.id) ? " ✓" : ""}
              </button>
            ))}
          </div>
        </>
      )}
      <span class="t-lab">Why</span>
      <div class="t-why" role="group" aria-label="Why">
        {WHY.map(([k, ta]) => (
          <button key={k} type="button" class={`t-chip${why === k ? " on" : ""}`} aria-pressed={why === k} onClick={() => setWhy(k)}>
            {ta}
          </button>
        ))}
      </div>
      <button type="button" class="f-btn gold" disabled={!who || !why || busy} onClick={() => void send()}>
        🌟 Send
      </button>
    </K.Sheet>
  );
}

/**
 * ✍️ A post (the owner and the Community tick): for everyone, one grade or several; a notice or a ❓ question students
 * answer (their answers hidden from each other: you mark them); words and up to 3 photos (a poster, a question's
 * screenshot), starters for the words.
 */
function PostSheet(props: { onClose: () => void; onDone: () => void }) {
  const usp = K.useUsParts();
  const [gs, setGs] = useState<number[]>([]);
  const [qn, setQn] = useState(false);
  const [pin, setPin] = useState(false);
  const [pre, setPre] = useState("");
  const send = (text: string, ph: unknown[]) =>
    K.mutation("us:post", { text, ph, ...(gs.length ? { gs } : {}), ...(qn ? { qn: true } : {}), ...(pin ? { pin: true } : {}) }).then(() => {
      K.sound("level");
      K.toast(`✍️ ${gs.length ? `Grade ${gs.join(", ")} க்கு` : "எல்லோருக்கும்"} போனது.${qn ? " மாணவர்களுக்கு அறிவிப்பு போகும்." : ""}`);
      props.onDone();
      props.onClose();
    });
  return (
    <K.Sheet title="✍️ Post" sub="ஒரு கேள்வி, ஒரு poster, ஒரு குறிப்பு. யாருடைய பெயரையும் குறைவாகச் சொல்ல வேண்டாம்." onClose={props.onClose} class="t-sheet">
      <span class="t-lab">For</span>
      <div class="t-grades all" role="group" aria-label="For">
        <button type="button" class={`t-chip${!gs.length ? " on" : ""}`} aria-pressed={!gs.length} onClick={() => setGs([])}>
          Everyone
        </button>
        {GRADES.map((g) => (
          <button
            key={g}
            type="button"
            class={`t-chip${gs.includes(g) ? " on" : ""}`}
            aria-pressed={gs.includes(g)}
            aria-label={`Grade ${g}`}
            onClick={() => setGs(gs.includes(g) ? gs.filter((x) => x !== g) : [...gs, g].sort((a, b) => a - b))}
          >
            {g}
          </button>
        ))}
      </div>
      <div class="t-two" role="group" aria-label="Kind">
        <button type="button" class={`t-chip${!qn ? " on" : ""}`} aria-pressed={!qn} onClick={() => setQn(false)}>
          📣 Notice
        </button>
        <button type="button" class={`t-chip${qn ? " on" : ""}`} aria-pressed={qn} onClick={() => setQn(true)}>
          ❓ Question to answer
        </button>
      </div>
      <p class="t-note">
        {qn
          ? "மாணவர்கள் விடை அனுப்புவார்கள்: ஒருவர் விடை மற்றவருக்குத் தெரியாது. நீங்கள் ✓ / ✗ கொடுத்ததும், சரியானவை விடை அனுப்பியவர்களுக்குப் பெயருடன் தெரியும்."
          : "ஒரு குறிப்பு, ஒரு நினைவூட்டல், ஒரு வாழ்த்து: படத்துடனும் போடலாம்."}
      </p>
      {!qn && (
        <div class="t-why" role="group" aria-label="Start with">
          {STARTERS.map(([label, start]) => (
            <button key={label} type="button" class="t-chip" onClick={() => setPre(start)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {usp ? (
        <usp.Composer key={pre} init={pre} ph={qn ? "கேள்வி (அல்லது படம் மட்டும்)…" : "…"} go="✍️ Post" max={3} crop="மஞ்சள் புள்ளிகளை இழு: தேவையான பகுதி மட்டும்." onSend={send} />
      ) : (
        <K.Waiting />
      )}
      <label class="t-row">
        <input type="checkbox" checked={pin} onChange={() => setPin(!pin)} />
        <span>மேலே வைத்திரு (📌)</span>
      </label>
    </K.Sheet>
  );
}

/** ⋯ A line: pin it on top (a post), or remove it from every phone (asked once more). */
function ModSheet(props: { m: UsBoardItem; onClose: () => void; onDone: () => void }) {
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (go: () => Promise<unknown>, said: string) => {
    setBusy(true);
    try {
      await go();
      K.toast(said);
      props.onDone();
      props.onClose();
    } catch (e) {
      K.toast(K.problemWords(e), true);
      setBusy(false);
    }
  };
  return (
    <K.Sheet title="இந்த வரி" sub="எல்லா மாணவர்களின் phone இலும்." onClose={props.onClose} class="t-sheet">
      <button
        type="button"
        class="f-btn go"
        disabled={busy}
        onClick={() => void run(() => K.mutation("us:pin", { id: props.m.id, on: !props.m.pin }), props.m.pin ? "📌 இனி மேலே இல்லை." : "📌 மேலே வைக்கப்பட்டது.")}
      >
        {props.m.pin ? "Unpin" : "📌 Pin on top"}
      </button>
      {!sure ? (
        <button type="button" class="f-btn white" disabled={busy} onClick={() => setSure(true)}>
          ✕ Remove from every phone
        </button>
      ) : (
        <button type="button" class="f-btn gold" disabled={busy} onClick={() => void run(() => K.mutation("us:remove", { id: props.m.id }), "✕ நீக்கப்பட்டது.")}>
          ✕ Yes, remove it
        </button>
      )}
    </K.Sheet>
  );
}
