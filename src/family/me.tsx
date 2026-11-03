// Me: who is on screen, his XP ever and his longest run, this week's lamps (a day with a Level lights one), his
// trophies (won and still to win), and this phone: the children on it (switch, add another, sign out) and the sound.

import { useState } from "preact/hooks";
import type { FamilyMe } from "../../convex/family";
import { MAX_ACCOUNTS, type Account } from "./net";
import { setSoundOn, soundOn } from "./sound";
import { Avatar, firstName, Icon, Lamp, Medal, Spark, TROPHY_ORDER } from "./ui";

/** Monday first, as the week starts (Sri Lanka): திங்கள், செவ்வாய், புதன், வியாழன், வெள்ளி, சனி, ஞாயிறு. */
const DAYS = ["தி", "செ", "பு", "வி", "வெ", "ச", "ஞா"];

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
        <Icon name="plus" size={18} /> இன்னொரு பிள்ளையைச் சேர்
      </button>
      {cur &&
        (sure ? (
          <div class="f-sure rise" role="alertdialog" aria-label="Sign out">
            <p>
              {firstName(cur.name)} இந்த phone இலிருந்து வெளியேறவா? மீண்டும் வர index எண்ணும் code உம் வேண்டும்.
            </p>
            <div class="f-sure-b">
              <button type="button" class="f-btn danger" onClick={props.onSignOut}>
                ஆம், வெளியேறு
              </button>
              <button type="button" class="f-btn ghost" onClick={() => setSure(false)}>
                வேண்டாம்
              </button>
            </div>
          </div>
        ) : (
          <button type="button" class="f-link danger" onClick={() => setSure(true)}>
            <Icon name="out" size={18} /> {firstName(cur.name)}: வெளியேறு
          </button>
        ))}
    </div>
  );
}

export function MeTab(props: {
  me: FamilyMe | null;
  list: Account[];
  current: Account | null;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onSignOut: () => void;
}) {
  const me = props.me;
  const [on, setOn] = useState(soundOn());
  if (!me) return <p class="f-muted f-pad f-center-t">…</p>;
  // A copy kept before 3 Nov 2026 lacks the week and the trophies until the server answers.
  const week = me.week ?? [];
  const won = me.trophies ?? [];
  const today = todayIndex(Date.now());
  return (
    <div class="f-metab">
      <section class="f-profile rise">
        <Avatar name={me.name} size="l" />
        <div class="f-profile-w">
          <b class="f-pname">{me.name}</b>
          <small>{whoWords(me)}</small>
        </div>
      </section>
      <section class="f-stats rise">
        <div>
          <Spark size={22} />
          <b>{me.total ?? me.xp}</b>
          <small>மொத்த XP</small>
        </div>
        <div>
          <Lamp lit size={22} />
          <b>{me.best ?? me.streak.days}</b>
          <small>நீண்ட தொடர்</small>
        </div>
        <div>
          <Icon name="cup" size={22} />
          <b>{won.length}</b>
          <small>கோப்பைகள்</small>
        </div>
      </section>
      <section class="f-week rise">
        <h2 class="f-h2">
          இந்த வாரம் <small>{me.streak.days} நாள் தொடர்</small>
        </h2>
        <div class="f-days">
          {DAYS.map((d, i) => (
            <span key={d} class={`f-day${week[i] ? " lit" : ""}${i === today ? " today" : ""}`}>
              <Lamp lit={!!week[i]} size={24} />
              <small>{d}</small>
            </span>
          ))}
        </div>
      </section>
      <section class="f-cups rise">
        <h2 class="f-h2">
          கோப்பைகள் <small>
            {won.length}/{TROPHY_ORDER.length}
          </small>
        </h2>
        <div class="f-medals grid">
          {TROPHY_ORDER.map((t) => (
            <Medal key={t} t={t} won={won.includes(t)} />
          ))}
        </div>
      </section>
      <section class="f-set rise">
        <h2 class="f-h2">இந்த phone இல்</h2>
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
          <span>ஒலி · Sound</span>
          <span class={`f-switch${on ? " on" : ""}`} aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}
