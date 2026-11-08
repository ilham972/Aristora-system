// The race tab (7 Nov 2026, his voice note): every student of ARISTORA, joined the app or not; XP from class and home this
// week; his league (8 Nov 2026, his answers: 5 leagues, all grades mixed: the top 3 up on Monday, the bottom 3 down,
// never one who learned on 4 days), his grade and the whole ARISTORA ("they can see both ranks"); the top three on a
// podium, then the rest with how each moved since yesterday; in a league ⬆ / ⬇ / 🛡️ for Monday; 👑 = last week's
// champion of a grade's or ARISTORA's list; the ones with no XP yet this week at the end with no number ("not started
// this week"); how much XP passes the one above him (in a league: what changes his Monday); the grade cup (ARISTORA:
// the share of each grade that learned this week). Tap anyone = his profile. Faces: the photos the teachers said OK to
// (his own always, on his phone); 🎂 on a birthday. Above it (league.tsx): Monday's card, his rank, the leagues' road.
// A later part (parts.ts: out of the first load since 8 Nov 2026). The lists and their rules: convex/lib/race.ts.

import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { FamilyMe } from "../../convex/family";
import { champsOf, cupOf, cupPct, LEAGUE_UP, leagueMoves, leagueOf, leagueOrder, LEAGUES, passOf, placed, SHIELD_DAYS, type Placed, type RaceRow } from "../../convex/lib/race";
import { endsIn, useBoard, type Board } from "./board";
import { LeagueRoad, RaceTop } from "./league";
import { keep } from "./net";
import { picOf, usePics } from "./pics";
import { buzz, sound } from "./sound";
import { Avatar, BRAND, firstName, Gem, OwlBadge, Waiting } from "./ui";

/** His league (8 Nov 2026: the default), his grade's list, or everyone's. */
export type RaceList = "league" | "grade" | "all";

/** His league: his own row's (a teacher picks one: `lg`). */
export const myLeague = (b: Board, lg?: number): number => lg ?? leagueOf(b.rows.find((r) => r.id === b.you)?.l);

/** A list's rows: his league's, his grade's, or everyone's. */
export function rowsOf(b: Board, list: RaceList, lg?: number): RaceRow[] {
  if (list === "league") {
    const l = myLeague(b, lg);
    return b.rows.filter((r) => leagueOf(r.l) === l);
  }
  return list === "grade" ? b.rows.filter((r) => r.g !== null && r.g === b.grade) : b.rows;
}

/** His place in a list: where he is, who he passes next and for how much, how many race. */
export function myPlace(b: Board, list: RaceList) {
  const ranked = placed(rowsOf(b, list));
  const mine = ranked.find((x) => x.r.id === b.you) ?? null;
  return { mine, count: ranked.length, ...passOf(ranked, b.you) };
}

const xpOf = (r: RaceRow) => r.xp;
const ddOf = (r: RaceRow) => r.dd ?? 0;
/** A league in Monday's order: more XP, more days learned, more XP ever, the name (convex/lib/race.ts leagueOrder). */
const ordered = (rows: RaceRow[]) => leagueOrder(rows, xpOf, ddOf, (r) => r.t ?? 0);

/** A league's moves if the week ended now (8 Nov 2026): +1 up, −1 down (convex/lib/race.ts leagueMoves). */
export function movesNow(rows: RaceRow[], lg: number): Map<string, 1 | -1> {
  return leagueMoves(ordered(rows), lg, xpOf, ddOf);
}

/**
 * The XP that changes his Monday (8 Nov 2026): out of the bottom (`out`: pass the lowest one above him who neither moves
 * nor has 🛡️; null = only 🛡️ saves him), into the top (`top`: pass the last one moving up).
 */
