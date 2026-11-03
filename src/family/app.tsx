// The family app (app.aristora.org): the student does a level in his paper workbook, types the answers here, taps
// Check once, and sees ✓ and ✗ at once with his XP, his lamp (days in a row) and his trophies. The phone never has
// the answers: the server marks.
// - Its own look (3 Nov 2026, his voice note: "we are unique"): ARISTORA's night, the owl, gold for what he won.
// - Bottom bar: the map (வரைபடம்: his Worlds as a winding road), the race (போட்டி: this week's board), me (நான்: his
//   week, trophies, the children on this phone). Top bar: who is on screen (tap: switch, add, sign out), his lamp,
//   his XP this week, and Feedback (the most important button: what students think of the class).
// - Words: Tamil first, a few game words in English (World, Level, XP). No school words (book, unit, marks).
// - Light on purpose: no client library, one small bundle, one small font; the loading owl is the page's own.

import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { FamilyLevel, FamilyMe } from "../../convex/family";
import type { Trophy, World } from "../../convex/lib/family";
import { hideSplash } from "../splash";
import { BoardTab } from "./board";
import { FeedbackSheet } from "./feedback";
import { MapTab } from "./map";
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
import { Play, Result, type Checked } from "./play";
import { armSound, buzz, sound } from "./sound";
import { Avatar, firstName, Icon, Lamp, Owl, problemWords, Sheet, Spark, toast, Toast } from "./ui";

type Tab = "map" | "board" | "me";

type Screen =
  | { k: "join"; code: string }
  | { k: "signin"; why?: string }
  /** Another child joins this phone (index and code); Back returns to the one before. */
  | { k: "add" }
  | { k: "main" }
  | { k: "level"; world: World; n: number }
  | { k: "result"; world: World; form: FamilyLevel; res: Checked; typed: Record<number, string[]>; before: Trophy[] };

/** Screens above the main one: the phone's Back button returns from them. */
const above = (s: Screen) => s.k === "level" || s.k === "result" || s.k === "add";

