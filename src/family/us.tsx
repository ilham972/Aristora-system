// Us, the students' community (7 Nov 2026, his voice notes: "the app is not feel like a community"; "students don't
// know how to use this community ... we have to give the hint ... how this is want to feel"). One tab, between Learn
// and the Race, once the owner opens it (Settings → Community):
// - the owl's guide the first time (three cards: what this place is, one tap is enough, you will be here too), again
//   from the ? in the header;
// - the owner's welcome; how many of ARISTORA learned today;
// - the lines, newest first: the owl's (a birthday, a first level from home, back in class, a Stage finished, days in a
//   row, the week's most improved and champions, yesterday's count) and the teachers' (a shout-out, a post). Each has
//   one button that says what the moment asks for: 🎂 wish, 👋 welcome, 👏 cheer, 🙏 thank; yesterday's count asks
//   for a Level today. His own lines show who cheered him instead.
// - the end of the list sends him to learn: the community is never the place he stays.
// The same evening (his next voice note): teachers' posts have photos and can be questions (✍️ Answer opens it: his
// answer is hidden from classmates, usPost.tsx), and he asks his own doubts (🙋 Ask a doubt: teachers, seniors or
// both). Chips show only the questions or only the doubts. The words are Tamil; the game words English.

import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { FamilyMe } from "../../convex/family";
import type { UsFeed } from "../../convex/us";
import type { UsItem } from "../../convex/lib/us";
import { DAY_EN, MONTH, timeOf } from "./home";
import { keep, mutation, query } from "./net";
import { picOf, usePics } from "./pics";
import { buzz, sound } from "./sound";
import { Avatar, Owl, OwlBadge, problemWords, showSheet, toast, Waiting, type Mood } from "./ui";
import { AUD, DoubtSheet, gradesWords, Pics } from "./usPost";

/** A shout-out's reason, in his words (convex/lib/us.ts SHOUT_WHY: the phone keeps its own copy, see family.ts). */
const WHY_TA: Record<string, string> = {
  try: "எப்போதும் விடாமுயற்சி!",
  help: "நண்பருக்கு உதவினார்!",
  work: "அழகான, தெளிவான working!",
  up: "பெரிய முன்னேற்றம்!",
  focus: "வகுப்பில் முழுக் கவனம்!",
  ask: "அருமையான கேள்வி கேட்டார்!",
};

/** What a line asks for: its button. */
const ASK: Partial<Record<UsItem["k"], string>> = { bday: "🎂", home1: "👋", back: "👋", post: "🙏" };
/** The small mark on a line's picture. */
const MARK: Record<UsItem["k"], string> = {
  bday: "🎂",
  home1: "🏠",
  back: "👋",
  stage: "🏁",
  flame: "🔥",
  up: "🚀",
  champs: "👑",
  count: "🔥",
  post: "📣",
  shout: "🌟",
  ask: "🙋",
};

const GUIDE: { mood: Mood; h: string; p: string }[] = [
  {
    mood: "wave",
    h: "இது Us: நம்ம ARISTORA",
    p: "இங்கே எல்லா மாணவர்களும் ஆசிரியர்களும் ஒன்றாக. ஒருவரின் வெற்றி, நம் எல்லோருடைய மகிழ்ச்சி.",
  },
  {
    mood: "cheer",
    h: "தொடு, விடை எழுது, கேள்",
    p: "🎂 வாழ்த்து, 👋 வரவேற்பு, 👏 பாராட்டு: ஒரு தொடுகை போதும். ❓ ஆசிரியரின் கேள்விக்கு உன் விடை: வேறு யாருக்கும் தெரியாது. 🙋 புரியவில்லையா? சந்தேகம் கேள்.",
  },
  {
    mood: "love",
    h: "நீயும் இங்கே வருவாய்",
    p: "Level செய்யும்போதும், தொடர்ந்து கற்கும்போதும், முன்னேறும்போதும் ஆந்தை உன்னைப் பற்றி இங்கே சொல்லும். வெற்றி மட்டுமல்ல, முயற்சியும் தெரியும்.",
  },
];

/**
 * The class app's Us tab (7 Nov 2026, staff.tsx): the same tab for a teacher, its lines and buttons hers. `feed` = the
 * teachers' lines as the tab reads them (null while loading); `head` under the header (🌟, ✍️); `act` a line's buttons
 * (👏, ⋯) instead of the students' one; `guide` her three cards; `end` the end of the list instead of Continue.
 */
