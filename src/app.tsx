import { useEffect, useRef, useState } from "preact/hooks";
import { callPhrase, lostPhrase, pullPhrase, type RoomName } from "./announce";
import { AttendanceSheet } from "./attendance";
import type { Link } from "./backend";
import { ClassPage } from "./correction";
import { buildViews, evalQueue, fmtClock, isWalking, liveSession, theoryGroups, theoryMembers, WALK_MS, waitingAll, type View } from "./derive";
import { Focus } from "./focus";
import { EvaluationPage } from "./evalFocus";
import { TheoryTab } from "./theoryFocus";
import { Progress } from "./progress";
import { Settings } from "./settings";
import { alertsState, armAlerts, listenForTaps, ring, useAlertsState, type AlertKind } from "./sound";
import { clearHash, PinSheet, pinAsked, readHash, SignIn, stopAskingPin, type Hash } from "./signin";
import { hideSplash } from "./splash";
import { currentMe, may, setRole, signOutHere, useStore, useTick, type Board, type Role } from "./store";
import { Sheet, Toasts } from "./ui";

/**
 * The bottom bar (30 Oct 2026, his call): each job's own page, Correction (marking papers; the code calls it Focus),
 * Theory and Evaluation, for the jobs this person has. The whole class (Class) is an icon in the top bar, for
 * everyone, with Progress. A phone with none of the jobs has no bottom bar: Class is its home.
 */
type TabId = "correction" | "theory" | "evaluation";
type Page = "board" | "class" | "settings" | "progress";

const TABS: { id: TabId; label: string }[] = [
  { id: "correction", label: "Correction" },
  { id: "theory", label: "Theory" },
  { id: "evaluation", label: "Evaluation" },
];
const JOBS: Role[] = ["correction", "theory", "evaluation"];

/**
 * Where this phone was: Correction ("focus"), Theory or Evaluation (the bottom bar), or Class. "correction" meant the
 * Class tab (before 29 Oct 2026), now the Class page.
 */
function loadStart(): { tab: TabId; page: Page } {
  try {
    const r = localStorage.getItem("aristora.role");
    if (r === "theory" || r === "evaluation") return { tab: r, page: "board" };
    if (r === "focus") return { tab: "correction", page: "board" };
    if (r === "class" || r === "correction") return { tab: "theory", page: "class" };
  } catch {
    /* private mode */
  }
  return { tab: "theory", page: "board" };
}

/** The pages a top-bar page goes back to: the bottom tab, or Class. */
type Home = "board" | "class";

/** The job this phone did last (Correction, Theory or Evaluation): the Class page's taps follow it. */
function loadJob(): Role | null {
  try {
    const j = localStorage.getItem("aristora.job");
    if (j === "correction" || j === "theory" || j === "evaluation") return j;
  } catch {
    /* private mode */
  }
  return null;
}

