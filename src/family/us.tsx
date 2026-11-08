// Us, the students' community (7 Nov 2026, his voice notes: "the app is not feel like a community"; "students don't
// know how to use this community ... we have to give the hint ... how this is want to feel"). One tab, between Learn
// and the Race, once the owner opens it (Settings → Community):
// - the owl's guide the first time (three cards), again from the ? in the header; the owner's welcome; how many of
//   ARISTORA learned today;
// - the lines: the owl's (a birthday, a first level from home, back in class, a Stage finished, days in a row, the
//   week's most improved and champions, yesterday's count), the teachers' (a shout-out, a post, a question) and the
//   students' (a doubt, a 💡 post);
// - the end of the list sends him to learn: the community is never the place he stays.
// 8 Nov 2026 (his voice note: "if I go to inside any thread, that feel like boring ... who appreciating, who correcting
// ... student can chat inside each thread"): every line is a card that opens into its thread (usPost.tsx): a face, a
// name, what it is and when; its one tap (🎂 👋 👏 🙏); 💬 its talk with the faces of the last who wrote; a dot on what
// came alive since he last looked. The liveliest first. On top, what he can write: 💡 what he learned, 🙋 a doubt.
// The words are Tamil; the game words English.

import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { FamilyMe } from "../../convex/family";
import type { UsFeed } from "../../convex/us";
import type { UsItem } from "../../convex/lib/us";
import { DAY_EN, MONTH } from "./home";
import { keep, mutation, query } from "./net";
import { picOf, usePics } from "./pics";
import { buzz, sound } from "./sound";
import { Avatar, Icon, Owl, OwlBadge, problemWords, showSheet, toast, useOwlTap, Waiting, type Mood } from "./ui";
import { useChatParts } from "./later";
import { AUD, DoubtSheet, gradesWords, LearnSheet, Pics } from "./usPost";

/** A shout-out's reason, in his words (convex/lib/us.ts SHOUT_WHY: the phone keeps its own copy, see family.ts). */
export const WHY_TA: Record<string, string> = {
  try: "எப்போதும் விடாமுயற்சி!",
  help: "நண்பருக்கு உதவினார்!",
  work: "அழகான, தெளிவான working!",
  up: "பெரிய முன்னேற்றம்!",
  focus: "வகுப்பில் முழுக் கவனம்!",
  ask: "அருமையான கேள்வி கேட்டார்!",
};

/** What a line asks for: its button. */
export const ASK: Partial<Record<UsItem["k"], string>> = { bday: "🎂", home1: "👋", back: "👋", post: "🙏" };
/** The small mark on a line's picture. */
export const MARK: Record<UsItem["k"], string> = {
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
  learn: "💡",
};
/** What a line is, in a word or two (under the name). */
export const KIND: Record<UsItem["k"], string> = {
  bday: "பிறந்தநாள்",
  home1: "வீட்டிலிருந்து முதல் Level",
  back: "மீண்டும் வகுப்பில்",
  stage: "Stage முடிவு",
  flame: "தொடர்ந்து கற்றல்",
  up: "Most improved",
  champs: "Champions",
  count: "கற்றவர்கள்",
  post: "அறிவிப்பு",
  shout: "Shout-out",
  ask: "சந்தேகம்",
  learn: "நான் கற்றது",
};