export type UsStaff = {
  feed: UsFeed | null;
  err: string | null;
  head: ComponentChildren;
  act: (m: UsItem) => ComponentChildren;
  guide: { mood: Mood; h: string; p: string }[];
  end: ComponentChildren;
};

/** The kept lines (per child) show at once; the new ones come after. Off for a teacher (her tab reads its own). */
function useUs(on: boolean): { f: UsFeed | null; err: string | null; set: (f: UsFeed) => void; read: () => void } {
  const [f, setF] = useState<UsFeed | null>(() => keep<UsFeed>("us"));
  const [err, setErr] = useState<string | null>(null);
  const set = (x: UsFeed) => {
    keep("us", x);
    setF(x);
  };
  const read = () =>
    query("us:feed")
      .then((x) => {
        keep("usAt", Date.now());
        set(x as UsFeed);
      })
      .catch((e) => setErr(problemWords(e)));
  useEffect(() => {
    // Flipping tabs never reads it again within a minute (the free plan's reading; a tap updates it anyway).
    if (on && Date.now() - (keep<number>("usAt") ?? 0) >= 60_000) void read();
  }, []);
  return { f, err, set, read: () => void read() };
}

/** What the chips show: everything, the teachers' questions, the doubts; a teacher's to-do (answers to mark, doubts
 * no teacher answered: those for seniors only while nobody has, reports). */
type Show = "all" | "q" | "ask" | "todo";
const todo = (m: UsItem) => (m.wN ?? 0) > 0 || (m.k === "ask" && !m.tr && (m.aud !== "s" || !m.an)) || (m.rp ?? 0) > 0;

/** "Today", "Yesterday", "Mon 2 Nov" (Sri Lanka's days). */
function dayWords(t: number, now: number): string {
  const SL = 330 * 60_000;
  const day = (x: number) => Math.floor((x + SL) / 86_400_000);
  const d = day(now) - day(t);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  const x = new Date(t + SL);
  return `${DAY_EN[(x.getUTCDay() + 6) % 7]} ${x.getUTCDate()} ${MONTH[x.getUTCMonth()]}`;
}