export function App() {
  const { board, boardError, link, me } = useStore();
  const [start] = useState(loadStart);
  const [chosen, setTab] = useState<TabId>(start.tab);
  const [page, setPage] = useState<Page>(start.page);
  const [lastJob, setLastJob] = useState<Role | null>(loadJob);
  // Settings and Progress go back to the page they were opened from: Class or the bottom tab.
  const [backTo, setBackTo] = useState<Home>(start.page === "class" ? "class" : "board");
  // The address bar can hold a sign-in link (#join=...) or the setup code (#setup=...).
  const [, setHashSeen] = useState(0);
  const hash: Hash = readHash();
  const forgetHash = () => {
    clearHash();
    setHashSeen((n) => n + 1);
  };
  const [pinClosedFor, setPinClosedFor] = useState<string | null>(null);
  // Attendance: a full page over any page (from the count by the clock, or Class when nobody is in yet).
  const [attOpen, setAttOpen] = useState(false);
  const now = useTick(10_000);
  const alerts = useAlertsState();
  const topRef = useRef<HTMLDivElement>(null);
  const loaded = !!board;
  const user = me?.user ?? null;
  // Correction, Theory and Evaluation for those jobs (the bottom bar); Class for everyone (the top bar).
  const jobs = JOBS.filter((j) => !user || user.role === "owner" || user.tabs.includes(j));
  const tabs = TABS.filter((t) => jobs.includes(t.id));
  const tab: TabId = tabs.some((t) => t.id === chosen) ? chosen : (tabs[0]?.id ?? "theory");
  // Correction (marking papers, and signing students in with its +) is Correction's job; Progress needs Reports.
  const canCorrect = may("correction");
  const canProgress = may("reports");
  // Home: the bottom tab, else Class.
  const home: Home = tabs.length ? "board" : "class";
  const wanted: Page = page === "board" && !tabs.length ? home : page;
  const shown: Page = wanted === "progress" && !canProgress ? backTo : wanted;
  const base: Home = shown === "class" || shown === "board" ? shown : backTo;
  /** Open a page from the top bar; the same button again goes back. */
  const toggle = (p: "settings" | "progress") => {
    if (shown === p) {
      setPage(backTo);
      return;
    }
    if (shown === "board" || shown === "class") setBackTo(shown);
    setPage(p);
  };
  /** Class from the top bar: it just opens. */
  const goClass = () => {
    setBackTo("class");
    setPage("class");
  };
  // The job decides the taps, what the phone hears and the `by` the server records. Class: the job done last.
  const classJob: Role = lastJob && jobs.includes(lastJob) ? lastJob : (jobs[0] ?? "correction");
  const role: Role = base === "class" ? classJob : tab;

  setRole(role);
  useEffect(() => {
    try {
      localStorage.setItem("aristora.role", base === "class" ? "class" : tab === "correction" ? "focus" : tab);
    } catch {
      /* private mode */
    }
    const job: Role | null = base === "class" ? null : tab;
    if (job && job !== lastJob) {
      setLastJob(job);
      try {
        localStorage.setItem("aristora.job", job);
      } catch {
        /* private mode */
      }
    }
  }, [tab, base]);
  // Phones only allow sound after a tap: every tap turns alerts (back) on where needed.
  useEffect(() => listenForTaps(), []);
  useEffect(() => {
    const seen = () => setHashSeen((n) => n + 1);
    window.addEventListener("hashchange", seen);
    return () => window.removeEventListener("hashchange", seen);
  }, []);
  // Sticky strips sit right under the header, whatever its height (it grows when offline).
  // The loading owl goes once there is a real screen to show: the class, the sign-in, or an error to read.
  const firstScreen = me === undefined ? !!boardError : !me.user || !!board || !!boardError;
  useEffect(() => {
    if (firstScreen) hideSplash();
  }, [firstScreen]);
  useEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--top-h", `${el.offsetHeight}px`);
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  if (me === undefined) {
    return (
      <div class="boot">
        {boardError ? (
          <>
            <p>
              <strong>Can't reach the class board.</strong>
            </p>
            <p>{boardError}</p>
          </>
        ) : (
          <SlowLoad />
        )}
      </div>
    );
  }
  if (!user) return <SignIn setupDone={me.setupDone} />;
  if (!board) {
    return (
      <div class="boot">
        {boardError ? (
          <>
            <p>
              <strong>Can't load the class.</strong>
            </p>
            <p>{boardError}</p>
          </>
        ) : (
          <p>Loading the class…</p>
        )}
      </div>
    );
  }

  const views = buildViews(board, now);
  const theoryRed = theoryMembers(theoryGroups(views)).filter((m) => m.urgency === "red" && !m.inEvaluation).length;
  const evalRed = new Set(evalQueue(views, now).filter((m) => m.urgency === "red" && !m.blockedBy).map((m) => m.v.s._id)).size;
  const toSend = board.calls.filter((c) => c.status === "requested" && !c.pull).length;
  const session = liveSession(board, now);
  const inClass = views.filter((v) => v.where !== "absent").length;
  // Correction's count (its tab): workbook levels handed in, waiting to be corrected; red when someone has no work
  // until then.
  const papers = views.reduce((a, v) => a + waitingAll(v), 0);
  const papersRed = views.some((v) => v.where === "hall" && v.noWork && !!v.ms?.needs.includes("correction"));
  // Class's count: students in the hall with no work right now (red), for whoever looks.
  const idleNow = views.filter((v) => v.where === "hall" && v.tone === "red").length;

  return (
    <div
      class={`app${tabs.length ? "" : " no-tabs"}`}
      data-role={role}
      data-tab={shown === "class" ? "class" : tab === "correction" ? "focus" : tab}
    >
      <div class="top-wrap" ref={topRef}>
        <header class="top">
          <div class="top-left">
            <button
              type="button"
              class={`att-btn class-btn${shown === "class" ? " on" : ""}`}
              aria-pressed={shown === "class"}
              aria-label={`Class: the whole class${idleNow ? `, ${idleNow} with no work` : ""}`}
              onClick={goClass}
            >
              <svg
                viewBox="0 0 24 24"
                width="21"
                height="21"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              >
                <circle cx="5" cy="6" r="1.9" />
                <circle cx="5" cy="12" r="1.9" />
                <circle cx="5" cy="18" r="1.9" />
                <path d="M10 6h10M10 12h10M10 18h7" />
              </svg>
              {idleNow > 0 && (
                <b class="att-n red" aria-hidden="true">
                  {idleNow}
                </b>
              )}
            </button>
            {canProgress && (
              <button
                type="button"
                class={`att-btn prog-btn${shown === "progress" ? " on" : ""}`}
                aria-pressed={shown === "progress"}
                aria-label="Progress"
                onClick={() => toggle("progress")}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="21"
                  height="21"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
                </svg>
              </button>
            )}
          </div>
          <div class="top-meta">
            <TopStat
              inClass={inClass}
              clock={session ? fmtClock(now - session.startedAt) : null}
              link={link}
              onTap={canCorrect ? () => setAttOpen(true) : undefined}
            />
            <button
              type="button"
              class={`icon-btn${shown === "settings" ? " on" : ""}`}
              aria-label="Settings"
              onClick={() => toggle("settings")}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path
                  d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-2.1.06-1.4-.06-1.4 2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.4-1.4L14.2 2h-4.4l-.4 2.7a7.6 7.6 0 0 0-2.4 1.4l-2.4-1-2 3.4 2 1.6-.06 1.4.06 1.4-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.4 1.4l.4 2.7h4.4l.4-2.7a7.6 7.6 0 0 0 2.4-1.4l2.4 1 2-3.4-2-1.6Z"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </div>
        </header>
        <LinkBanner link={link} />
      </div>
      {alerts.needTap && (
        <button type="button" class="sound-banner" onClick={armAlerts}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
            <path
              d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          {alerts.on ? "Tap here to keep the screen on for alerts" : "Tap here to turn on alerts (sound and names)"}
        </button>
      )}

      {shown === "settings" ? (
        <Settings views={views} onClose={() => setPage(backTo)} />
      ) : shown === "class" ? (
        <ClassPage board={board} views={views} now={now} job={role} onAttendance={() => setAttOpen(true)} />
      ) : shown === "progress" ? (
        <Progress board={board} now={now} />
      ) : tab === "correction" ? (
        <Focus board={board} views={views} now={now} />
      ) : tab === "evaluation" ? (
        <EvaluationPage board={board} views={views} now={now} />
      ) : (
        <TheoryTab board={board} views={views} now={now} />
      )}

      {tabs.length > 0 && (
        <nav class={`tabs n${tabs.length}`} aria-label="Choose your page">
          {tabs.map((r) => {
            // A number: something waits for that page's job while this phone is busy elsewhere. Theory, Evaluation:
            // students with no work (red). Correction: papers handed in (amber; red when someone has no work until then).
            const away = role !== r.id || shown !== "board";
            const badge = !away ? 0 : r.id === "theory" ? theoryRed : r.id === "evaluation" ? evalRed : papers;
            const amber = r.id === "correction" && !papersRed;
            return (
              <button
                key={r.id}
                type="button"
                class={`tab ${r.id}${tab === r.id && shown === "board" ? " on" : ""}`}
                aria-current={tab === r.id && shown === "board" ? "page" : undefined}
                aria-label={`${r.label}${badge ? `, ${badge} ${r.id === "correction" ? "waiting" : "with no work"}` : ""}`}
                onClick={() => {
                  setTab(r.id);
                  setBackTo("board");
                  setPage("board");
                }}
              >
                <span class="tab-mark" aria-hidden="true" />
                <span>{r.label}</span>
                {badge > 0 && <span class={`tab-badge${amber ? " tb-amber" : ""}`}>{badge}</span>}
              </button>
            );
          })}
        </nav>
      )}
      {attOpen && canCorrect && <AttendanceSheet board={board} views={views} now={now} onClose={() => setAttOpen(false)} />}
      <Toasts />
      <Alerts role={role} board={board} views={views} now={now} live={link.connected} />
      {(hash.join || hash.setup) && (
        <Sheet
          title={`Signed in as ${user.name}`}
          sub="You opened a sign-in link on a phone that is already signed in."
          onClose={forgetHash}
          foot={
            <div class="row-actions">
              <button
                type="button"
                class="btn ghost"
                onClick={forgetHash}
              >
                Keep {user.name}
              </button>
              <button type="button" class="btn primary" onClick={() => void signOutHere()}>
                Sign out, use the link
              </button>
            </div>
          }
        >
          <p class="muted">A link is for one person's phone. If this phone is now someone else's, sign out first.</p>
        </Sheet>
      )}
      {pinAsked() && pinClosedFor !== user._id && !user.hasPin && !(hash.join || hash.setup) && (
        <PinSheet
          hasPin={false}
          first
          onClose={() => {
            stopAskingPin();
            setPinClosedFor(user._id);
          }}
        />
      )}
    </div>
  );
}

