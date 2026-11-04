// The family app (app.aristora.org): the institute's student app and its learning game in one (3 Nov 2026, his voice
// notes and two pictures he liked).
// - Home: today's class, his class week (the centre's hours, his usual days), what he did each day in class and at
//   home, his recent classes.
// - Learn: the whole syllabus of his grade as a map: each term a World, each unit a Stage, each Stage's Levels inside
//   it. He does a Level on paper, types the answers, Check once: ✓ and ✗ at once (the server marks).
// - Race: this week's XP in his grade. Me: his streak, his week, XP, trophies, this phone's children.
// - The top row everywhere: who is on screen (tap: switch, add, sign out), the flame (days in a row), XP, Feedback.
// - Its look: light, ARISTORA's violet, our owl (white on violet, with moods), gold for what he wins. Words (4 Nov
//   2026, his ask "a mix of both"): English for the app's chrome and game words (tabs, buttons, days, times, World,
//   Stage, Level, XP), Tamil for the owl's voice and every sentence; never the same words twice in two languages. No
//   school words on his screens (book, unit, marks).

import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { FamilyLevel, FamilyMe } from "../../convex/family";
import type { Trophy, World } from "../../convex/lib/family";
import { hideSplash } from "../splash";
import { BoardTab } from "./board";
import { FeedbackSheet } from "./feedback";
import { HomeTab } from "./home";
import { BookScreen } from "./book";
import { LearnTab, StageScreen } from "./map";
import { Kids, MeTab } from "./me";
import {
  accounts,
  addAccount,
  current,
  isSignedOut,
  join,
  keep,
  MAX_ACCOUNTS,
  mutation,
  mutationFor,
  NetError,
  noteAccount,
  peek,
  query,
  randomKey,
  removeAccount,
  signInIndex,
  switchTo,
  type Account,
} from "./net";
import { nextPlay, Play, QuestionZoom, Result, type Checked, type Zoomed } from "./play";
import { armSound, buzz, sound } from "./sound";
import { Surprises } from "./surprise";
import { Avatar, Flame, firstName, Gem, Icon, Owl, problemWords, Sheet, toast, Toast, type IconName } from "./ui";

export type Tab = "home" | "learn" | "race" | "me";

type Screen =
  | { k: "join"; code: string }
  | { k: "signin"; why?: string }
  /** Another child joins this phone (index and code); Back returns to the one before. */
  | { k: "add" }
  | { k: "main" }
  | { k: "stage"; unitId: string }
  | { k: "level"; unitId: string; n: number }
  /** A level he checked at home: solutions, photos to send, the teacher's answers (4 Nov 2026). */
  | { k: "book"; unitId: string; n: number }
  | {
      k: "result";
      unitId: string;
      form: FamilyLevel;
      res: Checked;
      typed: Record<number, string[]>;
      /** Before this level: his trophies and his streak (what this level just won shows). */
      before: { trophies: Trophy[]; days: number; today: boolean; best: number };
    };

/** How deep a screen is: Back steps up one at a time (the reveal and a Level go back to their Stage). */
const depth = (s: Screen) => (s.k === "level" || s.k === "result" || s.k === "book" ? 2 : s.k === "stage" || s.k === "add" ? 1 : 0);
const parent = (s: Screen): Screen =>
  s.k === "level" || s.k === "result" || s.k === "book" ? { k: "stage", unitId: s.unitId } : s.k === "stage" ? { k: "main" } : s.k === "add" ? (current() ? { k: "main" } : { k: "signin" }) : s;

