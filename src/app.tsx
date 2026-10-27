import { useEffect, useRef, useState } from "preact/hooks";
import type { Link } from "./backend";
import { Correction } from "./correction";
import { buildViews, evalQueue, fmtClock, theoryGroups, type View } from "./derive";
import { Evaluation, Theory } from "./rooms";
import { Settings } from "./settings";
import { alert, onSoundReady, soundReady, unlockSound } from "./sound";
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
  const [sound, setSound] = useState(soundReady());

  setRole(role);
  useEffect(() => {
    try {
      localStorage.setItem("aristora.role", role);
    } catch {
      /* private mode */
    }
  }, [role]);
  useEffect(() => onSoundReady(() => setSound(true)), []);
  // Phones only allow sound after a real tap; try on every tap until it works.
  useEffect(() => {
    if (sound) return;
    const events = ["pointerup", "touchend", "click", "keydown"] as const;
    const tryUnlock = () => unlockSound();
    for (const e of events) window.addEventListener(e, tryUnlock, { passive: true });
    return () => {
      for (const e of events) window.removeEventListener(e, tryUnlock);
    };
  }, [sound]);

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
      {!sound && (
        <button type="button" class="sound-banner" onClick={unlockSound}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
            <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          Tap here to turn on alert sounds
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
      <Alerts role={role} board={board} views={views} now={now} />
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

/** Sounds for this phone's job: new calls (Correction), students running out of work (rooms). */
function Alerts(props: { role: Role; board: Board; views: View[]; now: number }) {
  const { role, board, views, now } = props;
  const seen = useRef<{ role: Role; keys: Set<string> } | null>(null);
  const lastRing = useRef(0);

  const keys = new Set<string>();
  if (role === "correction") {
    for (const c of board.calls) if (c.status === "requested" && !c.pull) keys.add(`call:${c._id}`);
  } else if (role === "theory") {
    for (const g of theoryGroups(views)) for (const m of g.members) if (m.urgency === "red" && !m.inEvaluation) keys.add(`red:${m.v.s._id}`);
  } else {
    for (const m of evalQueue(views, now)) if (m.urgency === "red" && !m.blockedBy) keys.add(`red:${m.v.s._id}`);
    for (const c of board.calls) if (c.pull && c.status === "requested") keys.add(`pull:${c._id}`);
  }

  useEffect(() => {
    const prev = seen.current;
    seen.current = { role, keys };
    if (!prev || prev.role !== role) return; // first look: no noise
    const fresh = [...keys].filter((k) => !prev.keys.has(k));
    if (fresh.some((k) => k.startsWith("call:"))) alert("call");
    else if (fresh.some((k) => k.startsWith("pull:"))) alert("pull");
    else if (fresh.some((k) => k.startsWith("red:"))) alert("red");
    if (fresh.length) lastRing.current = Date.now();
  });

  // Correction: ring again every minute while a call waits.
  useEffect(() => {
    if (role !== "correction") return;
    const waiting = board.calls.filter((c) => c.status === "requested" && !c.pull);
    if (waiting.length === 0) return;
    const oldest = Math.min(...waiting.map((c) => c.createdAt));
    if (now - oldest > 60_000 && Date.now() - lastRing.current > 55_000) {
      alert("call");
      lastRing.current = Date.now();
    }
  });
  return null;
}