const GUIDE: { mood: Mood; h: string; p: string }[] = [
  {
    mood: "wave",
    h: "இது Us: நம்ம ARISTORA",
    p: "இங்கே எல்லா மாணவர்களும் ஆசிரியர்களும் ஒன்றாக. ஒருவரின் வெற்றி, நம் எல்லோருடைய மகிழ்ச்சி.",
  },
  {
    mood: "cheer",
    h: "தொடு, திற, எழுது",
    p: "🎂 👋 👏 ஒரு தொடுகை போதும். ஒவ்வொரு வரியையும் திறந்து பேசு: உன் சொந்த வார்த்தைகளுக்கு +1 XP. ❓ ஆசிரியரின் கேள்விக்கு உன் விடை: வேறு யாருக்கும் தெரியாது.",
  },
  {
    mood: "love",
    h: "நீயும் இங்கே வருவாய்",
    p: "💡 இன்று கற்றதைப் பகிர்: ஆசிரியர் ✓ கொடுத்ததும் எல்லோருக்கும், +5 XP. 🙋 புரியவில்லையா? சந்தேகம் கேள். Level செய்யும்போதும் ஆந்தை உன்னைப் பற்றி இங்கே சொல்லும்.",
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

/** What the chips show: everything, the teachers' questions, the doubts, the 💡 posts, the wins, the teachers' lines;
 * a teacher's to-do (answers to mark, doubts no teacher answered, 💡 posts waiting, reports). */
type Show = "all" | "q" | "ask" | "learn" | "win" | "tch" | "todo";
const WINS = new Set<UsItem["k"]>(["bday", "home1", "back", "stage", "flame", "up", "champs", "count"]);
const todo = (m: UsItem) =>
  (m.wN ?? 0) > 0 || (m.k === "ask" && !m.tr && (m.aud !== "s" || !m.an)) || (m.rp ?? 0) > 0 || (m.rpm ?? 0) > 0 || (m.k === "learn" && m.lst === "w");
const shows: Record<Show, (m: UsItem) => boolean> = {
  all: () => true,
  q: (m) => !!m.qn,
  ask: (m) => m.k === "ask",
  learn: (m) => m.k === "learn",
  win: (m) => WINS.has(m.k) || m.k === "shout",
  tch: (m) => m.k === "post" || m.k === "shout",
  todo,
};

/** When a line came, as he reads it: "now", "5m", "2h", "Yesterday", "Mon 2 Nov" (Sri Lanka's days). */
export function ago(t: number, now = Date.now()): string {
  const SL = 330 * 60_000;
  const day = (x: number) => Math.floor((x + SL) / 86_400_000);
  const m = Math.floor((now - t) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const d = day(now) - day(t);
  if (d === 0) return `${Math.floor(m / 60)}h`;
  if (d === 1) return "Yesterday";
  const x = new Date(t + SL);
  return `${DAY_EN[(x.getUTCDay() + 6) % 7]} ${x.getUTCDate()} ${MONTH[x.getUTCMonth()]}`;
}

/** When a line last came alive (the last thing written in it). */
const liveAt = (m: UsItem) => Math.max(m.la ?? 0, m.at);

/** Lines opened on this phone (kept per child): when each was last opened. The newest 200. */
export function seenAt(id: string): number {
  return keep<Record<string, number>>("usSeen")?.[id] ?? 0;
}
export function markSeen(id: string): void {
  const all = keep<Record<string, number>>("usSeen") ?? {};
  all[id] = Date.now();
  const keys = Object.keys(all);
  if (keys.length > 200) for (const k of keys.sort((a, b) => all[a] - all[b]).slice(0, keys.length - 200)) delete all[k];
  keep("usSeen", all);
}

export function UsTab(props: {
  top: ComponentChildren;
  me: FamilyMe | null;
  onPlay: () => void;
  onMate: (id: string) => void;
  onMe: () => void;
  /** A line opened (usPost.tsx ThreadScreen). */
  onOpen: (id: string) => void;
  /** Groups and private chats (8 Nov 2026): a chat opened, the Members page, the owner's every chat. */
  onRoom?: (id: string) => void;
  onPeople?: () => void;
  onAll?: () => void;
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
  // What came alive since his last visit gets a dot (until he opens it); a first visit marks nothing.
  const [since] = useState(() => keep<number>("usLast") ?? Date.now());
  useEffect(() => {
    keep("usLast", Date.now());
  }, []);
  // What's new in Us (8 Nov 2026: groups, chats, replies, tags, reactions), told once to everyone who saw the guide before.
  const [news, setNews] = useState(() => !t && !!keep<boolean>("usGuide") && !keep<boolean>("usNews2"));
  // Feed, Groups or Chats (8 Nov 2026): the last one he looked at.
  const [seg, setSeg] = useState<"feed" | "g" | "d">(() => (props.onRoom ? (keep<"feed" | "g" | "d">("usSeg") ?? "feed") : "feed"));
  const cp = useChatParts(seg !== "feed");
  const feed = seg === "feed";
  const cn = props.me?.chat;
  const all = f?.items ?? [];
  const items = all.filter(shows[show]);
  const todoN = t ? all.filter(todo).length : 0;
  // His welcome is read once whole (kept: the words he read); after that two lines until a tap.
  const [openW, setOpenW] = useState(false);
  const [readW] = useState(() => keep<string>("usWelcome"));
  const short = !!f && !guide && !openW && readW === f.welcome;
  useEffect(() => {
    if (f && !guide) keep("usWelcome", f.welcome);
  }, [f?.welcome, guide]);
  usePics([props.me?.photo?.key, ...items.flatMap((m) => [m.pic, m.bp, ...(m.ppl ?? []).map((p) => p.pic), ...(m.lp ?? []).map((p) => p.pic)])].slice(0, 50));

  const done = () => {
    keep("usGuide", true);
    keep("usNews2", true);
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
  const open = (id: string) => {
    buzz();
    sound("tap");
    markSeen(id);
    props.onOpen(id);
  };
  const write = (k: "learn" | "ask") =>
    k === "learn"
      ? showSheet((close) => <LearnSheet onClose={close} onDone={own.read} />)
      : showSheet((close) => <DoubtSheet grade={props.me?.grade ?? null} onClose={close} onDone={own.read} />);

  const today = f?.today ?? 0;
  const now = Date.now();
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
      {props.onRoom && !guide && (
        <div class="f-us-seg" role="tablist" aria-label="Us">
          {(
            [
              ["feed", "📰 Feed", 0],
              ["g", "👥 Groups", cn?.g ?? 0],
              ["d", "💬 Chats", cn?.d ?? 0],
            ] as const
          ).map(([k, l, n]) => (
            <button
              key={k}
              type="button"
              role="tab"
              class={seg === k ? "on" : ""}
              aria-selected={seg === k}
              onClick={() => {
                buzz();
                sound("tap");
                setSeg(k);
                keep("usSeg", k);
              }}
            >
              {l}
              {n ? <i>{n}</i> : null}
            </button>
          ))}
        </div>
      )}
      {!guide && !feed && (cp ? <cp.ChatList kind={seg === "g" ? "g" : "d"} staff={!!t} onRoom={props.onRoom!} onPeople={props.onPeople!} onAll={props.onAll} /> : <Waiting />)}
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
      {!guide && feed && news && (
        <section class="f-card f-us-news rise" aria-label="New in Us">
          <b>🆕 Groups 👥 · Chats 💬</b>
          <p>உன் grade குழுவில் எல்லோருடனும் பேசு; ஆசிரியர்களுக்கு நேரடியாக message செய். ஒரு message ஐ வலப்பக்கம் இழு: பதில் ↩. அழுத்திப் பிடி: 😂 ❤️ 🔥. @ பெயர்: tag. கேள்விகளின் விடைகள் இப்போது மங்கலாகத் தெரியும்: உன் விடையை அனுப்பு, திறக்கும்!</p>
          <button
            type="button"
            class="f-btn go"
            onClick={() => {
              buzz();
              keep("usNews2", true);
              setNews(false);
            }}
          >
            சரி!
          </button>
        </section>
      )}
      {!guide && feed && f?.welcome && (
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
      {!guide && feed && f && (
        <div class="f-us-bar">
          {!t && (
            // What he can write (8 Nov 2026): 💡 what he learned (a teacher shows it to everyone), 🙋 a doubt.
            <div class="f-us-write">
              <button type="button" class="f-us-say" onClick={() => write("learn")}>
                <Avatar name={props.me?.name ?? "?"} size="s" pic={picOf(props.me?.photo?.key)} />
                <span>💡 இன்று என்ன கற்றாய்? பகிர்…</span>
              </button>
              <button type="button" class="f-us-askb" aria-label="Ask a doubt" onClick={() => write("ask")}>
                🙋
                <small>கேள்</small>
              </button>
            </div>
          )}
          <div class="f-us-fl" role="group" aria-label="Show">
            {(
              [
                ["all", "All"],
                ["q", "❓ Questions"],
                ["ask", "🙋 Doubts"],
                ["learn", "💡 Learned"],
                ["win", "🎉 Wins"],
                ["tch", "📣 Teachers"],
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
      {feed && !f && !err && <Waiting />}
      {feed && err && !f && <p class="f-lead f-center-t">{err}</p>}
      {!guide && feed && f && (
        <ol class="f-us-list">
          {items.map((m) => (
            <Card
              key={m.id}
              m={m}
              now={now}
              fresh={!t && !m.mine && liveAt(m) > Math.max(since, seenAt(m.id))}
              done={mine.includes(m.id)}
              onClap={() => clap(m)}
              onPlay={props.onPlay}
              onMate={mate}
              onOpen={() => open(m.id)}
              act={t?.act}
              staff={!!t}
            />
          ))}
        </ol>
      )}
      {!guide && feed && f && t && t.end}
      {!guide && feed && f && show !== "all" && !items.length && (
        <p class="f-ut-none">
          {show === "q"
            ? "இப்போது கேள்விகள் இல்லை."
            : show === "ask"
              ? "இப்போது சந்தேகங்கள் இல்லை."
              : show === "learn"
                ? "இன்னும் 💡 பதிவுகள் இல்லை. முதலாவது உன்னுடையதா?"
                : show === "todo"
                  ? "Nothing waiting for you. 👏"
                  : "இப்போது எதுவும் இல்லை."}
        </p>
      )}
      {!guide && feed && f && !t && (
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

export function Name(props: { id?: string; n: string; g?: number; onMate: (id: string) => void }) {
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

/** A line's words (Tamil), as the card and its thread show them. */
export function say(m: UsItem, onMate: (id: string) => void): ComponentChildren {
  const n = m.n ? <Name id={m.sid} n={m.n} onMate={onMate} /> : null;
  switch (m.k) {
    case "bday":
      return <>இன்று {n} இன் பிறந்தநாள்! வாழ்த்துவோம்.</>;
    case "home1":
      return <>{n} வீட்டிலிருந்தும் கற்கத் தொடங்கினார்: phone இல் முதல் Level! வரவேற்போம்.</>;
    case "back":
      return <>{n} மீண்டும் வகுப்புக்கு வந்துவிட்டார்! வரவேற்போம்.</>;
    case "stage":
      return <>{n} இந்த Stage ஐ முழுவதும் முடித்தார்! பாராட்டுவோம்.</>;
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
          {n} {WHY_TA[m.t ?? ""] ?? ""}
        </>
      );
    case "post":
    case "ask":
    case "learn":
      return m.t ? <span class="f-us-post">{m.t}</span> : null;
  }
}

/**
 * The lines the owl writes by itself (8 Nov 2026, his voice note: "for the automatic message, we can use the owl ...
 * that is want to feel like that's come from owl instead from organization ... based on the automatic post that will
 * look different"): the owl is their author, in the mood of the moment; the student is in the words, with his face.
 */
const OWL_MOOD: Partial<Record<UsItem["k"], Mood>> = {
  bday: "party",
  home1: "star",
  back: "wave",
  stage: "cheer",
  flame: "cool",
  up: "strong",
  champs: "champ",
  count: "happy",
};
/** The owl's name on its lines. */
export const OWL_NAME = "ஆந்தை";
export const byOwl = (m: Pick<UsItem, "k">) => OWL_MOOD[m.k] !== undefined;

/** Who a card is from (its first row): the owl, a teacher (a post, a shout-out), a student, the asker of a doubt (never named). */
export function Who(props: { m: UsItem; onMate: (id: string) => void }) {
  const m = props.m;
  if (byOwl(m)) return <b class="f-us-n owl">{OWL_NAME}</b>;
  if (m.k === "post" || m.k === "shout") return <b class="f-us-n">{m.by} ஆசிரியர்</b>;
  if (m.k === "ask") {
    // The one who asked is never named to students (teachers see the name).
    if (m.mine) return <b class="f-us-n">உன் சந்தேகம்</b>;
    return m.n ? <Name id={m.sid} n={m.n} g={m.g} onMate={props.onMate} /> : <b class="f-us-n">Grade {m.g ?? "?"} மாணவர்</b>;
  }
  if (m.n) return <Name id={m.sid} n={m.n} g={m.g} onMate={props.onMate} />;
  return <b class="f-us-n owl">{OWL_NAME}</b>;
}

/** The owl as a line's face: its mood; a tap makes it react (its sounds), never opens the line. */
function OwlFace(props: { mood: Mood }) {
  const [mood, tap] = useOwlTap(props.mood);
  return (
    <span
      class="f-uk-owl"
      role="button"
      aria-label={OWL_NAME}
      onClick={(e) => {
        e.stopPropagation();
        tap();
      }}
    >
      <Owl mood={mood} key={mood} still />
    </span>
  );
}

/** A face a tap opens: a student's = his profile (8 Nov 2026, his ask: "by pressing that, that will open that student's profile"). */
export function Tap(props: { id?: string; onMate?: (id: string) => void; children: ComponentChildren }) {
  if (!props.id || !props.onMate) return <>{props.children}</>;
  return (
    <span
      class="f-tapface"
      role="button"
      aria-label="Profile"
      onClick={(e) => {
        e.stopPropagation();
        buzz();
        props.onMate!(props.id!);
      }}
    >
      {props.children}
    </span>
  );
}

/** The card's face: the owl's (in its mood), a teacher's (her photo or letter), a student's (a tap: his profile) with the line's mark. */
export function Face(props: { m: UsItem; size?: "s" | "m"; onMate?: (id: string) => void }) {
  const m = props.m;
  const size = props.size === "s" ? "s" : "m";
  const mood = OWL_MOOD[m.k];
  if (mood) {
    return (
      <span class={`f-uk-face${props.size === "s" ? " s" : ""}`}>
        <OwlFace mood={mood} />
      </span>
    );
  }
  const teacher = m.k === "post" || m.k === "shout";
  const person = !teacher && !!m.n;
  return (
    <span class={`f-uk-face${props.size === "s" ? " s" : ""}`}>
      {teacher ? (
        <Avatar name={m.by ?? "?"} size={size} pic={picOf(m.bp)} />
      ) : person ? (
        <Tap id={m.sid} onMate={props.onMate}>
          <Avatar name={m.n!} size={size} pic={picOf(m.pic)} />
        </Tap>
      ) : (
        <span class={`f-uk-emo k-${m.k}`}>{m.k === "ask" ? "🙋" : "🦉"}</span>
      )}
      {(person || teacher) && <i class="f-uk-mark">{m.spot ? "🔍" : m.qn ? "❓" : MARK[m.k]}</i>}
    </span>
  );
}

/** The owl's words about one student (or a teacher's shout-out): his face first (a tap: his profile), then the words. */
function About(props: { m: UsItem; onMate: (id: string) => void }) {
  const m = props.m;
  return (
    <p class="f-uk-about">
      <Tap id={m.sid} onMate={props.onMate}>
        <Avatar name={m.n!} size="s" pic={picOf(m.pic)} />
      </Tap>
      <span>{say(m, props.onMate)}</span>
    </p>
  );
}

/** A line's words: the owl's and shout-outs' with his face; a find-the-mistake's three parts; a post's, a doubt's, a 💡's own. */
export function LineWords(props: { m: UsItem; onMate: (id: string) => void }) {
  const m = props.m;
  if (m.spot) return <SpotBody m={m} />;
  if (m.k === "post" || m.k === "ask" || m.k === "learn") return m.t ? <p class="f-us-post">{m.t}</p> : null;
  if (m.n && !m.ppl && (byOwl(m) || m.k === "shout")) return <About m={m} onMate={props.onMate} />;
  return <p>{say(m, props.onMate)}</p>;
}

/**
 * "Find the mistake" (8 Nov 2026): a teacher's words, the question it came from (its words and photos, small), and a
 * student's answer with no name: its words and its photos (`ph`: shown here, not under the words).
 */
export function SpotBody(props: { m: UsItem }) {
  const m = props.m;
  return (
    <>
      {m.t && <p class="f-us-post">{m.t}</p>}
      {m.sq && (m.sq.t || m.sq.ph) && (
        <div class="f-spot-q">
          <b>❓ கேள்வி</b>
          {m.sq.t && <p>{m.sq.t}</p>}
          {m.sq.ph && <Pics ph={m.sq.ph} />}
        </div>
      )}
      <div class="f-spot-a">
        <b>📝 ஒரு மாணவரின் விடை</b>
        {m.sw && <p>{m.sw}</p>}
        {m.ph && <Pics ph={m.ph} />}
      </div>
    </>
  );
}

/** What it is and when, under the name ("🏁 Stage முடிவு · 2h", "❓ கேள்வி · Grade 8 · now"). */
function What(props: { m: UsItem; now: number }) {
  const m = props.m;
  const kind = m.spot
    ? "🔍 தவறைக் கண்டுபிடி"
    : m.qn
      ? "❓ கேள்வி"
      : m.k === "post"
        ? `📣 ${gradesWords(m.gs)}`
        : m.k === "ask"
          ? `🙋 ${AUD[m.aud ?? "t"]}`
          : `${MARK[m.k]} ${KIND[m.k]}`;
  return (
    <small class="f-uk-what">
      {m.pin ? "📌 " : ""}
      {kind}
      {m.qn && m.gs ? ` · ${gradesWords(m.gs)}` : ""} · {ago(m.at, props.now)}
    </small>
  );
}

/** Faces of the last who wrote in a thread (on a question only once he answered). */
export function Faces(props: { lp?: UsItem["lp"]; max?: number }) {
  const list = (props.lp ?? []).slice(0, props.max ?? 3);
  if (!list.length) return null;
  return (
    <span class="f-uk-faces" aria-hidden="true">
      {list.map((p, i) => (
        <span key={i} class={p.tch ? "tch" : ""}>
          <Avatar name={p.n} size="s" pic={picOf(p.pic)} />
        </span>
      ))}
    </span>
  );
}

/** The line's own state on a question, a doubt or a 💡 post (his answer, replies, a teacher's ✓). */
function State(props: { m: UsItem; staff: boolean }) {
  const m = props.m;
  if (m.qn) {
    const n = m.an ?? 0;
    const said = props.staff
      ? `${n} answers · ✓ ${m.okN ?? 0} · waiting ${m.wN ?? 0}`
      : m.my === "ok"
        ? "✓ உன் விடை சரி!"
        : m.my === "no"
          ? "உன் விடை பார்க்கப்பட்டது"
          : m.my === "w"
            ? "⏳ உன் விடை போனது"
            : n
              ? `${n} பேர் விடை அனுப்பினார்கள்`
              : "முதல் விடை உன்னுடையதா?";
    return <p class={`f-uk-state${m.my === "ok" ? " ok" : ""}`}>{said}</p>;
  }
  if (m.k === "learn" && (m.mine || props.staff)) {
    if (m.lst === "w") return <p class="f-uk-state wait">⏳ ஆசிரியர் ✓ கொடுத்ததும் எல்லோருக்கும் தெரியும்</p>;
    if (m.lst === "no") return <p class="f-uk-state no">இந்த முறை இல்லை{m.note ? `: ${m.note}` : ""}</p>;
  }
  if (m.k === "learn" && m.lst === "ok" && m.by) return <p class="f-uk-state ok">✓ {m.by} ஆசிரியர் காட்டினார்</p>;
  return null;
}

function Card(props: {
  m: UsItem;
  now: number;
  fresh: boolean;
  done: boolean;
  onClap: () => void;
  onPlay: () => void;
  onMate: (id: string) => void;
  onOpen: () => void;
  act?: (m: UsItem) => ComponentChildren;
  staff: boolean;
}) {
  const m = props.m;
  const ask = ASK[m.k] ?? "👏";
  const talkN = m.k === "ask" ? (m.an ?? 0) : (m.cm ?? 0);
  // A question's talk opens with his answer (the server sends no faces before it).
  const locked = !!m.qn && !m.my && !props.staff;
  const stop = (f: () => void) => (e: Event) => {
    e.stopPropagation();
    f();
  };
  const go = m.qn
    ? props.staff
      ? "Mark ›"
      : m.my
        ? null
        : m.spot
          ? "🔍 கண்டுபிடி"
          : "✍️ Answer"
    : m.k === "ask"
      ? props.staff
        ? "Reply ›"
        : m.mine
          ? null
          : "💬 Help"
      : m.k === "learn" && props.staff && m.lst === "w"
        ? "Check ›"
        : m.k === "count" && !props.staff
          ? "▶ இன்று நானும்"
          : null;
  return (
    <li class={`f-uk k-${m.k}${m.mine ? " mine" : ""}${m.pin ? " pin" : ""}${props.fresh ? " fresh" : ""}`} onClick={props.onOpen}>
      <div class="f-uk-h">
        <Face m={m} onMate={props.onMate} />
        <div class="f-uk-who">
          <p>
            <Who m={m} onMate={props.onMate} />
          </p>
          <What m={m} now={props.now} />
        </div>
        {props.fresh && <i class="f-uk-new" aria-label="New" />}
      </div>
      {m.k === "stage" || m.k === "flame" ? (
        <p class="f-uk-win">
          {m.k === "stage" ? `🏁 Stage ${m.x ?? ""}` : `🔥 ${m.x}`}
          <small>{m.k === "stage" ? m.t : "நாட்கள்"}</small>
        </p>
      ) : null}
      <div class="f-uk-b">
        <LineWords m={m} onMate={props.onMate} />
        {m.ph && !m.spot && <Pics ph={m.ph} />}
        <State m={m} staff={props.staff} />
      </div>
      <div class="f-uk-f">
        {props.act ? (
          <span onClick={(e) => e.stopPropagation()}>{props.act(m)}</span>
        ) : m.k === "count" || m.k === "ask" || m.qn ? null : m.mine ? (
          <span class="f-us-you" aria-label={`${m.c} cheered`}>
            <i>உனக்கு</i>
            {m.c > 0 ? `${ask} ${m.c}` : MARK[m.k]}
          </span>
        ) : (
          <button type="button" class={`f-us-clap${props.done ? " done" : ""}`} aria-pressed={props.done} aria-label={`${ask} ${m.c}`} onClick={stop(props.onClap)}>
            {ask}
            <b>{m.c > 0 ? m.c : ""}</b>
          </button>
        )}
        <button type="button" class="f-uk-talk" aria-label={`Talk: ${talkN}`} onClick={stop(props.onOpen)}>
          {locked ? <Icon name="lock" size={16} /> : <Icon name="chat" size={18} />}
          <b>{talkN || ""}</b>
        </button>
        {!locked && <Faces lp={m.lp} />}
        {m.tc?.length ? <small class="f-uk-tc">👏 {m.tc.map((x) => `${x} ஆசிரியர்`).join(", ")}</small> : null}
        <span class="f-sp" />
        {go && (
          <button type="button" class={`f-us-open${props.staff ? "" : " go"}`} onClick={stop(m.k === "count" ? props.onPlay : props.onOpen)}>
            {go}
          </button>
        )}
      </div>
    </li>
  );
}
