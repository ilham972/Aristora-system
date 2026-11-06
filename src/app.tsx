import { useEffect, useRef, useState } from "preact/hooks";
import { callPhrase, comingPhrase, lostPhrase, pullPhrase, type RoomName } from "./announce";
import { AttendanceSheet } from "./attendance";
import { busyHere, takeReopen, watchUpdates } from "./appVersion";
import type { Link } from "./backend";
import { ClassPage } from "./correction";
import { buildViews, evalQueue, fmtClock, isWalking, liveSession, theoryGroups, theoryMembers, WALK_MS, waitingAll, type View } from "./derive";
import { Focus } from "./focus";
import { EvaluationPage } from "./evalFocus";
import { TheoryTab } from "./theoryFocus";
import { BossPage } from "./boss";
import { ConsultPage, myConsults } from "./consult";
import { ManagerPage } from "./manager";
import { SimBanner } from "./sim";
import { Progress } from "./progress";
import { Settings } from "./settings";
import { WholeClassPage } from "./wholeClass";
import { useFeedbackNew } from "./feedbackList";
import { usePhotosWaiting } from "./photoQueue";
import { openLane } from "./homeLane";
import { useAskCount } from "./familyAsks";
import { useGiftsWaiting } from "./raceSettings";
import { alertsState, armAlerts, listenForTaps, ring, useAlertsState, type AlertKind } from "./sound";
import { clearHash, PinSheet, pinAsked, readHash, SignIn, stopAskingPin, type Hash } from "./signin";
import { hideSplash } from "./splash";
import { currentMe, may, setRole, signOutHere, testMode, useStore, useTick, type Board, type Role } from "./store";
import { Sheet, Toasts } from "./ui";

/**
 * The bottom bar (30 Oct 2026, his call): the Class tab for everyone (3 Nov 2026: the hall and every teacher's room,
 * the Manager page before; only managers act on it), then each job's own page, Correction (marking papers; the code
 * calls it Focus), Theory and Evaluation, for the jobs this person has. Everyone's register (the Register: a list
 * icon) and Progress are in the top bar.
 */
type TabId = "class" | "correction" | "theory" | "evaluation";
type Page = "board" | "register" | "settings" | "progress" | "boss" | "teach" | "consult";

const TABS: { id: TabId; label: string }[] = [
  { id: "class", label: "Class" },
  { id: "correction", label: "Correction" },
  { id: "theory", label: "Theory" },
  { id: "evaluation", label: "Evaluation" },
];
const JOBS: Role[] = ["correction", "theory", "evaluation"];

/**
 * Where this phone was: the Class tab ("hall"), Correction ("focus"), Theory or Evaluation, or the Register ("class":
 * it was called Class until 3 Nov 2026; "correction" meant it before 29 Oct 2026). Nothing kept: her first job's tab.
 */
function loadStart(): { tab: TabId | null; page: Page } {
  try {
    const r = localStorage.getItem("aristora.role");
    if (r === "theory" || r === "evaluation") return { tab: r, page: "board" };
    if (r === "focus") return { tab: "correction", page: "board" };
    // ("manager": the Manager tab of 2–3 Nov 2026, now the Class tab.)
    if (r === "hall" || r === "manager") return { tab: "class", page: "board" };
    if (r === "class" || r === "correction") return { tab: null, page: "register" };
  } catch {
    /* private mode */
  }
  return { tab: null, page: "board" };
}

/** The pages a top-bar page goes back to: the bottom tab, or the Register. */
type Home = "board" | "register";

