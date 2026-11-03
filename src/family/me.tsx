// Me: his flame (days in a row) and his best, this week day by day, his XP this week as bars, his place in the race,
// his trophies (won and still to win), and this phone: the children on it (switch, add another, sign out) and the sound.

import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { FamilyMe } from "../../convex/family";
import { endsIn, passOf, type Board } from "./board";
import { MAX_ACCOUNTS, query, type Account } from "./net";
import { setSoundOn, soundOn } from "./sound";
import { Avatar, firstName, Flame, Gem, Icon, Medal, OwlBadge, Tag, TROPHY_ORDER, Waiting } from "./ui";

/** Monday first, as the week starts (Sri Lanka): M T W T F S S, the letters every calendar uses. */
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Today's place in the week, Monday = 0, Sri Lanka time. */
function todayIndex(now: number): number {
  return (new Date(now + 330 * 60_000).getUTCDay() + 6) % 7;
}

const whoWords = (a: { grade?: number | null; index?: number | null }) =>
  [a.grade ? `Grade ${a.grade}` : "", a.index ? `#${a.index}` : ""].filter(Boolean).join(" · ");

/** The children on this phone: tap one to switch; add another; sign the one on screen out (after a second tap). */
export function Kids(props: { list: Account[]; current: Account | null; onSwitch: (id: string) => void; onAdd: () => void; onSignOut: () => void }) {
  const [sure, setSure] = useState(false);
  const cur = props.current;
  return (
    <div class="f-kids">
      <ul class="f-kid-list">
        {props.list.map((a) => (
          <li key={a.id}>
            <button type="button" class={`f-kid${a.id === cur?.id ? " on" : ""}`} aria-pressed={a.id === cur?.id} onClick={() => props.onSwitch(a.id)}>
              <Avatar name={a.name || "?"} />
              <span class="f-kid-w">
                <b>{a.name || "…"}</b>
                <small>{whoWords(a)}</small>
              </span>
              {a.id === cur?.id && (
                <i class="f-kid-on">
                  <Icon name="check" size={18} />
                </i>
              )}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" class="f-btn ghost f-add" disabled={props.list.length >= MAX_ACCOUNTS} onClick={props.onAdd}>
        <Icon name="plus" size={18} /> Add a child
      </button>
      {cur &&
        (sure ? (
          <div class="f-sure rise" role="alertdialog" aria-label="Sign out">
            <p>
              {firstName(cur.name)} இந்த phone இலிருந்து வெளியேறவா? மீண்டும் வர index எண்ணும் code உம் வேண்டும்.
            </p>
            <div class="f-sure-b">
              <button type="button" class="f-btn danger" onClick={props.onSignOut}>
                Sign out
              </button>
              <button type="button" class="f-btn ghost" onClick={() => setSure(false)}>
                No
              </button>
            </div>
          </div>
        ) : (
          <button type="button" class="f-link danger" onClick={() => setSure(true)}>
            <Icon name="out" size={18} /> Sign out {firstName(cur.name)}
          </button>
        ))}
    </div>
  );
}

/** XP each day this week as bars (today's in purple), with the week's total. */
function XpBars(props: { xp: number[]; total: number; today: number }) {
  const top = Math.max(10, ...props.xp);
  return (
    <section class="f-chart f-card rise" aria-label="XP this week">
      <h2 class="f-h2">
        XP this week
        <span class="f-chart-t">
          <Gem size={16} /> {props.total}
        </span>
      </h2>
      <div class="f-bars">
        {DAYS.map((d, i) => {
          const v = props.xp[i] ?? 0;
          return (
            <div key={i} class={`f-bar${i === props.today ? " today" : ""}${i > props.today ? " later" : ""}`}>
              <small class="f-bar-v">{v > 0 ? v : ""}</small>
              <i style={{ height: `${Math.max(v > 0 ? 8 : 4, Math.round((v / top) * 104))}px`, animationDelay: `${i * 50}ms` }} />
              <small class="f-bar-d">{d}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function MeTab(props: {
  top: ComponentChildren;
  me: FamilyMe | null;
  list: Account[];
  current: Account | null;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onSignOut: () => void;
  onRace: () => void;
}) {
  const me = props.me;
  const [on, setOn] = useState(soundOn());
  const [b, setB] = useState<Board | null>(null);
  useEffect(() => {
    query("family:board")
      .then((x) => setB(x as Board))
      .catch(() => {});
  }, []);
  if (!me) {
    return (
      <>
        <header class="f-hero">{props.top}</header>
        <Waiting />
      </>
    );
  }
  // A copy kept before 3 Nov 2026 lacks some of these until the server answers.
  const week = me.week ?? [];
  const won = me.trophies ?? [];
  const today = todayIndex(Date.now());
  const s = me.streak;
  const best = s.days > 0 && s.days >= (me.best ?? 0);
  const pass = b ? passOf(b) : null;
  return (
    <>
      <header class="f-hero me">
        {props.top}
        <div class="f-hero-in">
          <div class="f-hero-w">
            <p class="f-kicker">Streak</p>
            <p class={`f-streaknum${s.today ? " lit" : ""}`}>
              <Flame lit={s.today} size={44} />
              <b>{s.days}</b>
            </p>
            <p class="f-hsub">{s.today ? `${s.days === 1 ? "day" : "days"} in a row · today ✓` : s.days > 0 ? "இன்று ஒரு Level செய்: தீ அணையாமல் பார்!" : "இன்று ஒரு Level செய்து தொடங்கு!"}</p>
            {best && <Tag tone="gold">PERSONAL BEST</Tag>}
          </div>
          <OwlBadge mood={s.today ? "cheer" : "sleep"} class="hero" />
        </div>
        <div class="f-weekdots" aria-label="This week">
          {DAYS.map((d, i) => (
            <span key={i} class={`f-wdot${week[i] ? " lit" : ""}${i === today ? " today" : ""}${i > today ? " later" : ""}`}>
              <i>{week[i] ? <Flame lit size={18} /> : i < today ? "·" : ""}</i>
              <small>{d}</small>
            </span>
          ))}
        </div>
      </header>
      <section class="f-profile f-card rise">
        <Avatar name={me.name} size="l" />
        <div class="f-profile-w">
          <b class="f-pname">{me.name}</b>
          <small>{whoWords(me)}</small>
        </div>
      </section>
      <section class="f-stats rise">
        <div>
          <Gem size={22} />
          <b>{(me.total ?? me.xp).toLocaleString("en")}</b>
          <small>Total XP</small>
        </div>
        <div>
          <Flame lit size={22} />
          <b>{me.best ?? s.days}</b>
          <small>Best streak</small>
        </div>
        <div>
          <Icon name="check" size={22} />
          <b>{me.levelsDone ?? 0}</b>
          <small>Levels</small>
        </div>
      </section>
      {me.dayXp && <XpBars xp={me.dayXp} total={me.xp} today={today} />}
      {b?.me && (
        <button type="button" class="f-racecard f-card rise" onClick={props.onRace}>
          <span class={`f-race-rank${b.me.rank === 1 && b.me.xp > 0 ? " r1" : ""}`}>#{b.me.rank}</span>
          <span class="f-racecard-w">
            <b>{b.me.rank === 1 && b.me.xp > 0 ? "#1 in the race!" : `#${b.me.rank} in the race`}</b>
            <small>
              {pass?.above && pass.gap > 0 ? `${pass.gap} XP to #${pass.above.rank}` : `${b.count} in the race`} · ends in {endsIn(b.since, Date.now())}
            </small>
          </span>
          <Icon name="next" size={20} />
        </button>
      )}
      <section class="f-cups f-card rise">
        <h2 class="f-h2">
          Trophies <small>
            {won.length}/{TROPHY_ORDER.length}
          </small>
        </h2>
        <div class="f-medals grid">
          {TROPHY_ORDER.map((t) => (
            <Medal key={t} t={t} won={won.includes(t)} />
          ))}
        </div>
      </section>
      <section class="f-set f-card rise">
        <h2 class="f-h2">On this phone</h2>
        <Kids list={props.list} current={props.current} onSwitch={props.onSwitch} onAdd={props.onAdd} onSignOut={props.onSignOut} />
        <button
          type="button"
          class="f-row"
          aria-pressed={on}
          onClick={() => {
            setSoundOn(!on);
            setOn(!on);
          }}
        >
          <Icon name={on ? "sound" : "mute"} />
          <span>Sound</span>
          <span class={`f-switch${on ? " on" : ""}`} aria-hidden="true" />
        </button>
      </section>
    </>
  );
}
