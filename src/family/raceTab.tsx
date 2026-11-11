// The race tab (7 Nov 2026, his voice note): every student of ARISTORA, joined the app or not. Since 11 Nov 2026 (his
// voice note: students who put in so much work thought "everything is gone" when the week's list started from zero; his
// answers: the leagues and the rank badges out) three lists:
// - This week: his grade, XP this week (a new student can reach the top); 👑 = last week's #1; the grade cup; each
//   grade's weekly #1 wins the owner's coins on Monday (never two weeks running);
// - All time: his grade, XP ever, never reset (every XP he earned is here);
// - GOAT: all of ARISTORA, every grade, XP ever; its #1 is the GOAT, a medal that moves the moment someone passes him.
// Each: the top three on a podium (the GOAT on his own card), the rest with how each moved since yesterday, the ones with
// no XP yet at the end with no number, how much XP passes the one above him. Tap anyone = his profile. Faces: the
// photos the teachers said OK to (his own always, on his phone); 🎂 on a birthday; the GOAT's gold ring wherever he is.
// A later part (parts.ts: out of the first load since 8 Nov 2026). The lists' rules: convex/lib/race.ts.

import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { FamilyMe } from "../../convex/family";
import { champsOf, cupOf, cupPct, goatOf, passOf, placed, placedEver, type Placed, type RaceRow } from "../../convex/lib/race";
import { endsIn, useBoard, type Board } from "./board";
import { GoatChip, GoatMedal } from "./goat";
import { keep } from "./net";
import { picOf, usePics } from "./pics";
import { buzz, sound } from "./sound";
import { useOnline } from "./beat";
import { OnDot } from "./usage";
import { Avatar, BRAND, Coin, firstName, Gem, OwlBadge, Waiting } from "./ui";

/** This week in his grade (the default), all time in his grade, or the GOAT (all of ARISTORA, all time). */
export type RaceList = "week" | "ever" | "goat";

/** A list's rows: his grade's, or everyone's for the GOAT. */
export function rowsOf(b: Board, list: RaceList): RaceRow[] {
  return list === "goat" ? b.rows : b.rows.filter((r) => r.g !== null && r.g === b.grade);
}

/** A list in its order: by XP this week, or by XP ever. */
const rank = (rows: RaceRow[], list: RaceList): Placed[] => (list === "week" ? placed(rows) : placedEver(rows));

/** His place in a list: where he is, who he passes next and for how much, how many are in it. */
export function myPlace(b: Board, list: RaceList) {
  const ranked = rank(rowsOf(b, list), list);
  const mine = ranked.find((x) => x.r.id === b.you) ?? null;
  return { mine, count: ranked.length, ...passOf(ranked, b.you) };
}

/** "2,140". */
const num = (n: number) => n.toLocaleString("en");

/** His face; the GOAT's with a gold ring and its chip. */
function Face(props: { r: RaceRow; size: "s" | "l"; goat: boolean }) {
  const live = useOnline();
  return (
    <span class={`f-rface${props.goat ? " goat" : ""}`}>
      <Avatar name={props.r.n} size={props.size} pic={picOf(props.r.pic)} />
      {props.goat && <GoatChip />}
      <OnDot on={live.show && live.on.has(props.r.id)} />
    </span>
  );
}

/** 👑 after a name: last week's #1 of his grade. */
const Crown = () => (
  <span class="f-wcrown" role="img" aria-label="Last week's champion">
    👑
  </span>
);

type Marks = { me: string; goat: string | null; crowns: Set<string>; grades: boolean; onOpen: (r: RaceRow) => void };

