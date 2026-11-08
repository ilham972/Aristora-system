// What a student keeps for good, on the race (8 Nov 2026, his voice note: "when it comes to Monday, all the progress will
// start from zero ... they feel their earned that ... starting from zero, they don't like that. They feel like they are
// losing what they earned"). The week's race still starts again on Monday (every student's fresh chance), but:
// - Monday's card: last week is saved: its XP added to his XP ever, his place in his league and where it took him;
// - his rank: his XP ever as a rank with a badge (🌱 to 🦉, then ⭐), never down, and the XP to the next one;
// - the leagues' road: the five leagues, his own lit, and Monday's rule in one line.
// A later part (parts.ts): the race draws without them for a moment the first time. Rules: convex/lib/race.ts.

import { useEffect, useState } from "preact/hooks";
import type { FamilyMe } from "../../convex/family";
import { LEAGUES, nextStep, RANKS, rankShown, SHIELD_DAYS, starsOf, type LeagueResult } from "../../convex/lib/race";
import { keep } from "./net";
import { Confetti } from "./next";
import { buzz, sound } from "./sound";
import { Gem, useCount } from "./ui";

const WEEK_MS = 7 * 86_400_000;

/** Monday 00:00 of this week, Sri Lanka (the race's `since` without the race). */
function weekStart(now: number): number {
  const sl = now + 330 * 60_000;
  const day = Math.floor(sl / 86_400_000);
  const monday = day - ((new Date(day * 86_400_000).getUTCDay() + 6) % 7);
  return monday * 86_400_000 - 330 * 60_000;
}

/** "2,140": thousands with a comma. */
const num = (n: number) => n.toLocaleString("en");

/** "2வது" (his place, Tamil). */
const placeWords = (p: number) => `${p}வது`;

/** A rank's badge and name; past the last rank its ⭐. */
export function rankName(total: number, rk?: number): string {
  const i = rankShown(total, rk);
  const stars = i === RANKS.length - 1 ? starsOf(total) : 0;
  return `${RANKS[i].e} ${RANKS[i].n}${stars ? ` ⭐${stars}` : ""}`;
}

/** His rank and league in one line (his Me, a classmate's profile). */
export function RankLine(props: { total: number; rk?: number; lg?: number }) {
  const lg = LEAGUES[(props.lg ?? 1) - 1] ?? LEAGUES[0];
  return (
    <p class="f-rkline">
      <b>{rankName(props.total, props.rk)}</b>
      <span>
        {lg.e} {lg.n} லீக்
      </span>
    </p>
  );
}

/** What last week did for him, in his words. */
function weekWords(lr: LeagueResult): { head: string; say: string; party: boolean } {
  const L = LEAGUES[lr.l - 1] ?? LEAGUES[0];
  const up = LEAGUES[lr.l];
  const down = LEAGUES[lr.l - 2];
  // The first leagues (9 Nov 2026): last week's XP put him here; no race behind it yet.
  if (lr.pl) {
    if (lr.p === null) return { head: "கடந்த வாரம் XP இல்லை", say: `${L.e} ${L.n} லீக்கில் தொடங்குகிறாய். ஒரு Level செய்து மேலே ஏறு!`, party: false };
    return {
      head: `${L.e} ${L.n} லீக்கில் தொடங்குகிறாய்!`,
      say: up ? `உன் கடந்த வார XP ஆல் இந்த லீக் உனக்குக் கிடைத்தது. முதல் 3 இல் வந்தால் ${up.e} ${up.n}!` : "உன் கடந்த வார XP ஆல் உச்ச லீக்! இங்கே முதலிடம் = வார சாம்பியன்.",
      party: lr.l > 1,
    };
  }
  const kept = `🛡️ ${SHIELD_DAYS} நாள் கற்றதால் நீ கீழே போகவில்லை! இந்த வாரமும் ${L.n} லீக்கில்.`;
  if (lr.p === null) {
    return {
      head: "கடந்த வாரம் XP இல்லை",
      say: lr.sh ? kept : lr.m === -1 && down ? `இந்த வாரம் ${down.e} ${down.n} லீக்கில். ஒரு Level செய்து மீண்டும் ஏறு!` : "இந்த வாரம் ஒரு Level செய்து தொடங்கு!",
      party: false,
    };
  }
  if (lr.win)
    return {
      head: `${L.e} ${L.n} லீக்கின் வெற்றியாளர் நீ! 🏆`,
      say: lr.m === 1 && up ? `இப்போது ${up.e} ${up.n} லீக்குக்கு முன்னேறினாய்!` : "சாம்பியன் லீக்கின் முதலிடம். அருமை!",
      party: true,
    };
  if (lr.m === 1 && up) return { head: `${L.e} ${L.n} லீக்கில் ${placeWords(lr.p)} இடம்`, say: `${up.e} ${up.n} லீக்குக்கு முன்னேறினாய்! 🎉`, party: true };
  if (lr.m === -1 && down)
    return { head: `${L.e} ${L.n} லீக்கில் ${placeWords(lr.p)} இடம்`, say: `இந்த வாரம் ${down.e} ${down.n} லீக்கில். முதல் 3 இல் வந்தால் மீண்டும் ${L.n}!`, party: false };
  if (lr.sh) return { head: `${L.e} ${L.n} லீக்கில் ${placeWords(lr.p)} இடம்`, say: kept, party: false };
  return { head: `${L.e} ${L.n} லீக்கில் ${placeWords(lr.p)} இடம்`, say: `இந்த வாரமும் ${L.n} லீக்கில். முதல் 3 இல் வந்தால் மேலே!`, party: false };
}