/** The Class tab's mark: the centre from above, the rooms and the hall (the Manager button's icon until 3 Nov 2026). */
function ClassMark() {
  return (
    <svg
      class="tab-plan"
      viewBox="0 0 24 24"
      width="19"
      height="19"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="2.3"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="3" y="3.5" width="18" height="17" rx="2.5" />
      <path d="M3 10.5h18M12 3.5v7" />
    </svg>
  );
}

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
  // Loaded again by the upload sheet's Update (an older copy of the app was open): back on Settings → Books.
  const [reopen, setReopen] = useState(() => (takeReopen() === "books" ? ("books" as const) : null));
  const [chosen, setTab] = useState<TabId | null>(start.tab);
  const [page, setPage] = useState<Page>(reopen ? "settings" : start.page);
  const [lastJob, setLastJob] = useState<Role | null>(loadJob);
  // Settings and Progress go back to the page they were opened from: the Register or the bottom tab.
  const [backTo, setBackTo] = useState<Home>(start.page === "register" ? "register" : "board");
  // The address bar can hold a sign-in link (#join=...) or the setup code (#setup=...).
  const [, setHashSeen] = useState(0);
  const hash: Hash = readHash();
  const forgetHash = () => {
    clearHash();
    setHashSeen((n) => n + 1);
  };
  const [pinClosedFor, setPinClosedFor] = useState<string | null>(null);
  // Attendance: a full page over any page (from the count by the clock, or the Register when nobody is in yet).
  const [attOpen, setAttOpen] = useState(false);
  const now = useTick(10_000);
  const alerts = useAlertsState();
  const topRef = useRef<HTMLDivElement>(null);
  const loaded = !!board;
  const user = me?.user ?? null;
  // The Class tab for everyone, then Correction, Theory and Evaluation for those jobs (the bottom bar).
  const jobs = JOBS.filter((j) => !user || user.role === "owner" || user.tabs.includes(j));
  // Photos from home are marked on the Correction page's ⌂ lane (5 Nov 2026): Photos people get its tab even without the
  // Correction job (then only the lane, and the phone keeps its own job's alerts, never Correction's calls).
  const photosOnly = may("photos") && !jobs.includes("correction");
  const tabs = TABS.filter((t) => t.id === "class" || jobs.includes(t.id) || (t.id === "correction" && photosOnly));
  // The Class tab's powers (send students, mark teachers arrived): the owner, and whoever has the Manager job.
  const isManager = user?.role === "owner" || !!user?.tabs.includes("manager");
  // Nothing kept on this phone: the managers start on the Class tab, the others on their first job's page.
  const first: TabId = isManager ? "class" : (tabs.find((t) => t.id !== "class")?.id ?? "class");
  const tab: TabId = chosen && tabs.some((t) => t.id === chosen) ? chosen : first;
  // Correction (marking papers, and signing students in with its +) is Correction's job; Progress needs Reports.
  const canCorrect = may("correction");
  const canProgress = may("reports");
  // The whole-class lesson (3 Nov 2026): whoever teaches (Theory, Evaluation) and the owner.
  const canTeach = may("theory") || may("evaluation");
  // The Owner page: the owner only (it shows each teacher's own numbers and his money).
  const isOwner = user?.role === "owner";
  // Consultation (5 Nov 2026, his ask: "not for everyone, the people I pick"): the owner and the Consultation tick.
  const canConsult = may("consult");
  const shown: Page =
    (page === "progress" && !canProgress) || (page === "boss" && !isOwner) || (page === "teach" && !canTeach) || (page === "consult" && !canConsult)
      ? backTo
      : page;
  const base: Home = shown === "register" || shown === "board" ? shown : backTo;
  /** Open a page from the top bar; the same button again goes back. */
  const toggle = (p: "settings" | "progress" | "boss" | "teach" | "consult") => {
    if (shown === p) {
      setPage(backTo);
      return;
    }
    if (shown === "board" || shown === "register") setBackTo(shown);
    setPage(p);
  };
  /** The Register from the top bar: it just opens. */
  const goRegister = () => {
    setBackTo("register");
    setPage("register");
  };
  // The job decides the taps, what the phone hears and the `by` the server records. The Register and the Class tab:
  // the job done last.
  const classJob: Role = lastJob && jobs.includes(lastJob) ? lastJob : (jobs[0] ?? "correction");
  const onClassTab = shown === "board" && tab === "class";
  const role: Role = base === "register" || tab === "class" || (tab === "correction" && photosOnly) ? classJob : tab;

  // A manager's taps on the Class tab are recorded as the manager's ("by the manager" in the history).
  setRole(onClassTab && isManager ? "manager" : role);
  useEffect(() => {
    try {
      localStorage.setItem("aristora.role", base === "register" ? "class" : tab === "correction" ? "focus" : tab === "class" ? "hall" : tab);
    } catch {
      /* private mode */
    }
    const job: Role | null = base === "register" || tab === "class" || (tab === "correction" && photosOnly) ? null : tab;
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
  // A page left open keeps its old code (5 Nov 2026: his upload refused by the copy open since the night before): each
  // time it comes back to the screen it looks for a newer version. Back after half an hour with nothing to lose (no tap
  // waiting to be sent, nothing typed, no sheet open), it loads it by itself; else the banner asks for one tap.
  const [newer, setNewer] = useState(false);
  const linkNow = useRef(link);
  linkNow.current = link;
  useEffect(
    () =>
      watchUpdates({
        page: "/",
        safe: () => linkNow.current.connected && linkNow.current.sending === 0 && !busyHere(),
        onNewer: () => setNewer(true),
      }),
    [],
  );
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
  // Feedback from the family app not read yet (owner and people with Feedback): a count on the Settings gear. Before
  // any early return (a hook).
  const fbNew = useFeedbackNew(!!me?.user && may("feedback"));
  // Photos from home waiting to be marked (4 Nov 2026; the owner and people with Photos): on the same gear, red when
  // one waited over a day; Settings opens on Photos then.
  const photos = usePhotosWaiting(!!me?.user && may("photos"));
  // What students asked for in the family app (a photo for the race, a new name), waiting for an OK (owner and
  // Students): on the same gear; Settings opens on Students then.
  const asks = useAskCount(!!me?.user && may("students"));
  // Gifts from the centre waiting to be given (7 Nov 2026; the owner and the Manager): Settings → Race.
  const gifts = useGiftsWaiting(!!me?.user && may("manager"));
  const gearN = photos.n + fbNew + asks + gifts;

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
  // Students the manager sent to this teacher, still on their way to her (her Arrived not tapped yet), per room.
  const myId = user?._id;
  const comingTo = (room: "theory" | "evaluation") => board.calls.filter((c) => c.byManager && c.teacherId === myId && c.room === room && isWalking(c)).length;
  // The Class tab's count: students in the hall with no work right now (red), for whoever looks.
  const idleNow = views.filter((v) => v.where === "hall" && v.tone === "red").length;
  // Her consultation's students (called, on the way, with her): a corner count on its icon while she is elsewhere.
  const consults = canConsult ? myConsults(board, myId) : 0;
  const icons = 1 + (canProgress ? 1 : 0) + (isOwner ? 1 : 0) + (canConsult ? 1 : 0) + (canTeach ? 1 : 0);

  return (
    <div
      class={`app${testMode() ? " test-mode" : ""}`}
      data-role={role}
      data-tab={
        shown === "register"
          ? "register"
          : shown === "teach"
            ? "theory"
            : shown === "consult"
              ? "evaluation"
              : tab === "class"
                ? "hall"
                : tab === "correction"
                  ? "focus"
                  : tab
      }
    >
      <div class="top-wrap" ref={topRef}>
        <header class="top">
          {/* Four or five icons (the owner: Register, Progress, Owner, Consultation, Whole class): tighter on phones, so
              the clock fits. */}
          <div class={`top-left${icons >= 4 ? " many" : ""}${icons >= 5 ? " five" : ""}`}>
            <button
              type="button"
              class={`att-btn class-btn${shown === "register" ? " on" : ""}`}
              aria-pressed={shown === "register"}
              aria-label="Register: everyone in class, row by row"
              onClick={goRegister}
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
            {isOwner && (
              <button
                type="button"
                class={`att-btn boss-btn${shown === "boss" ? " on" : ""}`}
                aria-pressed={shown === "boss"}
                aria-label="Owner: the whole business"
                onClick={() => toggle("boss")}
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
                  <path d="M3.5 17a8.5 8.5 0 1 1 17 0" />
                  <path d="M12 17l4.2-5.6" />
                  <circle cx="12" cy="17" r="1.4" fill="currentColor" />
                </svg>
              </button>
            )}
            {canConsult && (
              <button
                type="button"
                class={`att-btn cx-btn${shown === "consult" ? " on" : ""}`}
                aria-pressed={shown === "consult"}
                aria-label={`Consultation: call a student to you, one to one${consults ? `, ${consults} with you or coming` : ""}`}
                onClick={() => toggle("consult")}
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
                  <circle cx="8.5" cy="9" r="3.2" />
                  <path d="M2.8 20.5c.4-3.6 2.8-5.8 5.7-5.8s5.3 2.2 5.7 5.8" />
                  <path d="M14.2 3.5h6.3a1.3 1.3 0 0 1 1.3 1.3v3.9a1.3 1.3 0 0 1-1.3 1.3h-2.9l-2.4 2v-2h-1a1.3 1.3 0 0 1-1.3-1.3V4.8a1.3 1.3 0 0 1 1.3-1.3Z" />
                </svg>
                {consults > 0 && shown !== "consult" && (
                  <b class="cx-badge" aria-hidden="true">
                    {consults}
                  </b>
                )}
              </button>
            )}
            {canTeach && (
              <button
                type="button"
                class={`att-btn teach-btn${shown === "teach" ? " on" : ""}`}
                aria-pressed={shown === "teach"}
                aria-label="Whole class: teach any book's lesson to everyone here"
                onClick={() => toggle("teach")}
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
                  <rect x="3" y="3.5" width="18" height="12" rx="1.6" />
                  <path d="M8.5 21l3.5-5.5 3.5 5.5" />
                  <path d="M7 8h7M7 11.2h4.5" />
                </svg>
              </button>
            )}
          </div>
          <div class="top-meta">
            <TopStat
              inClass={inClass}
              clock={session ? fmtClock(now - session.startedAt) : null}
              test={testMode()}
              link={link}
              onTap={canCorrect ? () => setAttOpen(true) : undefined}
            />
            <button
              type="button"
              class={`icon-btn has-n${shown === "settings" ? " on" : ""}`}
              aria-label={
                gearN > 0
                  ? `Settings${photos.n > 0 ? `, ${photos.n} photos to mark` : ""}${asks > 0 ? `, ${asks} waiting for your OK` : ""}${fbNew > 0 ? `, ${fbNew} new feedback` : ""}${gifts > 0 ? `, ${gifts} gifts to give` : ""}`
                  : "Settings"
              }
              onClick={() => toggle("settings")}
            >
              {gearN > 0 && (
                <b class={`gear-n${photos.late ? " late" : ""}`} aria-hidden="true">
                  {gearN > 9 ? "9+" : gearN}
                </b>
              )}
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
        {newer && link.connected && <UpdateBanner sending={link.sending} />}
      </div>
      <SimBanner sim={board.sim} />
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
        <Settings
          views={views}
          onClose={() => {
            setReopen(null);
            setPage(backTo);
          }}
          start={reopen ?? (photos.n > 0 ? "photos" : asks > 0 ? "students" : fbNew > 0 ? "feedback" : gifts > 0 ? "race" : undefined)}
          fbNew={fbNew}
          gifts={gifts}
          phN={photos.n}
          phLate={photos.late}
          asks={asks}
          onPhotos={() => {
            openLane();
            setReopen(null);
            setTab("correction");
            setBackTo("board");
            setPage("board");
          }}
        />
      ) : shown === "register" ? (
        <ClassPage board={board} views={views} now={now} job={role} onAttendance={() => setAttOpen(true)} />
      ) : shown === "progress" ? (
        <Progress board={board} now={now} />
      ) : shown === "boss" ? (
        <BossPage board={board} views={views} now={now} />
      ) : shown === "teach" ? (
        <WholeClassPage views={views} />
      ) : shown === "consult" ? (
        <ConsultPage board={board} views={views} now={now} />
      ) : tab === "class" ? (
        <ManagerPage board={board} views={views} now={now} canManage={isManager} meId={user._id} />
      ) : tab === "correction" ? (
        <Focus board={board} views={views} now={now} />
      ) : tab === "evaluation" ? (
        <EvaluationPage board={board} views={views} now={now} />
      ) : (
        <TheoryTab board={board} views={views} now={now} />
      )}

      <nav class={`tabs n${tabs.length}`} aria-label="Choose your page">
        {tabs.map((r) => {
          // A number: something waits for that page's job while this phone is busy elsewhere. Class: students in the
          // hall with no work (red). Theory, Evaluation: students with no work (red). Correction: papers handed in
          // (amber; red when someone has no work until then).
          const here = tab === r.id && shown === "board";
          const away = !here;
          // The manager sent students to her for this page (3 Nov 2026): they come first, in the room's colour.
          const coming = !away || (r.id !== "theory" && r.id !== "evaluation") ? 0 : comingTo(r.id);
          // Someone who only marks the photos from home: Correction's number is the photos waiting (red after a day).
          const lane = r.id === "correction" && photosOnly;
          const badge = !away
            ? 0
            : coming || (r.id === "class" ? idleNow : r.id === "theory" ? theoryRed : r.id === "evaluation" ? evalRed : lane ? photos.n : papers);
          const amber = r.id === "correction" && (lane ? !photos.late : !papersRed);
          return (
            <button
              key={r.id}
              type="button"
              class={`tab ${r.id}${here ? " on" : ""}`}
              aria-current={here ? "page" : undefined}
              aria-label={`${r.label}${badge ? `, ${badge} ${coming ? "coming to you" : r.id === "correction" ? "waiting" : "with no work"}` : ""}`}
              onClick={() => {
                setTab(r.id);
                setBackTo("board");
                setPage("board");
              }}
            >
              {r.id === "class" ? <ClassMark /> : <span class="tab-mark" aria-hidden="true" />}
              <span>{r.label}</span>
              {badge > 0 && <span class={`tab-badge${coming ? ` tb-coming ${r.id}` : amber ? " tb-amber" : ""}`}>{badge}</span>}
            </button>
          );
        })}
      </nav>
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
function TopStat(props: { inClass: number; clock: string | null; test?: boolean; link: Link; onTap?: () => void }) {
  const { inClass, clock } = props;
  // The simulation (Settings): SIM where the clock is, so nobody mistakes it for the real class.
  const words = props.test ? `The simulation: ${inClass} made-up students in class` : `${inClass} in class, ${clock ? `class time ${clock}` : "no class now"}`;
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
      <span class={`clock${props.test ? " ts-test" : clock ? "" : " off"}`} aria-hidden="true">
        {props.test ? "SIM" : (clock ?? "No class")}
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

/** A newer version of the app is online (src/appVersion.ts): one tap loads it, once this phone's taps are sent. */
function UpdateBanner(props: { sending: number }) {
  return (
    <button type="button" class="app-update" disabled={props.sending > 0} onClick={() => location.reload()}>
      {props.sending > 0 ? "A new version of the app is ready. Sending your taps first…" : "A new version of the app is ready. Tap here to update."}
    </button>
  );
}

const REPEAT_MS = 30_000;

type AlertItem = { key: string; kind: AlertKind; name: string; room: RoomName; repeat: boolean; teacher?: string; open?: RoomName; consult?: boolean };

/** What this phone's job should hear about right now. */
function alertItems(role: Role, board: Board, views: View[], now: number): AlertItem[] {
  const nameOf = new Map(views.map((v) => [v.s._id as string, v.s.name]));
  const items: AlertItem[] = [];
  const me = currentMe()?._id;
  // The manager sent a student to her (3 Nov 2026): her phone says so every 30 s until she taps Arrived, on any page
  // (the owner teaching from the Correction page too): "Open Evaluation" when she isn't on that room's page.
  for (const c of board.calls)
    if (c.byManager && c.teacherId === me && isWalking(c))
      items.push({ key: `coming:${c._id}`, kind: "coming", name: nameOf.get(c.studentId) ?? "", room: c.room, repeat: true, open: c.room !== role ? c.room : undefined });
  if (role === "correction") {
    for (const c of board.calls)
      if (c.status === "requested" && !c.pull)
        items.push({ key: `call:${c._id}`, kind: "call", name: nameOf.get(c.studentId) ?? "", room: c.room, repeat: true, teacher: c.teacher, consult: c.consult });
    // Sent to Theory 3 minutes ago and Theory hasn't tapped Arrived: where is he? (Again every 30 s until it's settled.)
    for (const c of board.calls)
      if (isWalking(c) && now - (c.sentAt ?? c.createdAt) >= WALK_MS)
        items.push({ key: `lost:${c._id}`, kind: "lost", name: nameOf.get(c.studentId) ?? "", room: c.room, repeat: true, teacher: c.teacher, consult: c.consult });
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
    const mine = (studentId: string) =>
      board.calls.some((e) => e.studentId === studentId && e.room === "evaluation" && e.status === "sent" && (!e.teacherId || e.teacherId === me));
    for (const c of board.calls)
      if (c.pull && c.status === "requested" && mine(c.studentId))
        items.push({ key: `pull:${c._id}`, kind: "pull", name: nameOf.get(c.studentId) ?? "", room: "theory", repeat: true });
  }
  return items;
}

function sayFor(items: AlertItem[]): { kind: AlertKind; words?: string } | null {
  const coming = items.filter((i) => i.kind === "coming");
  if (coming.length) return { kind: "coming", words: comingPhrase(coming.map((c) => c.name), coming.find((c) => c.open)?.open) };
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