/** "Loading…", and after a while a hint: phones without data wait here. */
function SlowLoad() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(id);
  }, []);
  return (
    <>
      <p>Loading…</p>
      {slow && <p class="muted">Still loading. Check that this phone has mobile data or Wi-Fi.</p>}
    </>
  );
}

/**
 * Top right: how many are in class, the class clock and the link dot, in one capsule. For whoever signs students in
 * (Correction, the owner) it is also a way into Attendance from any page.
 */
function TopStat(props: { inClass: number; clock: string | null; link: Link; onTap?: () => void }) {
  const { inClass, clock } = props;
  const words = `${inClass} in class, ${clock ? `class time ${clock}` : "no class now"}`;
  const inside = (
    <>
      <svg
        class="ts-ic"
        viewBox="0 0 24 24"
        width="17"
        height="17"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="9" cy="8" r="3.4" />
        <path d="M2.8 20.2c.6-3.5 3.1-5.5 6.2-5.5s5.6 2 6.2 5.5" />
        <path d="M15.6 4.8a3.4 3.4 0 0 1 0 6.4M18.2 14.9c1.7.9 2.8 2.6 3.1 5.3" />
      </svg>
      <b class={`ts-n${inClass ? "" : " zero"}`} aria-hidden="true">
        {inClass}
      </b>
      <i class="ts-sep" aria-hidden="true" />
      <span class={`clock${clock ? "" : " off"}`} aria-hidden="true">
        {clock ?? "No class"}
      </span>
      <LinkDot link={props.link} />
    </>
  );
  return props.onTap ? (
    <button type="button" class={`top-stat${inClass ? "" : " zero"}`} aria-label={`${words}. Attendance`} onClick={props.onTap}>
      {inside}
    </button>
  ) : (
    <div class={`top-stat${inClass ? "" : " zero"}`} role="group" aria-label={words}>
      {inside}
    </div>
  );
}

