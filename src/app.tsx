import { useEffect, useRef, useState } from "preact/hooks";
import { callPhrase, pullPhrase, type RoomName } from "./announce";
import { Attendance } from "./attendance";
import type { Link } from "./backend";
import { ClassPage } from "./correction";
import { buildViews, evalQueue, fmtClock, liveSession, theoryGroups, theoryMembers, type View } from "./derive";
import { Focus } from "./focus";
import { Evaluation } from "./rooms";
import { TheoryTab } from "./theoryFocus";
import { Progress } from "./progress";
import { Settings } from "./settings";
import { alertsState, armAlerts, listenForTaps, ring, useAlertsState, type AlertKind } from "./sound";
import { clearHash, PinSheet, pinAsked, readHash, SignIn, stopAskingPin, type Hash } from "./signin";
import { hideSplash } from "./splash";
import { may, setRole, signOutHere, useStore, useTick, type Board, type Role } from "./store";
import { Sheet, Toasts } from "./ui";

/**
 * The bottom bar. Class is everyone's home (the whole class, each teacher's own taps on the rows); Theory and
 * Evaluation are those teachers' own pages. Marking papers (Focus) is a page from the top bar: the Correction job.
 */
type TabId = "class" | "theory" | "evaluation";
type Page = "board" | "settings" | "attendance" | "progress" | "focus";

const TABS: { id: TabId; label: string }[] = [
  { id: "class", label: "Class" },
  { id: "theory", label: "Theory" },
  { id: "evaluation", label: "Evaluation" },
];
const JOBS: Role[] = ["correction", "theory", "evaluation"];

/** Where this phone was: its tab, and Focus if it was marking. Before 29 Oct 2026 "correction" was the Class tab and "focus" a tab. */
function loadStart(): { tab: TabId; page: Page } {
  try {
    const r = localStorage.getItem("aristora.role");
    if (r === "theory" || r === "evaluation") return { tab: r, page: "board" };
    if (r === "focus") return { tab: "class", page: "focus" };
  } catch {
    /* private mode */
  }
  return { tab: "class", page: "board" };
}