function Podium(props: { rows: Placed[]; m: Marks }) {
  const { m } = props;
  // 2nd, 1st, 3rd: the winner in the middle, highest.
  const order = [props.rows[1], props.rows[0], props.rows[2]];
  return (
    <div class="f-podium" aria-label="The top three">
      {order.map((x, i) =>
        x ? (
          <button
            type="button"
            key={x.r.id}
            class={`f-pod p${Math.min(x.rank ?? 3, 3)}${x.r.id === m.me ? " me" : ""}`}
            style={{ animationDelay: `${[140, 0, 260][i]}ms` }}
            onClick={() => m.onOpen(x.r)}
          >
            {x.rank === 1 && (
              <svg class="f-crown" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                <path d="M3 8.5l4.5 4 4.5-7 4.5 7 4.5-4-2 10.5H5z" />
              </svg>
            )}
            <Face r={x.r} size="l" goat={x.r.id === m.goat} />
            <b class="f-pod-n">
              {x.r.id === m.me ? "You" : firstName(x.r.n)}
              {x.r.bd ? " 🎂" : ""}
              {m.crowns.has(x.r.id) && <Crown />}
            </b>
            <span class="f-pod-xp">
              <Gem size={13} />
              {num(x.r.xp)}
              {m.grades && x.r.g !== null && <i class="f-gchip">{x.r.g}</i>}
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

/** ▲2 (up two places since yesterday), ▼1, ▲ (new in the list today), or nothing. */
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

function Row(props: { x: Placed; i: number; m: Marks }) {
  const { r } = props.x;
  const { m } = props;
  const mine = r.id === m.me;
  return (
    <li class="rise" style={{ animationDelay: `${Math.min(props.i, 12) * 45}ms` }}>
      <button type="button" class={`f-brow${mine ? " me" : ""}`} onClick={() => m.onOpen(r)}>
        <span class="f-rank">{props.x.rank}</span>
        <Face r={r} size="s" goat={r.id === m.goat} />
        <b class="f-bname">
          {mine ? `${r.n} · You` : r.n}
          {r.bd ? " 🎂" : ""}
          {m.crowns.has(r.id) && <Crown />}
        </b>
        {m.grades && r.g !== null && <i class="f-gchip">{r.g}</i>}
        <Move m={props.x.move} />
        <span class="f-bxp">
          <Gem size={14} />
          {num(r.xp)}
        </span>
      </button>
    </li>
  );
}

/** The ones with no XP yet (this week, or ever): names only, no number (still in the list, still tappable). */
function NotYet(props: { rows: Placed[]; m: Marks; week: boolean }) {
  const { m } = props;
  return (
    <section class="f-notyet f-card rise" aria-label={props.week ? "Not started this week" : "Not started yet"}>
      <h2 class="f-h2">
        இன்னும் தொடங்கவில்லை <small>{props.rows.length}</small>
      </h2>
      <div class="f-ny">
        {props.rows.map(({ r }) => (
          <button type="button" key={r.id} class={`f-nyc${r.id === m.me ? " me" : ""}`} onClick={() => m.onOpen(r)}>
            <Face r={r} size="s" goat={false} />
            <span>
              {r.id === m.me ? "You" : firstName(r.n)}
              {m.crowns.has(r.id) && <Crown />}
            </span>
            {m.grades && r.g !== null && <i class="f-gchip">{r.g}</i>}
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

/**
 * Online now (12 Nov 2026, his ask: "each student want to know which student is online right now"): the faces of everyone
 * in the app this minute, his grade first; a tap opens a profile. Nothing while the owner's switch is off (Settings → Race).
 */
function OnlineNow(props: { rows: RaceRow[]; grade: number | null; m: Marks }) {
  const live = useOnline();
  if (!live.show) return null;
  const rows = props.rows
    .filter((r) => live.on.has(r.id))
    .sort((a, b) => Number(b.id === props.m.me) - Number(a.id === props.m.me) || Number(b.g === props.grade) - Number(a.g === props.grade) || b.xp - a.xp);
  if (rows.length === 0) return null;
  const MAX = 12;
  return (
    <section class="f-onl f-card rise" aria-label="Online now">
      <h2 class="f-h2">
        <i class="f-on in" aria-hidden="true" /> Online now <small>{rows.length}</small>
      </h2>
      <div class="f-onl-row">
        {rows.slice(0, MAX).map((r) => (
          <button type="button" key={r.id} class={`f-onl-c${r.id === props.m.me ? " me" : ""}`} onClick={() => props.m.onOpen(r)}>
            <Face r={r} size="s" goat={false} />
            <span>{r.id === props.m.me ? "You" : firstName(r.n)}</span>
          </button>
        ))}
        {rows.length > MAX && <span class="f-onl-more">+{rows.length - MAX}</span>}
      </div>
    </section>
  );
}

/** The GOAT's own card (the GOAT list's top): the medal, his face and name, his grade and XP ever. */
function GoatCard(props: { x: Placed; m: Marks }) {
  const { r } = props.x;
  const mine = r.id === props.m.me;
  return (
    <button type="button" class={`f-goatc rise${mine ? " me" : ""}`} onClick={() => props.m.onOpen(r)}>
      <GoatMedal size={104} class="hero" />
      <span class="f-goatc-w">
        <small class="f-goatc-k">Greatest of all time</small>
        <span class="f-goatc-who">
          <Avatar name={r.n} size="m" pic={picOf(r.pic)} />
          <b>
            {mine ? "You!" : r.n}
            {r.bd ? " 🎂" : ""}
          </b>
        </span>
        <span class="f-goatc-xp">
          <Gem size={15} />
          {num(r.xp)} XP
          {r.g !== null && <i class="f-gchip">{r.g}</i>}
        </span>
      </span>
    </button>
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
  // This week first, always (11 Nov 2026: the list a new student can win); a list he picked stays as he left it.
  const [list, setList] = useState<RaceList>(() => {
    const k = keep<string>("raceList2");
    return k === "ever" || k === "goat" ? k : "week";
  });
  const pick = (l: RaceList) => {
    if (l === list) return;
    buzz();
    sound("tap");
    setList(l);
    keep("raceList2", l);
  };
  const week = list === "week";
  const goatList = list === "goat";
  const rows = b ? rowsOf(b, list) : [];
  const ranked = rank(rows, list);
  const goat = b ? (goatOf(b.rows)?.id ?? null) : null;
  const me = b?.you ?? "";
  // His own row shows his own photo (even one waiting for the OK): it is his phone.
  const own = (x: Placed): Placed => (x.r.id === me && props.me?.photo ? { ...x, r: { ...x.r, pic: props.me.photo.key } } : x);
  const shown = ranked.map(own);
  const placedRows = shown.filter((x) => x.rank !== null);
  // The GOAT list: the GOAT on his own card, then everyone from #2; the others: the podium, then from #4.
  const head = goatList ? placedRows.slice(0, 1) : placedRows.slice(0, 3);
  const rest = placedRows.slice(head.length);
  const notYet = shown.filter((x) => x.rank === null);
  usePics([...shown.slice(0, 14).map((x) => x.r.pic), ...shown.filter((x) => x.r.id === me).map((x) => x.r.pic)]);
  const mine = ranked.find((x) => x.r.id === me) ?? null;
  const { above, gap } = passOf(ranked, me);
  const first = !!mine && mine.rank === 1;
  const open = (r: RaceRow) => {
    buzz();
    sound("tap");
    if (b) props.onOpen(r, b);
  };
  const m: Marks = { me, goat, crowns: week ? champsOf(rows) : new Set<string>(), grades: goatList, onOpen: open };
  const grade = b?.grade ?? props.me?.grade ?? null;
  const gradeWords = grade ? `Grade ${grade}` : "My grade";
  const wc = b?.wc ?? 0;
  const top = placedRows[0];
  // What he does next, in one line.
  const say = (): ComponentChildren => {
    if (!mine || staff) return null;
    if (mine.rank === null) return <p class="f-pass rise">{week ? "ஒரு Level செய்: நீயும் இந்த வார race இல் சேர்வாய்!" : "ஒரு Level செய்: உன் முதல் XP இங்கே என்றும் இருக்கும்!"}</p>;
    if (goatList && first) return <p class="f-pass top rise">நீ தான் ARISTORA வின் GOAT! யாரும் முந்த விடாதே.</p>;
    if (first) return <p class="f-pass top rise">நீ முதலிடத்தில்! இதைக் காப்பாற்று.</p>;
    if (goatList && top)
      return (
        <p class="f-pass rise">
          GOAT ஆக இன்னும் <b>{num(top.r.xp - mine.r.xp + 1)} XP</b>!
        </p>
      );
    return above && gap > 0 ? (
      <p class="f-pass rise">
        இன்னும் <b>{num(gap)} XP</b> எடுத்தால் {firstName(above.r.n)} ஐ முந்துவாய்!
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
            <p class="f-kicker">{week ? `This week · ${gradeWords}` : goatList ? `All time · ${BRAND}` : `All time · ${gradeWords}`}</p>
            <h1 class="f-title">Race</h1>
            <p class="f-hsub">{!b ? "…" : week ? `Ends in ${endsIn(b.since, Date.now())}` : goatList ? "Every grade · XP ever" : "XP ever · never resets"}</p>
          </div>
          <OwlBadge mood={first ? "cool" : mine?.rank ? "strong" : "happy"} class="hero" />
        </div>
        <div class="f-rtabs" role="group" aria-label="Which race">
          {tab("week", "This week")}
          {tab("ever", "All time")}
          {tab("goat", "GOAT")}
        </div>
        {!goatList && props.gradeRow}
      </header>
      <section class="f-race f-card rise">
        {err && !b && <p class="f-lead f-center-t">{err}</p>}
        {!b && !err && <Waiting />}
        {b &&
          (head.length === 0 ? (
            <p class="f-none">{week ? "இந்த வாரம் இன்னும் யாரும் இல்லை. நீ முதலாவதாக வா!" : "இன்னும் யாரும் இல்லை. நீ முதலாவதாக வா!"}</p>
          ) : goatList ? (
            <GoatCard x={head[0]} m={m} />
          ) : (
            <Podium rows={head} m={m} />
          ))}
        {b && week && wc > 0 && head.length > 0 && (
          <p class="f-podnote">
            <Coin size={15} /> முதலிடம் = திங்கள் +{num(wc)} coins
          </p>
        )}
      </section>
      {b && (
        <>
          {say()}
          {!staff && <OnlineNow rows={b.rows} grade={grade} m={m} />}
          {rest.length > 0 && (
            <ol class="f-board">
              {rest.map((x, i) => (
                <Row key={x.r.id} x={x} i={i} m={m} />
              ))}
            </ol>
          )}
          {notYet.length > 0 && <NotYet rows={notYet} m={m} week={week} />}
          {week && <GradeCup rows={b.rows} grade={b.grade} />}
          <p class="f-muted small f-center-t f-pad-x">
            {week
              ? `${m.crowns.size > 0 ? "👑 = கடந்த வார முதலிடம். " : ""}${wc > 0 ? `திங்கள்: ஒவ்வொரு grade இன் முதலிடத்துக்கு ${num(wc)} coins (கடந்த வாரம் வென்றவர் தவிர: அடுத்தவருக்கு). ` : ""}புதிய வாரம், எல்லோருக்கும் புதிய வாய்ப்பு. உன் XP எல்லாம் All time இல் என்றும் இருக்கும்.`
              : goatList
                ? "எல்லா grade உம், எல்லா நாளும்: அதிக XP எடுத்தவர் GOAT. யாராவது முந்தினால் GOAT அவருக்குப் போகும்."
                : "நீ எடுத்த ஒவ்வொரு XP உம் இங்கே: இது என்றும் குறையாது."}
          </p>
        </>
      )}
    </>
  );
}