function LinkDot(props: { link: Link }) {
  const { link } = props;
  const state = !link.everConnected ? "wait" : !link.connected ? "off" : link.sending > 0 ? "busy" : "ok";
  const words = { wait: "Connecting", off: "No connection", busy: "Saving", ok: "Live" }[state];
  return (
    <span class={`link-dot ${state}`} role="status" aria-label={words} title={words}>
      <span aria-hidden="true" />
    </span>
  );
}

function LinkBanner(props: { link: Link }) {
  const { link } = props;
  const [show, setShow] = useState(false);
  const bad = !link.connected;
  useEffect(() => {
    if (!bad) {
      setShow(false);
      return;
    }
    const id = setTimeout(() => setShow(true), link.everConnected ? 3000 : 8000);
    return () => clearTimeout(id);
  }, [bad, link.everConnected]);
  if (!show) return null;
  return (
    <div class="link-banner" role="alert">
      {link.everConnected
        ? "No internet. Your taps are kept on this phone and sent when it's back. Don't close this page."
        : "Can't reach the class board. Check the mobile data."}
    </div>
  );
}

const REPEAT_MS = 30_000;

type AlertItem = { key: string; kind: AlertKind; name: string; room: RoomName; repeat: boolean; teacher?: string };

/** What this phone's job should hear about right now. */
function alertItems(role: Role, board: Board, views: View[], now: number): AlertItem[] {
  const nameOf = new Map(views.map((v) => [v.s._id as string, v.s.name]));
  const items: AlertItem[] = [];
  if (role === "correction") {
    for (const c of board.calls)
      if (c.status === "requested" && !c.pull)
        items.push({ key: `call:${c._id}`, kind: "call", name: nameOf.get(c.studentId) ?? "", room: c.room, repeat: true, teacher: c.teacher });
    // Sent to Theory 3 minutes ago and Theory hasn't tapped Arrived: where is he? (Again every 30 s until it's settled.)
    for (const c of board.calls)
      if (isWalking(c) && now - (c.sentAt ?? c.createdAt) >= WALK_MS)
        items.push({ key: `lost:${c._id}`, kind: "lost", name: nameOf.get(c.studentId) ?? "", room: c.room, repeat: true, teacher: c.teacher });
    // A workbook student with every level handed in waits for Correction: knock once.
    for (const v of views)
      if (v.where === "hall" && v.noWork && v.ms?.needs.includes("correction"))
        items.push({ key: `red:${v.s._id}`, kind: "red", name: v.s.name, room: "theory", repeat: false });
  } else if (role === "theory") {
    for (const m of theoryMembers(theoryGroups(views)))
      if (m.urgency === "red" && !m.inEvaluation)
        items.push({ key: `red:${m.v.s._id}`, kind: "red", name: m.v.s.name, room: "theory", repeat: false });
  } else {
    for (const m of evalQueue(views, now))
      if (m.urgency === "red" && !m.blockedBy && !items.some((x) => x.key === `red:${m.v.s._id}`))
        items.push({ key: `red:${m.v.s._id}`, kind: "red", name: m.v.s.name, room: "evaluation", repeat: false });
    // Theory wants a student who is with an Evaluation teacher: only she hears it (each teacher has her own room).
    const me = currentMe()?._id;
    const mine = (studentId: string) =>
      board.calls.some((e) => e.studentId === studentId && e.room === "evaluation" && e.status === "sent" && (!e.teacherId || e.teacherId === me));
    for (const c of board.calls)
      if (c.pull && c.status === "requested" && mine(c.studentId))
        items.push({ key: `pull:${c._id}`, kind: "pull", name: nameOf.get(c.studentId) ?? "", room: "theory", repeat: true });
  }
  return items;
}