/** Monday's card (until he closes it, or the week after): last week saved, its XP in his XP ever, his league's result. */
function WeekCard(props: { lr: LeagueResult; total: number; onClose: () => void }) {
  const w = weekWords(props.lr);
  const xp = useCount(props.lr.xp, 900, 250);
  useEffect(() => {
    sound(w.party ? "trophy" : "pop");
  }, []);
  return (
    <section class={`f-card f-wsave rise${w.party ? " party" : ""}`} aria-label="Last week, saved">
      {w.party && <Confetti n={18} />}
      <p class="f-wsave-k">📦 கடந்த வாரம் சேமிக்கப்பட்டது</p>
      <div class="f-wsave-xp">
        <b>
          +{xp} <Gem size={15} />
        </b>
        <span aria-hidden="true">→</span>
        <span>
          மொத்தம் <b>{num(props.total)} XP</b> 🔒
        </span>
      </div>
      <p class="f-wsave-h">{w.head}</p>
      <p class="f-wsave-s">{w.say}</p>
      <button
        type="button"
        class="f-wsave-go"
        onClick={() => {
          buzz();
          sound("tap");
          props.onClose();
        }}
      >
        சூப்பர்! புதிய வாரம் ▶
      </button>
    </section>
  );
}

/** His rank: his XP ever as a badge and a name, the road to the next one; a new one shines once. */
function RankCard(props: { total: number; rk?: number }) {
  const i = rankShown(props.total, props.rk);
  const next = nextStep(props.total, props.rk);
  const [fresh] = useState(() => {
    const seen = keep<number>("rankSeen");
    return seen !== null && seen !== undefined && i > seen;
  });
  useEffect(() => {
    keep("rankSeen", i);
    if (fresh) sound("trophy");
  }, [i]);
  const pct = Math.max(4, Math.min(100, Math.round(((props.total - next.from) / Math.max(1, next.at - next.from)) * 100)));
  return (
    <section class={`f-card f-rank-c rise${fresh ? " fresh" : ""}`} aria-label="Your rank">
      {fresh && <Confetti n={16} />}
      <span class="f-rank-b" aria-hidden="true">
        {RANKS[i].e}
      </span>
      <div class="f-rank-w">
        <p class="f-rank-n">
          <b>{rankName(props.total, props.rk).replace(/^\S+ /, "")}</b>
          {fresh ? <i class="f-rank-new">🎉 புதிய தரம்!</i> : null}
          <span class="f-rank-xp">
            {num(props.total)} <Gem size={13} />
          </span>
        </p>
        <span class="f-rank-bar" aria-hidden="true">
          <i style={{ width: `${pct}%` }} />
        </span>
        <small>
          இன்னும் {num(next.need)} XP → {next.e} {next.n.replace(/ ⭐\d+$/, "")} · உன் XP என்றும் குறையாது
        </small>
      </div>
    </section>
  );
}

/** Above the race (a student): Monday's card, then his rank. */
export function RaceTop(props: { me: FamilyMe; league: boolean }) {
  const lr = props.me.race?.lr ?? null;
  const now = Date.now();
  const lastWk = weekStart(now) - WEEK_MS;
  const [closed, setClosed] = useState(() => keep<number>("lrSeen") === lr?.wk);
  const show = !!lr && lr.wk === lastWk && !closed;
  return (
    <>
      {show && lr && (
        <WeekCard
          lr={lr}
          total={props.me.total}
          onClose={() => {
            keep("lrSeen", lr.wk);
            setClosed(true);
          }}
        />
      )}
      <RankCard total={props.me.total} rk={props.me.race?.rk} />
    </>
  );
}

/** The five leagues on one road, his own lit with its name (the others: their badge, named for a screen reader), and
 *  Monday's rule. A teacher is in none: the road is how she picks the league she looks at (`onPick`). */
export function LeagueRoad(props: { lg: number; staff: boolean; onPick?: (l: number) => void }) {
  return (
    <section class="f-lroad rise" aria-label="The leagues">
      <ol>
        {LEAGUES.map((x, i) => {
          const l = i + 1;
          const on = l === props.lg;
          const face = on ? (
            <>
              <span aria-hidden="true">{x.e}</span>
              <b>{x.n}</b>
            </>
          ) : (
            <span role="img" aria-label={x.n}>
              {x.e}
            </span>
          );
          return (
            <li key={x.n} class={on ? "on" : l < props.lg ? "past" : ""}>
              {props.onPick ? (
                <button type="button" class="f-lstep" aria-pressed={on} aria-label={`${x.n} league`} onClick={() => props.onPick?.(l)}>
                  {face}
                </button>
              ) : (
                <span class="f-lstep">{face}</span>
              )}
            </li>
          );
        })}
      </ol>
      <p>
        {props.staff
          ? `திங்கள்: ஒவ்வொரு லீக்கிலும் முதல் 3 மேலே, கடைசி 3 கீழே (🛡️ ${SHIELD_DAYS} நாள் கற்றவர் தவிர).`
          : `திங்கள்: முதல் 3 பேர் மேலே, கடைசி 3 பேர் கீழே. வாரத்தில் ${SHIELD_DAYS} நாள் கற்றால் 🛡️: நீ கீழே போக மாட்டாய்.`}
      </p>
    </section>
  );
}