export function UsTab(props: {
  top: ComponentChildren;
  me: FamilyMe | null;
  onPlay: () => void;
  onMate: (id: string) => void;
  onMe: () => void;
  /** A post or a doubt opened (usPost.tsx ThreadScreen). */
  onOpen: (id: string) => void;
  staff?: UsStaff;
}) {
  const own = useUs(!props.staff);
  const t = props.staff;
  const f = t ? t.feed : own.f;
  const err = t ? t.err : own.err;
  const set = own.set;
  const G = t?.guide ?? GUIDE;
  // A name is a tap to that student's profile (his own: Me).
  const mate = (id: string) => {
    buzz();
    sound("tap");
    if (id === f?.you) props.onMe();
    else props.onMate(id);
  };
  const [guide, setGuide] = useState(() => !keep<boolean>("usGuide"));
  const [step, setStep] = useState(0);
  const [mine, setMine] = useState<string[]>(() => keep<string[]>("usClapped") ?? []);
  const [show, setShow] = useState<Show>("all");
  const all = f?.items ?? [];
  const items = all.filter((m) => (show === "q" ? !!m.qn : show === "ask" ? m.k === "ask" : show === "todo" ? todo(m) : true));
  const todoN = t ? all.filter(todo).length : 0;
  // His welcome is read once whole (kept: the words he read); after that two lines until a tap.
  const [openW, setOpenW] = useState(false);
  const [readW] = useState(() => keep<string>("usWelcome"));
  const short = !!f && !guide && !openW && readW === f.welcome;
  useEffect(() => {
    if (f && !guide) keep("usWelcome", f.welcome);
  }, [f?.welcome, guide]);
  usePics(items.flatMap((m) => [m.pic, ...(m.ppl ?? []).map((p) => p.pic)]).slice(0, 40));

  const done = () => {
    keep("usGuide", true);
    setGuide(false);
    setStep(0);
    sound("level");
  };
  const clap = (m: UsItem) => {
    if (mine.includes(m.id)) return;
    buzz();
    sound("pop");
    const next = [m.id, ...mine].slice(0, 200);
    setMine(next);
    keep("usClapped", next);
    if (f) set({ ...f, items: f.items.map((x) => (x.id === m.id ? { ...x, c: x.c + 1 } : x)) });
    mutation("us:clap", { id: m.id })
      .then((r) => {
        const c = (r as { c: number }).c;
        const now = keep<UsFeed>("us");
        if (now) set({ ...now, items: now.items.map((x) => (x.id === m.id ? { ...x, c } : x)) });
      })
      .catch((e) => toast(problemWords(e), true));
  };

  const today = f?.today ?? 0;
  const now = Date.now();
  let lastDay = "";
  return (
    <>
      <header class="f-hero us">
        {props.top}
        <div class="f-hero-in">
          <div class="f-hero-w">
            <p class="f-kicker">ARISTORA · நாம்</p>
            <h1 class="f-title">Us</h1>
            <p class="f-hsub">{today > 0 ? `🔥 இன்று ${today} பேர் கற்றார்கள்` : "இன்று முதலாவதாகக் கற்பவர் நீயா?"}</p>
          </div>
          <OwlBadge mood="wave" class="hero" />
        </div>
        <button
          type="button"
          class="f-us-help"
          aria-label="How Us works"
          onClick={() => {
            buzz();
            setStep(0);
            setGuide(true);
          }}
        >
          ?
        </button>
      </header>
      {t && !guide && t.head}
      {guide && (
        <section class="f-card f-us-guide rise" aria-label="How Us works">
          <Owl mood={G[step].mood} class="mid" />
          <h2>{G[step].h}</h2>
          <p>{G[step].p}</p>
          <div class="f-us-dots" aria-hidden="true">
            {G.map((_, i) => (
              <i key={i} class={i === step ? "on" : ""} />
            ))}
          </div>
          <button
            type="button"
            class="f-btn go"
            onClick={() => {
              buzz();
              if (step < G.length - 1) {
                sound("tap");
                setStep(step + 1);
              } else done();
            }}
          >
            {step < G.length - 1 ? "அடுத்து" : "தொடங்கு!"}
          </button>
        </section>
      )}
      {!guide && f?.welcome && (
        // His welcome: whole the first time (and whenever he changes it), then two lines; a tap shows it all again.
        <section
          class={`f-card f-us-welcome rise${short ? " short" : ""}`}
          onClick={() => {
            if (!short) return;
            buzz();
            setOpenW(true);
          }}
        >
          <p>{f.welcome}</p>
          {short && <span class="f-us-more">மேலும் ›</span>}
        </section>
      )}
      {!guide && f && (
        <div class="f-us-bar">
          {!t && (
            <button
              type="button"
              class="f-btn go f-us-ask"
              onClick={() => showSheet((close) => <DoubtSheet grade={props.me?.grade ?? null} onClose={close} onDone={own.read} />)}
            >
              🙋 Ask a doubt
            </button>
          )}
          <div class="f-us-fl" role="group" aria-label="Show">
            {(
              [
                ["all", "All"],
                ["q", "❓ Questions"],
                ["ask", "🙋 Doubts"],
                ...(t ? [["todo", `⚑ To do${todoN ? ` · ${todoN}` : ""}`]] : []),
              ] as [Show, string][]
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                class={show === k ? "on" : ""}
                aria-pressed={show === k}
                onClick={() => {
                  buzz();
                  setShow(k);
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      )}
      {!f && !err && <Waiting />}
      {err && !f && <p class="f-lead f-center-t">{err}</p>}
      {!guide && f && (
        <ol class="f-us-list">
          {items.flatMap((m) => {
            const d = dayWords(m.at, now);
            const head = d !== lastDay && !m.pin;
            if (head) lastDay = d;
            const line = <Line key={m.id} m={m} done={mine.includes(m.id)} onClap={() => clap(m)} onPlay={props.onPlay} onMate={mate} onOpen={props.onOpen} act={t?.act} staff={!!t} />;
            return head ? [<li key={`d.${d}`} class="f-us-day">{d}</li>, line] : [line];
          })}
        </ol>
      )}
      {!guide && f && t && t.end}
      {!guide && f && show !== "all" && !items.length && <p class="f-ut-none">{show === "q" ? "இப்போது கேள்விகள் இல்லை." : show === "ask" ? "இப்போது சந்தேகங்கள் இல்லை." : "Nothing waiting for you. 👏"}</p>}
      {!guide && f && !t && (
        <section class="f-us-end rise">
          <Owl mood={items.length ? "happy" : "think"} class="tiny" />
          <p>
            {items.length
              ? "இன்றைய செய்திகள் இவ்வளவுதான். ஒரு Level செய்: நாளை நீயும் இங்கே வருவாய்!"
              : "இன்னும் எதுவும் இல்லை. முதல் Level செய்தால், ஆந்தை உன்னைப் பற்றி இங்கே சொல்லும்!"}
          </p>
          <button type="button" class="f-btn gold" onClick={props.onPlay}>
            ▶ Continue
          </button>
        </section>
      )}
    </>
  );
}

function Name(props: { id?: string; n: string; g?: number; onMate: (id: string) => void }) {
  return (
    <>
      <b
        class={props.id ? "f-us-n tap" : "f-us-n"}
        onClick={
          props.id
            ? (e) => {
                e.stopPropagation();
                props.onMate(props.id!);
              }
            : undefined
        }
      >
        {props.n}
      </b>
      {props.g !== undefined && <i class="f-gchip">{props.g}</i>}
    </>
  );
}

/** Several students in one line (the champions, the most improved), each a tap to his profile. */
function People(props: { m: UsItem; onMate: (id: string) => void }) {
  const list = props.m.ppl ?? [];
  return (
    <>
      {list.map((p, i) => (
        <span key={p.sid} class="f-us-p">
          {i > 0 && ", "}
          {props.m.k === "champs" && (p.a ? "🏆 " : "👑 ")}
          <Name id={p.sid} n={p.n} g={p.g} onMate={props.onMate} />
        </span>
      ))}
    </>
  );
}

function say(m: UsItem, onMate: (id: string) => void): ComponentChildren {
  const n = m.n ? <Name id={m.sid} n={m.n} g={m.g} onMate={onMate} /> : null;
  switch (m.k) {
    case "bday":
      return <>இன்று {n} இன் பிறந்தநாள்! வாழ்த்துவோம்.</>;
    case "home1":
      return <>{n} வீட்டிலிருந்தும் கற்கத் தொடங்கினார்: phone இல் முதல் Level! வரவேற்போம்.</>;
    case "back":
      return <>{n} மீண்டும் வகுப்புக்கு வந்துவிட்டார்! வரவேற்போம்.</>;
    case "stage":
      return (
        <>
          {n} {m.x !== undefined ? `Stage ${m.x} · ` : ""}
          {m.t} முழுவதும் முடித்தார்! பாராட்டுவோம்.
        </>
      );
    case "flame":
      return <>{n} தொடர்ந்து {m.x} நாட்கள் கற்றார்! பாராட்டுவோம்.</>;
    case "up":
      return (
        <>
          <b class="f-us-by">இந்த வாரம் மிக அதிகம் முன்னேறியவர்கள் 🚀</b>
          <People m={m} onMate={onMate} />
        </>
      );
    case "champs":
      return (
        <>
          <b class="f-us-by">கடந்த வார champions 👑</b>
          <People m={m} onMate={onMate} />
        </>
      );
    case "count":
      return (
        <>
          நேற்று <b>{m.x}</b> பேர் கற்றார்கள். இன்று இன்னும் அதிகம் பேர்?
        </>
      );
    case "shout":
      return (
        <>
          <b class="f-us-by">{m.by} ஆசிரியரின் shout-out</b>
          {n} {WHY_TA[m.t ?? ""] ?? ""}
        </>
      );
    case "post":
      return (
        <>
          <b class="f-us-by">
            {m.by} ஆசிரியர் · {gradesWords(m.gs)}
          </b>
          {m.t && <span class="f-us-post">{m.t}</span>}
        </>
      );
    case "ask":
      return (
        <>
          <b class="f-us-by">
            {m.mine ? `உன் சந்தேகம் · ${AUD[m.aud ?? "t"]}` : m.n ? `${m.n} · Grade ${m.g ?? "?"} · ${AUD[m.aud ?? "t"]}` : `Grade ${m.g ?? "?"} மாணவர் ஒருவர் கேட்கிறார்`}
          </b>
          {m.t && <span class="f-us-post">{m.t}</span>}
        </>
      );
  }
}

/** Under a question or a doubt: how many answered (and his answer), or the replies; its button opens it. */
function Foot(props: { m: UsItem; staff: boolean; onOpen: () => void }) {
  const m = props.m;
  const n = m.an ?? 0;
  const q = !!m.qn;
  const said = q
    ? props.staff
      ? `${n} answers · ✓ ${m.okN ?? 0} · waiting ${m.wN ?? 0}`
      : m.my === "ok"
        ? "✓ உன் விடை சரி!"
        : m.my === "no"
          ? "உன் விடை பார்க்கப்பட்டது"
          : m.my === "w"
            ? "⏳ உன் விடை போனது"
            : n
              ? `${n} பேர் விடை அனுப்பினார்கள்`
              : "முதல் விடை உன்னுடையதா?"
    : `💬 ${n} ${n === 1 ? "பதில்" : "பதில்கள்"}${props.staff && m.rp ? ` · ⚑ ${m.rp}` : ""}`;
  const go = q ? (props.staff ? "Mark ›" : m.my ? "See ›" : "✍️ Answer") : props.staff ? "Reply ›" : m.mine ? "Open ›" : "💬 Help";
  return (
    <div class={`f-us-foot${m.my === "ok" ? " ok" : ""}`}>
      <small>{said}</small>
      <button
        type="button"
        class={`f-us-open${!m.my && !m.mine && !props.staff ? " go" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          props.onOpen();
        }}
      >
        {go}
      </button>
    </div>
  );
}

function Line(props: {
  m: UsItem;
  done: boolean;
  onClap: () => void;
  onPlay: () => void;
  onMate: (id: string) => void;
  onOpen: (id: string) => void;
  act?: (m: UsItem) => ComponentChildren;
  staff: boolean;
}) {
  const m = props.m;
  const ask = ASK[m.k] ?? "👏";
  const pic = m.k === "post" || m.k === "count" || m.ppl ? null : picOf(m.pic);
  // A question or a doubt opens (a tap anywhere on it); its own button says what to do there.
  const opens = !!m.qn || m.k === "ask";
  const open = () => {
    buzz();
    sound("tap");
    props.onOpen(m.id);
  };
  return (
    <li class={`f-us-line k-${m.k}${m.mine ? " mine" : ""}${m.pin ? " pin" : ""}${opens ? " opens" : ""}`} onClick={opens ? open : undefined}>
      <span class="f-us-ic">
        {m.n && m.k !== "post" ? <Avatar name={m.n} size="s" pic={pic} /> : <span class="f-us-emo">{MARK[m.k]}</span>}
        {m.n && m.k !== "post" && <i class="f-us-mark">{MARK[m.k]}</i>}
      </span>
      <div class="f-us-w">
        <p>{say(m, props.onMate)}</p>
        {m.ph && <Pics ph={m.ph} />}
        {opens && <Foot m={m} staff={props.staff} onOpen={open} />}
        <small>
          {m.pin ? "📌 " : ""}
          {timeOf(m.at)}
          {m.tc?.length ? <span class="f-us-tc"> · 👏 {m.tc.join(", ")} ஆசிரியர்</span> : null}
          {m.mine && m.c > 0 ? <span> · {m.cn?.length ? `${m.cn.join(", ")}${m.c > m.cn.length ? ` +${m.c - m.cn.length}` : ""}` : ""}</span> : null}
        </small>
      </div>
      {props.act ? (
        <span onClick={(e) => e.stopPropagation()}>{props.act(m)}</span>
      ) : opens ? null : m.k === "count" ? (
        <button type="button" class="f-us-go" onClick={props.onPlay}>
          ▶ இன்று நானும்
        </button>
      ) : m.mine ? (
        <span class="f-us-you" aria-label={`${m.c} cheered`}>
          <i>உனக்கு</i>
          {m.c > 0 ? `${ask} ${m.c}` : MARK[m.k]}
        </span>
      ) : (
        <button
          type="button"
          class={`f-us-clap${props.done ? " done" : ""}`}
          aria-pressed={props.done}
          aria-label={`${ask} ${m.c}`}
          onClick={props.onClap}
        >
          {ask}
          <b>{m.c > 0 ? m.c : ""}</b>
        </button>
      )}
    </li>
  );
}
