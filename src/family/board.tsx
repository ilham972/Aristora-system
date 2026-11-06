// The race (7 Nov 2026, his voice note): every student of ARISTORA, joined the app or not; XP from class and home this
// week; two lists, his grade and the whole ARISTORA ("they can see both ranks"); the top three on a podium, then the
// rest with how each moved since yesterday; 👑 = last week's champion of that list; the ones with no XP yet this week at
// the end with no number ("not started this week"); how much XP passes the one above him; the grade cup (ARISTORA:
// the share of each grade that learned this week). Tap anyone = his profile. Faces: the photos the teachers said OK to
// (his own always, on his phone); 🎂 on a birthday. The lists and their rules: convex/lib/race.ts.

import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { FamilyBoard, FamilyMe } from "../../convex/family";
import { champsOf, cupOf, cupPct, passOf, placed, type Placed, type RaceRow } from "../../convex/lib/race";
import { keep, query } from "./net";
import { picOf, usePics } from "./pics";
import { buzz, sound } from "./sound";
import { Avatar, BRAND, firstName, Gem, OwlBadge, problemWords, Waiting } from "./ui";

export type Board = FamilyBoard;
/** His grade's list, or everyone's. */
export type RaceList = "grade" | "all";

const WEEK_MS = 7 * 24 * 60 * 60_000;