function sayFor(items: AlertItem[]): { kind: AlertKind; words?: string } | null {
  const calls = items.filter((i) => i.kind === "call");
  if (calls.length) return { kind: "call", words: callPhrase(calls) };
  const lost = items.filter((i) => i.kind === "lost");
  if (lost.length) return { kind: "lost", words: lostPhrase(lost) };
  const pulls = items.filter((i) => i.kind === "pull");
  if (pulls.length) return { kind: "pull", words: pullPhrase(pulls.map((p) => p.name)) };
  if (items.some((i) => i.kind === "red")) return { kind: "red" };
  return null;
}

/**
 * Alerts for this phone's job. Correction hears "Ahamed and Nila, go to Theory", again every
 * 30 seconds until he taps Sent or Not now. Evaluation hears "Theory wants Kumar now" the same way.
 * A knock when a student runs out of work: Theory or Evaluation for theory books, Correction when
 * every workbook level he handed in is waiting to be corrected.
 */
function Alerts(props: { role: Role; board: Board; views: View[]; now: number; live: boolean }) {
  const { role, board, views, now, live } = props;
  const items = alertItems(role, board, views, now);
  const seen = useRef<{ role: Role; keys: Set<string> } | null>(null);
  const lastRing = useRef(0);
  const latest = useRef({ items, live });
  latest.current = { items, live };

  const sound = (say: { kind: AlertKind; words?: string }) => {
    ring(say.kind, say.words);
    // Only count it if the phone could actually play it; otherwise ring again right after the first tap.
    if (alertsState().on) lastRing.current = Date.now();
  };

  // Something new: ring at once.
  useEffect(() => {
    const prev = seen.current;
    seen.current = { role, keys: new Set(items.map((i) => i.key)) };
    if (!prev || prev.role !== role) return; // first look: no noise
    const say = sayFor(items.filter((i) => !prev.keys.has(i.key)));
    if (say) sound(say);
  });

  // Still waiting: say it again until someone acts.
  useEffect(() => {
    const id = window.setInterval(() => {
      const { items, live } = latest.current;
      if (!live || !alertsState().on || Date.now() - lastRing.current < REPEAT_MS) return;
      const say = sayFor(items.filter((i) => i.repeat));
      if (say) sound(say);
    }, 2000);
    return () => window.clearInterval(id);
  }, []);
  return null;
}
