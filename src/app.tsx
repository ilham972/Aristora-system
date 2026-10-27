import { useEffect, useRef, useState } from "preact/hooks";
import { callPhrase, pullPhrase, type RoomName } from "./announce";
import type { Link } from "./backend";
import { Correction } from "./correction";
import { buildViews, evalQueue, fmtClock, theoryGroups, type View } from "./derive";
import { Evaluation, Theory } from "./rooms";
import { Settings } from "./settings";
import { alertsState, armAlerts, listenForTaps, ring, useAlertsState, type AlertKind } from "./sound";
import { setRole, useStore, useTick, type Board, type Role } from "./store";
import { Toasts } from "./ui";

const ROLES: { id: Role; label: string }[] = [
  { id: "correction", label: "Correction" },
  { id: "theory", label: "Theory" },
  { id: "evaluation", label: "Evaluation" },
];
const STALE_MS = 4 * 60 * 60_000;

function loadRole(): Role {
  try {
    const r = localStorage.getItem("aristora.role");
    if (r === "correction" || r === "theory" || r === "evaluation") return r;
  } catch {
    /* private mode */
  }
  return "correction";
}

export function App() {
  const { board, boardError, link } = useStore();
  const [role, setRoleState] = useState<Role>(loadRole);
  const [page, setPage] = useState<"board" | "settings">("board");
  const now = useTick(10_000);
  const alerts = useAlertsState();
  const topRef = useRef<HTMLDivElement>(null);
  const loaded = !!board;

  setRole(role);
  useEffect(() => {
    try {
      localStorage.setItem("aristora.role", role);
    } catch {
      /* private mode */
    }
  }, [role]);
  // Phones only allow sound after a tap: every tap turns alerts (back) on where needed.
  useEffect(() => listenForTaps(), []);
  // Sticky strips sit right under the header, whatever its height (it grows when offline).
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
  const theoryRed = theoryGroups(views)
    .flatMap((g) => g.members)
    .filter((m) => m.urgency === "red" && !m.inEvaluation).length;
  const evalRed = evalQueue(views, now).filter((m) => m.urgency === "red" && !m.blockedBy).length;
  const toSend = board.calls.filter((c) => c.status === "requested" && !c.pull).length;
  const session = board.session && now - board.session.lastActivityAt < STALE_MS ? board.session : null;

  return (
    <div class="app" data-role={role}>
      <div class="top-wrap" ref={topRef}>
        <header class="top">
          <div class="top-role">
            <span class="role-mark" aria-hidden="true" />
            <h1>{page === "settings" ? "Settings" : ROLES.find((r) => r.id === role)!.label}</h1>
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
              class={`icon-btn${page === "settings" ? " on" : ""}`}
              aria-label="Settings"
              onClick={() => setPage(page === "settings" ? "board" : "settings")}
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

      {page === "settings" ? (
        <Settings views={views} onClose={() => setPage("board")} />
      ) : role === "correction" ? (
        <Correction board={board} views={views} now={now} />
      ) : role === "theory" ? (
        <Theory board={board} views={views} now={now} />
      ) : (
        <Evaluation board={board} views={views} now={now} />
      )}

      <nav class="tabs" aria-label="Choose your job">
        {ROLES.map((r) => {
          const badge = r.id === "correction" ? toSend : r.id === "theory" ? theoryRed : evalRed;
          return (
            <button
              key={r.id}
              type="button"
              class={`tab ${r.id}${role === r.id && page === "board" ? " on" : ""}`}
              aria-current={role === r.id ? "page" : undefined}
              onClick={() => {
                setRoleState(r.id);
                setPage("board");
              }}
            >
              <span class="tab-mark" aria-hidden="true" />
              <span>{r.label}</span>
              {badge > 0 && role !== r.id && <span class="tab-badge">{badge}</span>}
            </button>
          );
        })}
      </nav>
      <Toasts />
      <Alerts role={role} board={board} views={views} now={now} live={link.connected} />
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

type AlertItem = { key: string; kind: AlertKind; name: string; room: RoomName; repeat: boolean };

/** What this phone's job should hear about right now. */
function alertItems(role: Role, board: Board, views: View[], now: number): AlertItem[] {
  const nameOf = new Map(views.map((v) => [v.s._id as string, v.s.name]));
  const items: AlertItem[] = [];
  if (role === "correction") {
    for (const c of board.calls)
      if (c.status === "requested" && !c.pull)
        items.push({ key: `call:${c._id}`, kind: "call", name: nameOf.get(c.studentId) ?? "", room: c.room, repeat: true });
  } else if (role === "theory") {
    for (const g of theoryGroups(views))
      for (const m of g.members)
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
 * Theory and Evaluation get a knock when a student runs out of work.
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