function firstScreen(): Screen {
  const code = /[#&]join=([A-Za-z0-9_-]+)/.exec(location.hash)?.[1];
  if (code) return { k: "join", code };
  return current() ? { k: "main" } : { k: "signin" };
}

/** The Worlds a phone kept before 3 Nov 2026 lack `book`: every one it had was a workbook. */
function fixWorlds(m: FamilyMe | null): FamilyMe | null {
  if (!m) return m;
  return { ...m, worlds: m.worlds.map((w) => (w.book === undefined ? { ...w, book: true } : w)) };
}

export function App() {
  const [screen, setScreen] = useState<Screen>(firstScreen);
  const [acc, setAcc] = useState<Account | null>(current);
  const [me, setMe] = useState<FamilyMe | null>(() => fixWorlds(keep<FamilyMe>("me")));
  const [tab, setTab] = useState<Tab>(() => keep<Tab>("tab") ?? "home");
  const [offline, setOffline] = useState(false);
  const [sheet, setSheet] = useState<null | "kids" | "feedback" | "zoom">(null);
  const [zoomed, setZoomed] = useState<Zoomed | null>(null);
  const [ready, setReady] = useState(false);
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;

  // The living owl stays until there is something real to show (and at least a moment: src/splash.ts).
  useEffect(() => {
    if (ready) hideSplash();
  }, [ready]);
  // The phone's bar takes the colour at the top of the screen: purple over a header, light over Home and a Level.
  useEffect(() => {
    if (!ready) return; // the loading owl's navy until then
    const light = screen.k === "level" || screen.k === "result" || screen.k === "signin" || screen.k === "add" || screen.k === "join" || (screen.k === "main" && tab === "home");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#f6f5fd" : "#7767f2");
  }, [ready, screen.k, tab]);

  /** Keeps this child's phone signed in (once a day is enough). */
  const hello = () => {
    const last = keep<number>("hello") ?? 0;
    if (Date.now() - last > 20 * 60 * 60_000) void mutation("family:hello").then(() => keep("hello", Date.now())).catch(() => {});
  };

  const loadMe = async (): Promise<void> => {
    const a = current();
    if (!a) return;
    try {
      const m = (await query("family:me")) as FamilyMe;
      if (current()?.id !== a.id) return; // another child is on screen now
      const before = keep<FamilyMe>("me");
      keep("me", m);
      noteAccount(a.id, { name: m.name, grade: m.grade, index: m.index });
      // The same child twice on this phone (his link, then his code): the newer stays, the older is signed out.
      const twin = m.index !== null ? accounts().find((x) => x.id !== a.id && x.index === m.index) : undefined;
      if (twin) {
        void mutationFor(twin.token, "family:signOut").catch(() => {});
        removeAccount(twin.id);
        switchTo(a.id);
      }
      // A Stage that opened since he last looked: its moment (the map shows it too).
      const opened = before ? m.worlds.filter((w) => w.open && w.book && !before.worlds.find((x) => x.unitId === w.unitId)?.open) : [];
      if (opened.length) {
        sound("unlock");
        toast(`Stage ${opened[0].no} unlocked! ${opened[0].ta}`);
      }
      setMe(m);
      setAcc(current());
      setOffline(false);
    } catch (e) {
      if (current()?.id !== a.id) return;
      if (isSignedOut(e)) {
        // Signed out by the class (or unused for 120 days): he leaves this phone; the next child is on screen.
        const next = removeAccount(a.id);
        setAcc(next);
        setMe(next ? fixWorlds(keep<FamilyMe>("me")) : null);
        if (next) {
          toast(`${firstName(a.name) || "இவர்"}: இந்த phone இலிருந்து வெளியேற்றப்பட்டார்.`, true);
          void loadMe();
        } else setScreen({ k: "signin", why: "இந்த phone இலிருந்து வெளியேற்றப்பட்டது." });
      } else if (e instanceof NetError && e.offline) setOffline(true);
      else toast(problemWords(e), true);
    } finally {
      setReady(true);
    }
  };

  useEffect(() => {
    if (screen.k === "main") {
      if (me) setReady(true);
      void loadMe();
      hello();
    } else if (screen.k === "signin") setReady(true);
  }, []);

  // The phone's Back button: a sheet closes first, then one screen up (a Level → its Stage → the map).
  useEffect(() => {
    const back = () => {
      if (sheetRef.current) return setSheet(null);
      const up = parent(screenRef.current);
      setScreen(up);
      if (up.k === "main") void loadMe();
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  /** To a screen: one history step per level of depth, so Back walks up the same way. */
  const go = (s: Screen) => {
    const steps = depth(s) - depth(screenRef.current);
    for (let i = 0; i < steps; i++) history.pushState({ f: depth(screenRef.current) + i + 1 }, "");
    setScreen(s);
    window.scrollTo(0, 0);
  };
  /** Up one screen (as the phone's Back). */
  const up = () => {
    if (history.state?.f) history.back();
    else {
      setScreen(parent(screenRef.current));
      window.scrollTo(0, 0);
    }
  };
  /** Straight to the main tabs from anywhere. */
  const toMain = () => {
    const d = depth(screenRef.current);
    if (d > 0 && history.state?.f) history.go(-d);
    else setScreen({ k: "main" });
    window.scrollTo(0, 0);
    void loadMe();
  };
  const openSheet = (x: "kids" | "feedback" | "zoom") => {
    buzz();
    sound("pop");
    history.pushState({ f: depth(screenRef.current), sheet: 1 }, "");
    setSheet(x);
  };
  const closeSheet = () => {
    if (history.state?.sheet) history.back();
    else setSheet(null);
  };

  /** A child signed in on this phone (his link, or index and code): he is the one on screen. */
  const signedIn = (t: string, name: string) => {
    addAccount(t, name);
    setAcc(current());
    setMe(null);
    setTab("home");
    sound("level");
    if (screenRef.current.k === "add") toMain();
    else {
      setScreen({ k: "main" });
      void loadMe();
    }
    hello();
  };

  const switchKid = (id: string) => {
    if (id === current()?.id) return closeSheet();
    sound("pop");
    switchTo(id);
    setAcc(current());
    setMe(fixWorlds(keep<FamilyMe>("me")));
    if (history.state?.sheet) history.back();
    else setSheet(null);
    window.scrollTo(0, 0);
    void loadMe();
    hello();
  };

  const addKid = () => {
    if (accounts().length >= MAX_ACCOUNTS) return toast(`ஒரு phone இல் ${MAX_ACCOUNTS} பிள்ளைகள் வரை.`);
    if (history.state?.sheet) history.replaceState({ f: 1 }, "");
    else history.pushState({ f: 1 }, "");
    setSheet(null);
    setScreen({ k: "add" });
  };

  const signOut = async () => {
    const a = current();
    if (!a) return;
    try {
      await mutation("family:signOut");
    } catch (e) {
      // Already signed out on the server is fine; no signal is not (the key would stay valid there).
      if (e instanceof NetError && e.offline) return toast(problemWords(e), true);
    }
    const next = removeAccount(a.id);
    setAcc(next);
    setMe(next ? fixWorlds(keep<FamilyMe>("me")) : null);
    if (history.state?.sheet) history.back();
    else setSheet(null);
    if (next) {
      toast(`${firstName(a.name)} வெளியேறினார். இப்போது ${firstName(next.name)}.`);
      void loadMe();
    } else setScreen({ k: "signin" });
  };

  const pickTab = (t: Tab) => {
    if (t === tab) return;
    buzz();
    sound("tap");
    setTab(t);
    keep("tab", t);
    window.scrollTo(0, 0);
  };
  const worldOf = (unitId: string): World | undefined => me?.worlds.find((w) => w.unitId === unitId);
  /** His Level now, from anywhere (the Continue buttons). */
  const playNow = () => {
    // His limit (4 Nov 2026): photos owed for 2 levels: Continue opens that level's book.
    if (me?.blocked) {
      toast(`📷 முதலில் Stage ${me.blocked.no} · Level ${me.blocked.n} இன் படங்களை அனுப்பு.`);
      return go({ k: "book", unitId: me.blocked.unitId, n: me.blocked.n });
    }
    const next = nextPlay(me);
    if (!next) return toast("இப்போது phone இல் செய்ய Level இல்லை. உன் தாளை வகுப்பில் கொடு.");
    sound("start");
    go({ k: "level", unitId: next.world.unitId, n: next.n });
  };
  const top = (
    <TopRow me={me} acc={acc} offline={offline} onKids={() => openSheet("kids")} onFeedback={() => openSheet("feedback")} onTab={pickTab} />
  );

  let body: ComponentChildren;
  if (screen.k === "join") {
    body = (
      <Join
        code={screen.code}
        onReady={() => setReady(true)}
        onIn={(t, name) => {
          history.replaceState(null, "", location.pathname);
          signedIn(t, name);
        }}
      />
    );
  } else if (screen.k === "signin" || screen.k === "add") {
    body = <SignIn add={screen.k === "add"} why={screen.k === "signin" ? screen.why : undefined} onBack={up} onIn={signedIn} />;
  } else if (screen.k === "stage") {
    const w = worldOf(screen.unitId);
    body = w ? (
      <StageScreen
        me={me!}
        world={w}
        onBack={up}
        onPlay={(n) => {
          sound("start");
          go({ k: "level", unitId: w.unitId, n });
        }}
        onBook={(n) => go({ k: "book", unitId: w.unitId, n })}
      />
    ) : (
      <Missing onBack={toMain} />
    );
  } else if (screen.k === "book") {
    const w = worldOf(screen.unitId);
    body = w ? (
      <BookScreen
        key={`${w.unitId}.${screen.n}`}
        unitId={w.unitId}
        n={screen.n}
        no={w.no}
        title={w.ta}
        onBack={() => {
          up();
          void loadMe();
        }}
      />
    ) : (
      <Missing onBack={toMain} />
    );
  } else if (screen.k === "level") {
    const w = worldOf(screen.unitId);
    body = w ? (
      <Play
        key={`${w.unitId}.${screen.n}`}
        world={w}
        n={screen.n}
        onBack={up}
        onChecked={(form, res, typed) => {
          setScreen({
            k: "result",
            unitId: w.unitId,
            form,
            res,
            typed,
            before: { trophies: me?.trophies ?? [], days: me?.streak.days ?? 0, today: !!me?.streak.today, best: me?.best ?? 0 },
          });
          window.scrollTo(0, 0);
          void loadMe();
        }}
        onZoom={(z) => {
          setZoomed(z);
          openSheet("zoom"); // the phone's Back closes it first, like a sheet
        }}
      />
    ) : (
      <Missing onBack={toMain} />
    );
  } else if (screen.k === "result") {
    const w = worldOf(screen.unitId);
    body = w ? (
      <Result
        world={w}
        form={screen.form}
        res={screen.res}
        typed={screen.typed}
        before={screen.before}
        me={me}
        onStage={up}
        onNext={(n) => {
          sound("start");
          setScreen({ k: "level", unitId: w.unitId, n });
          window.scrollTo(0, 0);
        }}
      />
    ) : (
      <Missing onBack={toMain} />
    );
  } else {
    body = (
      <>
        <main class={`f-main t-${tab}`} key={`${acc?.id ?? ""}.${tab}`}>
          {tab === "home" ? (
            <HomeTab top={top} me={me} onPlay={playNow} onLearn={() => pickTab("learn")} onStage={(unitId) => go({ k: "stage", unitId })} />
          ) : tab === "learn" ? (
            <LearnTab top={top} me={me} onStage={(unitId) => go({ k: "stage", unitId })} onPlay={playNow} />
          ) : tab === "race" ? (
            <BoardTab top={top} me={me} />
          ) : (
            <MeTab
              top={top}
              me={me}
              list={accounts()}
              current={acc}
              onSwitch={switchKid}
              onAdd={addKid}
              onSignOut={() => void signOut()}
              onRace={() => pickTab("race")}
            />
          )}
        </main>
        <BottomBar tab={tab} onTab={pickTab} />
        <Surprises active={sheet === null} />
      </>
    );
  }
  return (
    <div class={`f-app s-${screen.k}`} onPointerDown={armSound}>
      {body}
      {sheet === "kids" && (
        <Sheet title="On this phone" sub="மாற்ற ஒருவரைத் தொடு." onClose={closeSheet}>
          <Kids list={accounts()} current={acc} onSwitch={switchKid} onAdd={addKid} onSignOut={() => void signOut()} />
        </Sheet>
      )}
      {sheet === "feedback" && <FeedbackSheet grade={me?.grade ?? acc?.grade ?? null} onClose={closeSheet} />}
      {sheet === "zoom" && zoomed && <QuestionZoom {...zoomed} onClose={closeSheet} />}
      <Toast />
    </div>
  );
}

function Missing(props: { onBack: () => void }) {
  return (
    <div class="f-center f-pad">
      <Owl mood="dizzy" class="mid" />
      <p class="f-lead">இது இப்போது இல்லை.</p>
      <button type="button" class="f-btn go" onClick={props.onBack}>
        Home
      </button>
    </div>
  );
}

/** The last XP and flame each child's top row showed: when they grow (back from a Level), the pill jumps once. */
const shown = new Map<string, number>();
function useGrew(key: string, v: number): boolean {
  const [grew, setGrew] = useState(false);
  useEffect(() => {
    const before = shown.get(key);
    shown.set(key, v);
    if (before === undefined || v <= before) return;
    setGrew(true);
    const id = window.setTimeout(() => setGrew(false), 900);
    return () => window.clearTimeout(id);
  }, [key, v]);
  return grew;
}

/** Who is on screen, his flame, his XP, and Feedback: at the top of every tab. */
function TopRow(props: { me: FamilyMe | null; acc: Account | null; offline: boolean; onKids: () => void; onFeedback: () => void; onTab: (t: Tab) => void }) {
  const me = props.me;
  const name = me?.name ?? props.acc?.name ?? "";
  const kids = accounts().length;
  const id = props.acc?.id ?? "";
  const xpGrew = useGrew(`${id}.xp`, me?.total ?? 0);
  const fireGrew = useGrew(`${id}.fire`, me?.streak.days ?? 0);
  return (
    <div class="f-toprow">
      <button type="button" class="f-who" aria-label={`${name}: the children on this phone`} onClick={props.onKids}>
        <Avatar name={name || "?"} size="s" />
        <b class="f-name">{firstName(name)}</b>
        <span class={`f-caret${kids > 1 ? " many" : ""}`} aria-hidden="true">
          {kids > 1 ? kids : "▾"}
        </span>
      </button>
      {props.offline && (
        <span class="f-off" title="No internet">
          Offline
        </span>
      )}
      <span class="f-sp" />
      <button type="button" class={`f-pill fire${me?.streak.today ? " lit" : ""}${fireGrew ? " grew" : ""}`} aria-label={`${me?.streak.days ?? 0} days in a row`} onClick={() => props.onTab("me")}>
        <Flame lit={!!me?.streak.today} />
        {me?.streak.days ?? 0}
      </button>
      <button type="button" class={`f-pill gem${xpGrew ? " grew" : ""}`} aria-label={`${me?.total ?? 0} XP`} onClick={() => props.onTab("race")}>
        <Gem />
        {(me?.total ?? 0).toLocaleString("en")}
      </button>
      <button type="button" class="f-fbb" aria-label="Feedback: tell ARISTORA" onClick={props.onFeedback}>
        <Icon name="chat" size={20} />
      </button>
    </div>
  );
}

/** The tabs: English, short, the words every phone already uses. */
const TABS: { id: Tab; icon: IconName; name: string }[] = [
  { id: "home", icon: "home", name: "Home" },
  { id: "learn", icon: "map", name: "Learn" },
  { id: "race", icon: "trophy", name: "Race" },
  { id: "me", icon: "user", name: "Me" },
];

function BottomBar(props: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav class="f-tabs" aria-label="ARISTORA">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          class={`f-tab${props.tab === t.id ? " on" : ""}`}
          aria-pressed={props.tab === t.id}
          aria-label={t.name}
          onClick={() => props.onTab(t.id)}
        >
          <Icon name={t.icon} size={22} />
          <span>{t.name}</span>
        </button>
      ))}
    </nav>
  );
}