/** The job this phone did last (Theory, Evaluation, or Correction in Focus): the Class tab's taps follow it. */
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
  // Settings, Attendance and Progress opened from Focus go back to Focus (the corrector's page), else to the tab.
  const [backTo, setBackTo] = useState<"board" | "focus">(start.page === "focus" ? "focus" : "board");
  // The address bar can hold a sign-in link (#join=...) or the setup code (#setup=...).
  const [, setHashSeen] = useState(0);
  const hash: Hash = readHash();
  const forgetHash = () => {
    clearHash();
    setHashSeen((n) => n + 1);
  };
  const [pinClosedFor, setPinClosedFor] = useState<string | null>(null);
  const now = useTick(10_000);
  const alerts = useAlertsState();
  const topRef = useRef<HTMLDivElement>(null);
  const loaded = !!board;
  const user = me?.user ?? null;
  // Class for everyone; Theory and Evaluation for those teachers. The phone remembers the last one.
  const jobs = JOBS.filter((j) => !user || user.role === "owner" || user.tabs.includes(j));
  const tabs = TABS.filter((t) => t.id === "class" || jobs.includes(t.id));
  const tab: TabId = tabs.some((t) => t.id === chosen) ? chosen : "class";
  // Attendance and Focus (signing students in, marking papers) are Correction's job; Progress needs Reports.
  const canCorrect = may("correction");
  const canProgress = may("reports");
  const shown: Page =
    ((page === "attendance" || page === "focus") && !canCorrect) || (page === "progress" && !canProgress) ? "board" : page;
  /** Open a page from the top bar; the same button again goes back. */
  const toggle = (p: "settings" | "attendance" | "progress") => {
    if (shown === p) {
      setPage(backTo);
      return;
    }
    if (shown === "focus" || shown === "board") setBackTo(shown);
    setPage(p);
  };
  // The job decides the taps, what the phone hears and the `by` the server records. Class: the job done last.
  const classJob: Role = lastJob && jobs.includes(lastJob) ? lastJob : (jobs[0] ?? "correction");
  const role: Role = shown === "focus" ? "correction" : tab === "class" ? classJob : tab;

  setRole(role);
  useEffect(() => {
    try {
      localStorage.setItem("aristora.role", shown === "focus" ? "focus" : tab);
    } catch {
      /* private mode */
    }
    const job: Role | null = shown === "focus" ? "correction" : tab === "class" ? null : tab;
    if (job && job !== lastJob) {
      setLastJob(job);
      try {
        localStorage.setItem("aristora.job", job);
      } catch {
        /* private mode */
      }
    }
  }, [tab, shown]);
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
  const evalRed = evalQueue(views, now).filter((m) => m.urgency === "red" && !m.blockedBy).length;
  const toSend = board.calls.filter((c) => c.status === "requested" && !c.pull).length;
  const session = liveSession(board, now);
  const inClass = views.filter((v) => v.where !== "absent").length;
  // Focus's count: workbook levels handed in, waiting to be corrected; red when someone has no work until then.
  const papers = views.reduce((a, v) => a + (v.ms?.waiting.length ?? 0), 0);
  const papersRed = views.some((v) => v.where === "hall" && v.ms?.dry && v.ms.needs.includes("correction"));

  return (
    <div class="app" data-role={role} data-tab={shown === "focus" ? "focus" : tab}>
      <div class="top-wrap" ref={topRef}>
        <header class="top">
          <div class="top-left">
            {canCorrect ? (
              <button
                type="button"
                class={`att-btn${shown === "attendance" ? " on" : ""}`}
                aria-pressed={shown === "attendance"}
                aria-label={`Attendance: ${inClass} in class`}
                onClick={() => toggle("attendance")}
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
                  stroke-linejoin="round"
                >
                  <circle cx="9" cy="8" r="3.6" />
                  <path d="M2.5 20.5c.7-3.7 3.3-5.8 6.5-5.8s5.8 2.1 6.5 5.8" />
                  <path d="m15.6 10.6 2.1 2.1 4.3-4.6" />
                </svg>
                <b class={`att-n${inClass ? "" : " zero"}`} aria-hidden="true">
                  {inClass}
                </b>
              </button>
            ) : (
              <span class="top-count">{inClass} in class</span>
            )}
            {canCorrect && (
              <button
                type="button"
                class={`att-btn focus-btn${shown === "focus" ? " on" : ""}`}
                aria-pressed={shown === "focus"}
                aria-label={`Focus: mark papers${papers ? `, ${papers} waiting` : ""}`}
                onClick={() => {
                  setBackTo("board");
                  setPage(shown === "focus" ? "board" : "focus");
                }}
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
                  <circle cx="12" cy="12" r="8.2" />
                  <circle cx="12" cy="12" r="3.6" />
                  <path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3" />
                </svg>
                {papers > 0 && (
                  <b class={`att-n${papersRed ? " red" : ""}`} aria-hidden="true">
                    {papers}
                  </b>
                )}
              </button>
            )}
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
            {session ? (
              <span class="clock" title="Time since the session started">
                {fmtClock(now - session.startedAt)}
              </span>
            ) : (
              <span class="clock off">No class</span>
            )}
            <LinkDot link={link} />
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
      ) : shown === "progress" ? (
        <Progress board={board} now={now} />
      ) : shown === "attendance" ? (
        <Attendance board={board} views={views} now={now} role={role} />
      ) : shown === "focus" ? (
        <Focus board={board} views={views} now={now} onAttendance={() => toggle("attendance")} />
      ) : tab === "theory" ? (
        <TheoryTab board={board} views={views} now={now} />
      ) : tab === "evaluation" ? (
        <Evaluation board={board} views={views} now={now} />
      ) : (
        <ClassPage board={board} views={views} now={now} job={role} onAttendance={() => toggle("attendance")} />
      )}

      <nav class={`tabs n${tabs.length}`} aria-label="Choose your page">
        {tabs.map((r) => {
          // A red number: something waits for that page's job while this phone is busy elsewhere.
          const badge =
            r.id === "class"
              ? canCorrect && role !== "correction"
                ? toSend
                : 0
              : r.id === "theory"
                ? role !== "theory"
                  ? theoryRed
                  : 0
                : role !== "evaluation"
                  ? evalRed
                  : 0;
          return (
            <button
              key={r.id}
              type="button"
              class={`tab ${r.id}${tab === r.id && shown === "board" ? " on" : ""}`}
              aria-current={tab === r.id ? "page" : undefined}
              onClick={() => {
                setTab(r.id);
                setBackTo("board");
                setPage("board");
              }}
            >
              <span class="tab-mark" aria-hidden="true" />
              <span>{r.label}</span>
              {badge > 0 && <span class="tab-badge">{badge}</span>}
            </button>
          );
        })}
      </nav>
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

type AlertItem = { key: string; kind: AlertKind; name: string; room: RoomName; repeat: boolean };

/** What this phone's job should hear about right now. */
function alertItems(role: Role, board: Board, views: View[], now: number): AlertItem[] {
  const nameOf = new Map(views.map((v) => [v.s._id as string, v.s.name]));
  const items: AlertItem[] = [];
  if (role === "correction") {
    for (const c of board.calls)
      if (c.status === "requested" && !c.pull)
        items.push({ key: `call:${c._id}`, kind: "call", name: nameOf.get(c.studentId) ?? "", room: c.room, repeat: true });
    // A workbook student with every level handed in waits for Correction: knock once.
    for (const v of views)
      if (v.where === "hall" && v.ms?.dry && v.ms.needs.includes("correction"))
        items.push({ key: `red:${v.s._id}`, kind: "red", name: v.s.name, room: "theory", repeat: false });
  } else if (role === "theory") {
    for (const m of theoryMembers(theoryGroups(views)))
      if (m.urgency === "red" && !m.inEvaluation)
        items.push({ key: `red:${m.v.s._id}`, kind: "red", name: m.v.s.name, room: "theory", repeat: false });
  } else {
    for (const m of evalQueue(views, now))
      if (m.urgency === "red" && !m.blockedBy)
        items.push({ key: `red:${m.v.s._id}`, kind: "red", name: m.v.s.name, room: "evaluation", repeat: false });
    for (const c of board.calls)
      if (c.pull && c.status === "requested")
        items.push({ key: `pull:${c._id}`, kind: "pull", name: nameOf.get(c.studentId) ?? "", room: "theory", repeat: true });
  }
  return items;
}

function sayFor(items: AlertItem[]): { kind: AlertKind; words?: string } | null {
  const calls = items.filter((i) => i.kind === "call");
  if (calls.length) return { kind: "call", words: callPhrase(calls) };
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
