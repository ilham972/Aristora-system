// This week's race (the board): XP since Monday 00:00 in Sri Lanka, in his grade, first name and initial only. The top
// three on a podium, then the rest; his own row always; how much XP passes the one above him; when the week ends.

import { useEffect, useState } from "preact/hooks";
import type { BoardRow, FamilyMe } from "../../convex/family";
import { query } from "./net";
import { Avatar, firstName, Icon, problemWords, Spark } from "./ui";

type Board = { since: number; top: BoardRow[]; me: BoardRow | null; count: number };

const WEEK_MS = 7 * 24 * 60 * 60_000;

/** "4 நாள் 6 மணி" until Monday 00:00 (Sri Lanka). */
function endsIn(since: number, now: number): string {
  const left = Math.max(0, since + WEEK_MS - now);
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  return d > 0 ? `${d} நாள் ${h} மணி` : h > 0 ? `${h} மணி` : `${Math.max(1, Math.ceil(left / 60_000))} நிமிடம்`;
}

function Podium(props: { rows: BoardRow[] }) {
  // 2nd, 1st, 3rd: the winner in the middle, highest.
  const order = [props.rows[1], props.rows[0], props.rows[2]];
  return (
    <div class="f-podium" aria-label="முதல் மூவர் · The top three">
      {order.map((r, i) =>
        r ? (
          <div key={r.name} class={`f-pod p${r.rank <= 3 ? r.rank : 3}${r.me ? " me" : ""}`} style={{ animationDelay: `${[120, 0, 220][i]}ms` }}>
            {r.rank === 1 && (
              <svg class="f-crown" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                <path d="M3 8.5l4.5 4 4.5-7 4.5 7 4.5-4-2 10.5H5z" />
              </svg>
            )}
            <Avatar name={r.name} size="l" />
            <b class="f-pod-n">{r.me ? "நீ" : firstName(r.name)}</b>
            <span class="f-pod-xp">
              <Spark size={13} />
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
        <Spark size={14} />
        {r.xp}
      </span>
    </li>
  );
}

export function BoardTab(props: { me: FamilyMe | null }) {
  const [b, setB] = useState<Board | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    query("family:board")
      .then((x) => setB(x as Board))
      .catch((e) => setErr(problemWords(e)));
  }, []);
  const now = Date.now();
  const top = b?.top ?? [];
  const podium = top.slice(0, 3);
  const rest = top.slice(3);
  const mine = b?.me ?? null;
  const inTop = top.some((r) => r.me);
  // Who he passes next: the row above him (or the last of the top ten, from below it).
  const above = mine && mine.rank > 1 ? (inTop ? top[top.findIndex((r) => r.me) - 1] : top[top.length - 1]) : undefined;
  const gap = above && mine ? above.xp - mine.xp + 1 : 0;
  return (
    <div class="f-boardtab">
      <section class="f-race rise">
        <span class="f-race-ic">
          <Icon name="board" size={26} />
        </span>
        <div>
          <b>இந்த வாரப் போட்டி</b>
          <small>
            {props.me?.grade ? `Grade ${props.me.grade} · ` : ""}
            {b ? `முடிய ${endsIn(b.since, now)}` : "…"}
          </small>
        </div>
      </section>
      {err && <p class="f-lead f-center-t">{err}</p>}
      {!b && !err && <p class="f-muted f-pad f-center-t">…</p>}
      {b && (
        <>
          {podium.length > 0 ? <Podium rows={podium} /> : <p class="f-none">இந்த வாரம் இன்னும் யாரும் இல்லை. நீ முதலாவதாக வா!</p>}
          {mine && mine.rank === 1 && mine.xp > 0 && <p class="f-pass top">நீ முதலிடத்தில்! இதைக் காப்பாற்று.</p>}
          {above && gap > 0 && (
            <p class="f-pass">
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
          <p class="f-muted small f-center-t">திங்கள் காலை எல்லோரும் 0 இலிருந்து · Everyone starts at 0 on Monday</p>
        </>
      )}
    </div>
  );
}