/** His index number and code (from the class), once on each phone; or the WhatsApp link, which signs in by itself. */
function SignIn(props: { add: boolean; why?: string; onBack: () => void; onIn: (token: string, name: string) => void }) {
  const [index, setIndex] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const digits = (s: string, n: number) => s.replace(/\D/g, "").slice(0, n);
  const go = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    const t = randomKey(32);
    try {
      const r = await signInIndex(Number(index), code, t);
      if (r.ok) return props.onIn(t, r.name);
      buzz(40);
      sound("wrong");
      setErr(r.why === "locked" ? `பல தடவை தவறு. ${r.minutes} நிமிடம் கழித்து மீண்டும் முயற்சி செய்.` : "Index எண் அல்லது code தவறு. மீண்டும் பார்.");
    } catch (x) {
      setErr(problemWords(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="f-signin">
      {props.add && (
        <button type="button" class="f-round f-back" aria-label="Back" onClick={props.onBack}>
          <Icon name="back" />
        </button>
      )}
      <div class="f-center f-pad">
        <Owl mood="wave" class="big" />
        <h1 class="f-h1">{props.add ? "Add a child" : "ARISTORA"}</h1>
        {props.add ? <p class="f-muted">அவரின் index எண்ணும் code உம்.</p> : <p class="f-muted">வகுப்பும் கற்றலும், ஒரே இடத்தில்.</p>}
        {props.why && <p class="f-muted">{props.why}</p>}
        <form class="f-form" onSubmit={(e) => void go(e)}>
          <label>
            <span>Index number</span>
            <input
              inputMode="numeric"
              autoComplete="username"
              maxLength={6}
              value={index}
              onInput={(e) => setIndex(digits((e.target as HTMLInputElement).value, 6))}
            />
          </label>
          <label>
            <span>Code</span>
            <input
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={4}
              value={code}
              onInput={(e) => setCode(digits((e.target as HTMLInputElement).value, 4))}
            />
          </label>
          {err && (
            <p class="f-err" role="alert">
              {err}
            </p>
          )}
          <button type="submit" class="f-btn go big" disabled={busy || index.length < 4 || code.length !== 4}>
            {busy ? "…" : "Sign in"}
          </button>
        </form>
        <p class="f-muted small">மறந்துவிட்டாயா? வகுப்பில் கேள்: மீண்டும் அனுப்புவோம்.</p>
      </div>
    </div>
  );
}

function Join(props: { code: string; onReady: () => void; onIn: (token: string, name: string) => void }) {
  const [state, setState] = useState<{ name: string | null; problem: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    peek(props.code)
      .then(setState)
      .catch((e) => setState({ name: null, problem: problemWords(e) }))
      .finally(props.onReady);
  }, [props.code]);
  const start = async () => {
    setBusy(true);
    const t = randomKey(32);
    try {
      const r = await join(props.code, t);
      props.onIn(t, r.name);
    } catch (e) {
      setState({ name: null, problem: problemWords(e) });
    } finally {
      setBusy(false);
    }
  };
  if (!state) return null;
  return (
    <div class="f-center f-pad">
      <Owl mood={state.name ? "love" : "dizzy"} class="big" />
      {state.name ? (
        <>
          <h1 class="f-h1">வணக்கம், {firstName(state.name)}!</h1>
          <p class="f-lead">ஒவ்வொரு Level ஐயும் உன் தாளில் செய்து முடித்ததும், விடைகளை இங்கே போடு. உடனே ✓ ✗ தெரியும்.</p>
          <button type="button" class="f-btn gold big shine" disabled={busy} onClick={() => void start()}>
            START
          </button>
        </>
      ) : (
        <>
          <h1 class="f-h1">இந்த link வேலை செய்யவில்லை</h1>
          <p class="f-lead">{state.problem}</p>
          {current() && (
            <button type="button" class="f-btn ghost" onClick={() => location.replace(location.pathname)}>
              Back
            </button>
          )}
        </>
      )}
    </div>
  );
}