/** "4d 6h" until Monday 00:00 (Sri Lanka). */
export function endsIn(since: number, now: number): string {
  const left = Math.max(0, since + WEEK_MS - now);
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h` : `${Math.max(1, Math.ceil(left / 60_000))} min`;
}

/** A list's rows: his grade's, or everyone's. */
export function rowsOf(b: Board, list: RaceList): RaceRow[] {
  return list === "grade" ? b.rows.filter((r) => r.g !== null && r.g === b.grade) : b.rows;
}

/** His place in a list: where he is, who he passes next and for how much, how many race. */
export function myPlace(b: Board, list: RaceList) {
  const ranked = placed(rowsOf(b, list));
  const mine = ranked.find((x) => x.r.id === b.you) ?? null;
  return { mine, count: ranked.length, ...passOf(ranked, b.you) };
}

/** The race kept for this child (a copy kept before 7 Nov 2026 had another shape: none). */
export function keptBoard(): Board | null {
  const k = keep<Board>("board");
  return k && Array.isArray(k.rows) && typeof k.you === "string" ? k : null;
}

/** The race, kept for this child: the screen shows the last one at once, then the new one (`err`: none came). */
export function useBoard(): { b: Board | null; err: string | null } {
  const [b, setB] = useState<Board | null>(keptBoard);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    query("family:board")
      .then((x) => {
        keep("board", x);
        setB(x as Board);
      })
      .catch((e) => setErr(problemWords(e)));
  }, []);
  return { b, err };
}

/** "Nila S, Raj K and 3 others" (the newest three, then how many more). */
export function cheerWords(from: string[], n: number): string {
  const more = n - from.length;
  if (more <= 0) return from.length > 1 ? `${from.slice(0, -1).join(", ")} and ${from[from.length - 1]}` : (from[0] ?? "");
  return `${from.join(", ")} and ${more} ${more === 1 ? "other" : "others"}`;
}

/** Who cheered him this week (👏, 7 Nov 2026): on Home and Me, nothing when nobody did. */
export function Cheered(props: { c: FamilyMe["cheers"] | undefined }) {
  const c = props.c;
  if (!c || c.n <= 0) return null;
  return (
    <section class="f-card f-clapped rise" aria-label="Cheers this week">
      <span class="f-clap-h" aria-hidden="true">
        👏
      </span>
      <p>
        <b>{cheerWords(c.from, c.n)}</b>
        <small>இந்த வாரம் உன்னை உற்சாகப்படுத்தினார்கள்!</small>
      </p>
    </section>
  );
}

/** 👑 after a name: last week's champion of this list. */
const Crown = () => (
  <span class="f-wcrown" role="img" aria-label="Last week's champion">
    👑
  </span>
);

function Podium(props: { rows: Placed[]; me: string; crowns: Set<string>; all: boolean; onOpen: (r: RaceRow) => void }) {
  // 2nd, 1st, 3rd: the winner in the middle, highest.
  const order = [props.rows[1], props.rows[0], props.rows[2]];
  return (
    <div class="f-podium" aria-label="The top three">
      {order.map((x, i) =>
        x ? (
          <button
            type="button"
            key={x.r.id}
            class={`f-pod p${Math.min(x.rank ?? 3, 3)}${x.r.id === props.me ? " me" : ""}`}
            style={{ animationDelay: `${[140, 0, 260][i]}ms` }}
            onClick={() => props.onOpen(x.r)}
          >
            {x.rank === 1 && (
              <svg class="f-crown" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                <path d="M3 8.5l4.5 4 4.5-7 4.5 7 4.5-4-2 10.5H5z" />
              </svg>
            )}
            <Avatar name={x.r.n} size="l" pic={picOf(x.r.pic)} />
            <b class="f-pod-n">
              {x.r.id === props.me ? "You" : firstName(x.r.n)}
              {x.r.bd ? " 🎂" : ""}
              {props.crowns.has(x.r.id) && <Crown />}
            </b>
            <span class="f-pod-xp">
              <Gem size={13} />
              {x.r.xp}
              {props.all && x.r.g !== null && <i class="f-gchip">{x.r.g}</i>}
            </span>
            <span class="f-pod-col">{x.rank}</span>
          </button>
        ) : (
          <div key={`e${i}`} class="f-pod empty" />
        ),
      )}
    </div>
  );
}

/** ▲2 (up two places since yesterday), ▼1, ▲ (new in the race today), or nothing. */
function Move(props: { m: Placed["move"] }) {
  const m = props.m;
  if (m === null || m === 0) return null;
  if (m === "new") return <span class="f-mv up" aria-label="New today">▲</span>;
  return m > 0 ? (
    <span class="f-mv up" aria-label={`Up ${m} since yesterday`}>
      ▲{m}
    </span>
  ) : (
    <span class="f-mv down" aria-label={`Down ${-m} since yesterday`}>
      ▼{-m}
    </span>
  );
}

function Row(props: { x: Placed; i: number; me: string; all: boolean; crown: boolean; onOpen: (r: RaceRow) => void }) {
  const { r } = props.x;
  const mine = r.id === props.me;
  return (
    <li class="rise" style={{ animationDelay: `${Math.min(props.i, 12) * 45}ms` }}>
      <button type="button" class={`f-brow${mine ? " me" : ""}`} onClick={() => props.onOpen(r)}>
        <span class="f-rank">{props.x.rank}</span>
        <Avatar name={r.n} size="s" pic={picOf(r.pic)} />
        <b class="f-bname">
          {mine ? `${r.n} · You` : r.n}
          {r.bd ? " 🎂" : ""}
          {props.crown && <Crown />}
        </b>
        {props.all && r.g !== null && <i class="f-gchip">{r.g}</i>}
        <Move m={props.x.move} />
        <span class="f-bxp">
          <Gem size={14} />
          {r.xp}
        </span>
      </button>
    </li>
  );
}

/** The ones with no XP yet this week: names only, no number (still in the race, still tappable). */
function NotYet(props: { rows: Placed[]; me: string; crowns: Set<string>; all: boolean; onOpen: (r: RaceRow) => void }) {
  return (
    <section class="f-notyet f-card rise" aria-label="Not started this week">
      <h2 class="f-h2">
        இன்னும் தொடங்கவில்லை <small>{props.rows.length}</small>
      </h2>
      <div class="f-ny">
        {props.rows.map(({ r }) => (
          <button type="button" key={r.id} class={`f-nyc${r.id === props.me ? " me" : ""}`} onClick={() => props.onOpen(r)}>
            <Avatar name={r.n} size="s" pic={picOf(r.pic)} />
            <span>
              {r.id === props.me ? "You" : firstName(r.n)}
              {props.crowns.has(r.id) && <Crown />}
            </span>
            {props.all && r.g !== null && <i class="f-gchip">{r.g}</i>}
          </button>
        ))}
      </div>
    </section>
  );
}

/** The grade cup: each grade's share of students who learned this week (made XP), best first; his grade marked. */
function GradeCup(props: { rows: RaceRow[]; grade: number | null }) {
  const cup = cupOf(props.rows);
  if (cup.length < 2) return null;
  return (
    <section class="f-gcup f-card rise" aria-label="Grade cup">
      <h2 class="f-h2">
        🏆 Grade cup <small>இந்த வாரம் கற்றவர்கள்</small>
      </h2>
      <ol class="f-gcupl">
        {cup.map((c, i) => (
          <li key={c.g} class={`${c.g === props.grade ? "me" : ""}${i === 0 && c.n > 0 ? " lead" : ""}`}>
            <b class="f-gcupg">{c.g}</b>
            <span class="f-gcupbar" aria-hidden="true">
              <i style={{ width: `${cupPct(c)}%` }} />
            </span>
            <small>
              {c.n}/{c.of}
            </small>
          </li>
        ))}
      </ol>
      <p class="f-gcup-say">உன் வகுப்பில் எல்லோரும் ஒரு Level செய்தால் Grade cup உங்களுடையது!</p>
    </section>
  );
}

export function BoardTab(props: { top: ComponentChildren; me: FamilyMe | null; onOpen: (r: RaceRow, b: Board) => void }) {
  const { b, err } = useBoard();
  const [list, setList] = useState<RaceList>(() => (keep<RaceList>("raceList") === "all" ? "all" : "grade"));
  const pick = (l: RaceList) => {
    if (l === list) return;
    buzz();
    sound("tap");
    setList(l);
    keep("raceList", l);
  };
  const all = list === "all";
  const rows = b ? rowsOf(b, list) : [];
  const ranked = placed(rows);
  const notYet = ranked.filter((x) => x.rank === null);
  const crowns = champsOf(rows);
  const me = b?.you ?? "";
  // His own row shows his own photo (even one waiting for the OK): it is his phone.
  const own = (x: Placed): Placed => (x.r.id === me && props.me?.photo ? { ...x, r: { ...x.r, pic: props.me.photo.key } } : x);
  const shown = ranked.map(own);
  const podium = shown.filter((x) => x.rank !== null).slice(0, 3);
  const rest = shown.filter((x) => x.rank !== null).slice(3);
  usePics([...shown.slice(0, 14).map((x) => x.r.pic), ...shown.filter((x) => x.r.id === me).map((x) => x.r.pic)]);
  const mine = ranked.find((x) => x.r.id === me) ?? null;
  const { above, gap } = passOf(ranked, me);
  const first = !!mine && mine.rank === 1;
  const open = (r: RaceRow) => {
    buzz();
    sound("tap");
    if (b) props.onOpen(r, b);
  };
  const grade = b?.grade ?? props.me?.grade ?? null;
  return (
    <>
      <header class="f-hero race">
        {props.top}
        <div class="f-hero-in">
          <div class="f-hero-w">
            <p class="f-kicker">This week · {all ? BRAND : grade ? `Grade ${grade}` : "Race"}</p>
            <h1 class="f-title">Race</h1>
            <p class="f-hsub">{b ? `Ends in ${endsIn(b.since, Date.now())}` : "…"}</p>
          </div>
          <OwlBadge mood={first ? "cool" : mine?.rank ? "strong" : "happy"} class="hero" />
        </div>
        <div class="f-rtabs" role="group" aria-label="Which race">
          <button type="button" class={all ? "" : "on"} aria-pressed={!all} onClick={() => pick("grade")}>
            {grade ? `Grade ${grade}` : "My grade"}
          </button>
          <button type="button" class={all ? "on" : ""} aria-pressed={all} onClick={() => pick("all")}>
            {BRAND}
          </button>
        </div>
      </header>
      <section class="f-race f-card rise">
        {err && !b && <p class="f-lead f-center-t">{err}</p>}
        {!b && !err && <Waiting />}
        {b && (podium.length > 0 ? <Podium rows={podium} me={me} crowns={crowns} all={all} onOpen={open} /> : <p class="f-none">இந்த வாரம் இன்னும் யாரும் இல்லை. நீ முதலாவதாக வா!</p>)}
      </section>
      {b && (
        <>
          {first && <p class="f-pass top rise">நீ முதலிடத்தில்! இதைக் காப்பாற்று.</p>}
          {mine && mine.rank === null && <p class="f-pass rise">ஒரு Level செய்: நீயும் race இல் சேர்வாய்!</p>}
          {mine && mine.rank !== null && above && gap > 0 && (
            <p class="f-pass rise">
              இன்னும் <b>{gap} XP</b> எடுத்தால் {firstName(above.r.n)} ஐ முந்துவாய்!
            </p>
          )}
          {all && <GradeCup rows={b.rows} grade={b.grade} />}
          {rest.length > 0 && (
            <ol class="f-board">
              {rest.map((x, i) => (
                <Row key={x.r.id} x={x} i={i} me={me} all={all} crown={crowns.has(x.r.id)} onOpen={open} />
              ))}
            </ol>
          )}
          {notYet.length > 0 && <NotYet rows={shown.filter((x) => x.rank === null)} me={me} crowns={crowns} all={all} onOpen={open} />}
          <p class="f-muted small f-center-t f-pad-x">
            {crowns.size > 0 ? "👑 = கடந்த வார வெற்றியாளர். " : ""}திங்கள் காலை எல்லோரும் 0 இலிருந்து தொடங்குவார்கள்.
          </p>
        </>
      )}
    </>
  );
}