export function leagueGaps(rows: RaceRow[], me: string, moves: Map<string, 1 | -1>): { out: number | null; top: number | null } {
  const order = ordered(rows);
  const mine = order.find((r) => r.id === me);
  if (!mine) return { out: null, top: null };
  const stay = order.filter((r) => r.id !== me && !moves.has(r.id) && ddOf(r) < SHIELD_DAYS && r.xp >= mine.xp);
  const pass = stay[stay.length - 1];
  const k = Math.min(LEAGUE_UP, Math.floor(rows.length / 3));
  const last = k > 0 ? order[k - 1] : undefined;
  return { out: pass ? pass.xp - mine.xp + 1 : null, top: last && last.id !== me && !moves.has(me) && last.xp >= mine.xp ? last.xp - mine.xp + 1 : null };
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

/** In a league (8 Nov 2026): ⬆ moves up on Monday if the week ended now, ⬇ moves down, 🛡️ can't move down (4 days). */
function Zone(props: { z?: 1 | -1; shield?: boolean }) {
  if (props.z === 1)
    return (
      <span class="f-zone up" aria-label="Moves up on Monday">
        ⬆
      </span>
    );
  if (props.z === -1)
    return (
      <span class="f-zone down" aria-label="Moves down on Monday">
        ⬇
      </span>
    );
  return props.shield ? (
    <span class="f-zone safe" aria-label={`Learned ${SHIELD_DAYS} days: safe`}>
      🛡️
    </span>
  ) : null;
}

function Row(props: { x: Placed; i: number; me: string; all: boolean; crown: boolean; z?: 1 | -1; shield?: boolean; onOpen: (r: RaceRow) => void }) {
  const { r } = props.x;
  const mine = r.id === props.me;
  return (
    <li class="rise" style={{ animationDelay: `${Math.min(props.i, 12) * 45}ms` }}>
      <button type="button" class={`f-brow${mine ? " me" : ""}${props.z === -1 ? " dz" : ""}`} onClick={() => props.onOpen(r)}>
        <span class="f-rank">{props.x.rank}</span>
        <Avatar name={r.n} size="s" pic={picOf(r.pic)} />
        <b class="f-bname">
          {mine ? `${r.n} · You` : r.n}
          {r.bd ? " 🎂" : ""}
          {props.crown && <Crown />}
        </b>
        {props.all && r.g !== null && <i class="f-gchip">{r.g}</i>}
        <Zone z={props.z} shield={props.shield} />
        <Move m={props.x.move} />
        <span class="f-bxp">
          <Gem size={14} />
          {r.xp}
        </span>
      </button>
    </li>
  );
}

/** The ones with no XP yet this week: names only, no number (still in the race, still tappable); ⬇ in a league. */
function NotYet(props: { rows: Placed[]; me: string; crowns: Set<string>; all: boolean; moves?: Map<string, 1 | -1>; onOpen: (r: RaceRow) => void }) {
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
            {props.moves?.get(r.id) === -1 && <i class="f-nyd" aria-label="Moves down on Monday">⬇</i>}
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

export function BoardTab(props: {
  top: ComponentChildren;
  me: FamilyMe | null;
  onOpen: (r: RaceRow, b: Board) => void;
  /** A teacher (the class app's Us tab, 7 Nov 2026): the grade she picked (she has none), and her row of grades. */
  grade?: number;
  gradeRow?: ComponentChildren;
}) {
  const kept = useBoard();
  const b = kept.b && props.grade !== undefined ? { ...kept.b, grade: props.grade } : kept.b;
  const err = kept.err;
  const staff = props.grade !== undefined;
  // 8 Nov 2026: his league first (a list kept from before stays as he left it); a teacher's grades first (she thinks in
  // grades; the leagues are one tap away, each league one more).
  const [list, setList] = useState<RaceList>(() => {
    const k = keep<RaceList>("raceList");
    return k === "all" || k === "grade" || k === "league" ? k : staff ? "grade" : "league";
  });
  // A teacher picks the league she looks at (she is in none).
  const [pickLg, setPickLg] = useState<number>(() => leagueOf(keep<number>("raceLg") ?? undefined));
  const pick = (l: RaceList) => {
    if (l === list) return;
    buzz();
    sound("tap");
    setList(l);
    keep("raceList", l);
  };
  const all = list === "all";
  const league = list === "league";
  const lg = b ? myLeague(b, staff ? pickLg : undefined) : 1;
  const rows = b ? rowsOf(b, list, staff ? pickLg : undefined) : [];
  const ranked = placed(rows);
  const notYet = ranked.filter((x) => x.rank === null);
  const crowns = league ? new Set<string>() : champsOf(rows);
  const moves = league ? movesNow(rows, lg) : new Map<string, 1 | -1>();
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
  const L = LEAGUES[lg - 1];
  const next = LEAGUES[lg];
  const below = LEAGUES[lg - 2];
  // His league's line: what Monday does to him if the week ended now, and what changes it.
  const myMove = moves.get(me);
  const myDays = Math.max(b?.rows.find((r) => r.id === me)?.dd ?? 0, props.me?.race?.dd ?? 0);
  const gaps = league && b ? leagueGaps(rows, me, moves) : { out: null, top: null };
  const leagueSay = (): ComponentChildren => {
    if (!mine || staff) return null;
    if (myMove === -1 && below) {
      const days = Math.max(1, SHIELD_DAYS - myDays);
      return (
        <p class="f-pass down rise">
          ⬇ இப்போது கீழ் லீக்குக்குப் போகும் இடம்.{" "}
          {gaps.out !== null ? (
            <>
              இன்னும் <b>{gaps.out} XP</b> எடு, அல்லது{" "}
            </>
          ) : null}
          இன்னும் {days} நாள் கற்றால் 🛡️ பாதுகாப்பு!
        </p>
      );
    }
    if (mine.rank === null) return <p class="f-pass rise">ஒரு Level செய்: நீயும் race இல் சேர்வாய்!</p>;
    if (first) return <p class="f-pass top rise">நீ {L.n} லீக்கில் முதலிடத்தில்! இதைக் காப்பாற்று.</p>;
    if (myMove === 1 && next) return <p class="f-pass top rise">⬆ இப்போது நீ {next.e} {next.n} லீக்குக்குப் போகும் இடத்தில்! காப்பாற்று.</p>;
    if (next && gaps.top !== null)
      return (
        <p class="f-pass rise">
          இன்னும் <b>{gaps.top} XP</b> எடுத்தால் முதல் 3 இல்: {next.e} {next.n} லீக்!
        </p>
      );
    return above && gap > 0 ? (
      <p class="f-pass rise">
        இன்னும் <b>{gap} XP</b> எடுத்தால் {firstName(above.r.n)} ஐ முந்துவாய்!
      </p>
    ) : null;
  };
  const tab = (l: RaceList, label: ComponentChildren) => (
    <button type="button" class={list === l ? "on" : ""} aria-pressed={list === l} onClick={() => pick(l)}>
      {label}
    </button>
  );
  return (
    <>
      <header class="f-hero race">
        {props.top}
        <div class="f-hero-in">
          <div class="f-hero-w">
            <p class="f-kicker">This week · {league ? `${L.e} ${L.n}` : all ? BRAND : grade ? `Grade ${grade}` : "Race"}</p>
            <h1 class="f-title">Race</h1>
            <p class="f-hsub">{b ? `Ends in ${endsIn(b.since, Date.now())}` : "…"}</p>
          </div>
          <OwlBadge mood={first ? "cool" : mine?.rank ? "strong" : "happy"} class="hero" />
        </div>
        <div class="f-rtabs" role="group" aria-label="Which race">
          {tab("league", `${L.e} League`)}
          {tab("grade", grade ? `Grade ${grade}` : "My grade")}
          {tab("all", BRAND)}
        </div>
        {list === "grade" && props.gradeRow}
      </header>
      {/* What he keeps for good (8 Nov 2026): last week saved (Monday), his rank, the leagues' road. Later parts. */}
      {!staff && props.me && <RaceTop me={props.me} league={league} />}
      {league && (
        <LeagueRoad
          lg={lg}
          staff={staff}
          onPick={
            staff
              ? (l) => {
                  if (l === pickLg) return;
                  buzz();
                  sound("tap");
                  setPickLg(l);
                  keep("raceLg", l);
                }
              : undefined
          }
        />
      )}
      <section class="f-race f-card rise">
        {err && !b && <p class="f-lead f-center-t">{err}</p>}
        {!b && !err && <Waiting />}
        {b && (podium.length > 0 ? <Podium rows={podium} me={me} crowns={crowns} all={all || league} onOpen={open} /> : <p class="f-none">இந்த வாரம் இன்னும் யாரும் இல்லை. நீ முதலாவதாக வா!</p>)}
        {b && league && podium.length > 0 && (
          <p class="f-podnote">{next ? `⬆ முதல் 3 பேர் திங்கள் ${next.e} ${next.n} லீக்குக்கு` : `${L.e} முதலிடம் = இந்த வார சாம்பியன்`}</p>
        )}
      </section>
      {b && (
        <>
          {league ? (
            leagueSay()
          ) : (
            <>
              {first && <p class="f-pass top rise">நீ முதலிடத்தில்! இதைக் காப்பாற்று.</p>}
              {mine && mine.rank === null && <p class="f-pass rise">ஒரு Level செய்: நீயும் race இல் சேர்வாய்!</p>}
              {mine && mine.rank !== null && above && gap > 0 && (
                <p class="f-pass rise">
                  இன்னும் <b>{gap} XP</b> எடுத்தால் {firstName(above.r.n)} ஐ முந்துவாய்!
                </p>
              )}
            </>
          )}
          {all && <GradeCup rows={b.rows} grade={b.grade} />}
          {rest.length > 0 && (
            <ol class="f-board">
              {rest.map((x, i) => (
                <Row
                  key={x.r.id}
                  x={x}
                  i={i}
                  me={me}
                  all={all || league}
                  crown={crowns.has(x.r.id)}
                  z={moves.get(x.r.id)}
                  shield={league && lg > 1 && (x.r.dd ?? 0) >= SHIELD_DAYS}
                  onOpen={open}
                />
              ))}
            </ol>
          )}
          {notYet.length > 0 && <NotYet rows={shown.filter((x) => x.rank === null)} me={me} crowns={crowns} all={all || league} moves={league ? moves : undefined} onOpen={open} />}
          <p class="f-muted small f-center-t f-pad-x">
            {league
              ? `${next ? "முதல் 3 → மேல் லீக் · " : ""}${below ? `கடைசி 3 → கீழ் லீக் · 🛡️ = இந்த வாரம் ${SHIELD_DAYS} நாள் கற்றவர்: கீழே போக மாட்டார். ` : ""}உன் மொத்த XP என்றும் குறையாது.`
              : `${crowns.size > 0 ? "👑 = கடந்த வார வெற்றியாளர். " : ""}திங்கள்: புதிய வாரம், எல்லோருக்கும் புதிய வாய்ப்பு. உன் மொத்த XP என்றும் உனக்கே.`}
          </p>
        </>
      )}
    </>
  );
}
