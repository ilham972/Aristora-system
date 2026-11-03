// This week's race: XP since Monday 00:00 in Sri Lanka, in his grade, first name and initial only. The top three on a
// podium, then the rest; his own row always (gold); how much XP passes the one above him; when the week ends.

import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { BoardRow, FamilyMe } from "../../convex/family";
import { query } from "./net";
import { Avatar, firstName, Gem, OwlBadge, problemWords, Waiting } from "./ui";

export type Board = { since: number; top: BoardRow[]; me: BoardRow | null; count: number };

const WEEK_MS = 7 * 24 * 60 * 60_000;

/** "4 நாள் 6 மணி" until Monday 00:00 (Sri Lanka). */
export function endsIn(since: number, now: number): string {
  const left = Math.max(0, since + WEEK_MS - now);
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  return d > 0 ? `${d} நாள் ${h} மணி` : h > 0 ? `${h} மணி` : `${Math.max(1, Math.ceil(left / 60_000))} நிமிடம்`;
}

/** Who he passes next: the row above him (or the last of the top ten, from below it), and the XP it takes. */
export function passOf(b: Board): { above: BoardRow | null; gap: number } {
  const mine = b.me;
  if (!mine || mine.rank <= 1) return { above: null, gap: 0 };
  const i = b.top.findIndex((r) => r.me);
  const above = i > 0 ? b.top[i - 1] : i < 0 ? (b.top[b.top.length - 1] ?? null) : null;
  return { above, gap: above ? above.xp - mine.xp + 1 : 0 };
}

function Podium(props: { rows: BoardRow[] }) {
  // 2nd, 1st, 3rd: the winner in the middle, highest.
  const order = [props.rows[1], props.rows[0], props.rows[2]];
  return (
    <div class="f-podium" aria-label="முதல் மூவர் · The top three">
      {order.map((r, i) =>
        r ? (
          <div key={r.name} class={`f-pod p${Math.min(r.rank, 3)}${r.me ? " me" : ""}`} style={{ animationDelay: `${[140, 0, 260][i]}ms` }}>
            {r.rank === 1 && (
              <svg class="f-crown" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                <path d="M3 8.5l4.5 4 4.5-7 4.5 7 4.5-4-2 10.5H5z" />
              </svg>
            )}
            <Avatar name={r.name} size="l" />
            <b class="f-pod-n">{r.me ? "நீ" : firstName(r.name)}</b>
            <span class="f-pod-xp">
              <Gem size={13} />
              {r.xp}
            </span>
            <span class="f-pod-col">{r.rank}</span>
          </div>
        ) : (
          <div key={`e${i}`} class="f-pod empty" />
        ),
      )}
    </div>
  );
}

function Row(props: { r: BoardRow; i: number }) {
  const r = props.r;
  return (
    <li class={`f-brow rise${r.me ? " me" : ""}`} style={{ animationDelay: `${props.i * 45}ms` }}>
      <span class="f-rank">{r.rank}</span>
      <Avatar name={r.name} size="s" />
      <b class="f-bname">{r.me ? `${r.name} (நீ)` : r.name}</b>
      <span class="f-bxp">
        <Gem size={14} />
        {r.xp}
      </span>
    </li>
  );
}

export function BoardTab(props: { top: ComponentChildren; me: FamilyMe | null }) {
  const [b, setB] = useState<Board | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    query("family:board")
      .then((x) => setB(x as Board))
      .catch((e) => setErr(problemWords(e)));
  }, []);
  const top = b?.top ?? [];
  const podium = top.slice(0, 3);
  const rest = top.slice(3);
  const mine = b?.me ?? null;
  const inTop = top.some((r) => r.me);
  const { above, gap } = b ? passOf(b) : { above: null, gap: 0 };
  const first = !!mine && mine.rank === 1 && mine.xp > 0;
  return (
    <>
      <header class="f-hero race">
        {props.top}
        <div class="f-hero-in">
          <div class="f-hero-w">
            <p class="f-kicker">இந்த வாரம்{props.me?.grade ? ` · Grade ${props.me.grade}` : ""}</p>
            <h1 class="f-title">போட்டி</h1>
            <p class="f-hsub">{b ? `முடிய ${endsIn(b.since, Date.now())}` : "…"}</p>
          </div>
          <OwlBadge mood={first ? "cheer" : "happy"} class="hero" />
        </div>
      </header>
      <section class="f-race f-card rise">
        {err && <p class="f-lead f-center-t">{err}</p>}
        {!b && !err && <Waiting />}
        {b && (podium.length > 0 ? <Podium rows={podium} /> : <p class="f-none">இந்த வாரம் இன்னும் யாரும் இல்லை. நீ முதலாவதாக வா!</p>)}
      </section>
      {b && (
        <>
          {first && <p class="f-pass top rise">நீ முதலிடத்தில்! இதைக் காப்பாற்று.</p>}
          {above && gap > 0 && (
            <p class="f-pass rise">
              இன்னும் <b>{gap} XP</b> எடுத்தால் {firstName(above.name)} ஐ முந்துவாய்!
            </p>
          )}
          {rest.length > 0 && (
            <ol class="f-board">
              {rest.map((r, i) => (
                <Row key={`${r.name}${r.rank}`} r={r} i={i} />
              ))}
            </ol>
          )}
          {mine && !inTop && (
            <ol class="f-board you">
              <Row r={mine} i={0} />
            </ol>
          )}
          <p class="f-muted small f-center-t f-pad-x">திங்கள் காலை எல்லோரும் 0 இலிருந்து · Everyone starts at 0 on Monday</p>
        </>
      )}
    </>
  );
}