function firstScreen(): Screen {
  const code = /[#&]join=([A-Za-z0-9_-]+)/.exec(location.hash)?.[1];
  if (code) return { k: "join", code };
  return current() ? { k: "main" } : { k: "signin" };
}

export function App() {
  const [screen, setScreen] = useState<Screen>(firstScreen);
  const [acc, setAcc] = useState<Account | null>(current);
  const [me, setMe] = useState<FamilyMe | null>(() => keep<FamilyMe>("me"));
  const [tab, setTab] = useState<Tab>("map");
  const [offline, setOffline] = useState(false);
  const [sheet, setSheet] = useState<null | "kids" | "feedback">(null);
  const [ready, setReady] = useState(false);

  // The living owl stays until there is something real to show (and at least a moment: src/splash.ts).
  useEffect(() => {
    if (ready) hideSplash();
  }, [ready]);

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
      keep("me", m);
      noteAccount(a.id, { name: m.name, grade: m.grade, index: m.index });
      // The same child twice on this phone (his link, then his code): the newer stays, the older is signed out.
      const twin = m.index !== null ? accounts().find((x) => x.id !== a.id && x.index === m.index) : undefined;
      if (twin) {
        void mutationFor(twin.token, "family:signOut").catch(() => {});
        removeAccount(twin.id);
        switchTo(a.id);
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
        setMe(next ? keep<FamilyMe>("me") : null);
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

  // The phone's Back button: closes a sheet, leaves a level, the reveal or adding a child.
  useEffect(() => {
    const back = () => {
      setSheet(null);
      setScreen((s) => (s.k === "add" ? (current() ? { k: "main" } : { k: "signin" }) : above(s) ? { k: "main" } : s));
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  const push = () => {
    if (!history.state?.f) history.pushState({ f: 1 }, "");
  };
  const go = (s: Screen) => {
    if (above(s)) push();
    setScreen(s);
    window.scrollTo(0, 0);
  };
  const toMain = () => {
    if (history.state?.f) history.back();
    else {
      setSheet(null);
      setScreen({ k: "main" });
    }
    void loadMe();
  };
  const openSheet = (x: "kids" | "feedback") => {
    buzz();
    push();
    setSheet(x);
  };
  const closeSheet = () => {
    if (history.state?.f) history.back();
    else setSheet(null);
  };

  /** A child signed in on this phone (his link, or index and code): he is the one on screen. */
  const signedIn = (t: string, name: string) => {
    addAccount(t, name);
    setAcc(current());
    setMe(null);
    setTab("map");
    sound("level");
    if (screen.k === "add") toMain();
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
    setMe(keep<FamilyMe>("me"));
    setTab("map");
    setSheet(null);
    if (history.state?.f) history.back();
    window.scrollTo(0, 0);
    void loadMe();
    hello();
  };

  const addKid = () => {
    if (accounts().length >= MAX_ACCOUNTS) return toast(`ஒரு phone இல் ${MAX_ACCOUNTS} பிள்ளைகள் வரை.`);
    setSheet(null);
    push();
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
    setMe(next ? keep<FamilyMe>("me") : null);
    setSheet(null);
    setTab("map");
    if (history.state?.f) history.back();
    if (next) {
      toast(`${firstName(a.name)} வெளியேறினார். இப்போது ${firstName(next.name)}.`);
      void loadMe();
    } else setScreen({ k: "signin" });
  };

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
    body = <SignIn add={screen.k === "add"} why={screen.k === "signin" ? screen.why : undefined} onBack={toMain} onIn={signedIn} />;
  } else if (screen.k === "level") {
    body = (
      <Play
        world={screen.world}
        n={screen.n}
        onBack={toMain}
        onChecked={(form, res, typed) => {
          setScreen({ k: "result", world: screen.world, form, res, typed, before: me?.trophies ?? [] });
          window.scrollTo(0, 0);
          void loadMe();
        }}
      />
    );
  } else if (screen.k === "result") {
    body = (
      <Result
        world={screen.world}
        form={screen.form}
        res={screen.res}
        typed={screen.typed}
        before={screen.before}
        me={me}
        onHome={toMain}
        onNext={(w, n) => {
          setScreen({ k: "level", world: w, n });
          window.scrollTo(0, 0);
        }}
      />
    );
  } else {
    body = (
      <>
        <TopBar me={me} acc={acc} offline={offline} onKids={() => openSheet("kids")} onFeedback={() => openSheet("feedback")} onTab={setTab} />
        <main class="f-main" key={`${acc?.id ?? ""}.${tab}`}>
          {tab === "map" ? (
            <MapTab me={me} onPlay={(world, n) => go({ k: "level", world, n })} />
          ) : tab === "board" ? (
            <BoardTab me={me} />
          ) : (
            <MeTab me={me} list={accounts()} current={acc} onSwitch={switchKid} onAdd={addKid} onSignOut={() => void signOut()} />
          )}
        </main>
        <BottomBar
          tab={tab}
          onTab={(t) => {
            if (t === tab) return;
            buzz();
            sound("tab");
            setTab(t);
            window.scrollTo(0, 0);
          }}
        />
        {sheet === "kids" && (
          <Sheet title="இந்த phone இல்" sub="மாற்ற ஒருவரைத் தொடு · Tap a child to switch" onClose={closeSheet}>
            <Kids list={accounts()} current={acc} onSwitch={switchKid} onAdd={addKid} onSignOut={() => void signOut()} />
          </Sheet>
        )}
        {sheet === "feedback" && <FeedbackSheet grade={me?.grade ?? acc?.grade ?? null} onClose={closeSheet} />}
      </>
    );
  }
  return (
    <div class={`f-app s-${screen.k}`} onPointerDown={armSound}>
      <span class="f-sky" aria-hidden="true" />
      {body}
      <Toast />
    </div>
  );
}

function TopBar(props: {
  me: FamilyMe | null;
  acc: Account | null;
  offline: boolean;
  onKids: () => void;
  onFeedback: () => void;
  onTab: (t: Tab) => void;
}) {
  const me = props.me;
  const name = me?.name ?? props.acc?.name ?? "";
  const kids = accounts().length;
  return (
    <header class="f-top">
      <button type="button" class="f-who" aria-label={`${name}: the children on this phone`} onClick={props.onKids}>
        <Avatar name={name || "?"} size="s" />
        <b class="f-name">{firstName(name)}</b>
        <span class={`f-caret${kids > 1 ? " many" : ""}`} aria-hidden="true">
          {kids > 1 ? kids : "▾"}
        </span>
      </button>
      {props.offline && (
        <span class="f-off" title="No internet">
          இணையம் இல்லை
        </span>
      )}
      <span class="f-sp" />
      <button type="button" class={`f-stat lamp${me?.streak.today ? " lit" : ""}`} aria-label={`${me?.streak.days ?? 0} days in a row`} onClick={() => props.onTab("me")}>
        <Lamp lit={!!me?.streak.today} />
        {me?.streak.days ?? 0}
      </button>
      <button type="button" class="f-stat xp" aria-label={`${me?.xp ?? 0} XP this week`} onClick={() => props.onTab("board")}>
        <Spark />
        {me?.xp ?? 0}
      </button>
      <button type="button" class="f-fbb" aria-label="Feedback: tell ARISTORA" onClick={props.onFeedback}>
        <Icon name="chat" size={21} />
      </button>
    </header>
  );
}

const TABS: { id: Tab; icon: "map" | "board" | "me"; ta: string; en: string }[] = [
  { id: "map", icon: "map", ta: "வரைபடம்", en: "Map" },
  { id: "board", icon: "board", ta: "போட்டி", en: "Race" },
  { id: "me", icon: "me", ta: "நான்", en: "Me" },
];

function BottomBar(props: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav class="f-tabs" aria-label="ARISTORA">
      {TABS.map((t) => (
        <button key={t.id} type="button" class={`f-tab${props.tab === t.id ? " on" : ""}`} aria-pressed={props.tab === t.id} aria-label={`${t.ta} · ${t.en}`} onClick={() => props.onTab(t.id)}>
          <Icon name={t.icon} size={24} />
          <span>{t.ta}</span>
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
        <button type="button" class="f-icon f-back" aria-label="Back" onClick={props.onBack}>
          <Icon name="back" />
        </button>
      )}
      <div class="f-center f-pad">
        <Owl class="big" />
        <h1 class="f-h1">{props.add ? "இன்னொரு பிள்ளை" : "ARISTORA"}</h1>
        {props.add && <p class="f-muted">அவரின் index எண்ணும் code உம் · His index number and code</p>}
        {props.why && <p class="f-muted">{props.why}</p>}
        <form class="f-form" onSubmit={(e) => void go(e)}>
          <label>
            <span>Index எண் · Index number</span>
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
            {busy ? "…" : "உள்நுழை"}
          </button>
        </form>
        <p class="f-muted small">மறந்துவிட்டாயா? வகுப்பில் கேள்: மீண்டும் அனுப்புவோம். · Forgot them? Ask the class.</p>
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
      <Owl class="big" />
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
          {current() && (
            <button type="button" class="f-btn ghost" onClick={() => location.replace(location.pathname)}>
              பின் செல்
            </button>
          )}
        </>
      )}
    </div>
  );
}
