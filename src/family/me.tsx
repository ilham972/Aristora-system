// Me, his profile (4 Nov 2026, his voice note: "a proper profile page for the students"; one of the parts that come
// right after the first screen: later.ts): his photo (tap to change:
// made small on the phone, sent with a progress bar; his classmates see it after the teachers' OK), his name and grade,
// his flame (days in a row) as the big number and this week; his XP, best run and Levels; his 12 weeks at home and in
// class (one map); his class days and hours; his report (each Stage; on WhatsApp for his parents); XP this week; his
// place in the race; his trophies; his details (a new name, asked; his birthday; his photo in the race or not); and
// this phone: the children on it (switch, add another, sign out), the sound, the owl's surprises.

import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { FamilyMe } from "../../convex/family";
import { isBirthday } from "../../convex/lib/day";
import { Cheered, endsIn, GiftCards, myPlace, useBoard } from "./board";
import { Kids, whoWords } from "./kids";
import { bdayWords, useProfile } from "./later";
import { mutation, type Account } from "./net";
import { PhotoSheet } from "./photo";
import { picOf, usePics } from "./pics";
import { BdaySheet, ClassCard, DaySheet, HeatMap, NameSheet, ReportCard } from "./profile";
import { setSoundOn, sound, soundOn } from "./sound";
import { setSurprisesOn, surprisesOn } from "./surprise";
import {
  Avatar,
  firstName,
  Flame,
  flameAtRisk,
  Gem,
  Icon,
  Medal,
  OwlBadge,
  problemWords,
  showSheet,
  Tag,
  titleSize,
  toast,
  TROPHY_ORDER,
  Waiting,
} from "./ui";

/** Monday first, as the week starts (Sri Lanka): M T W T F S S, the letters every calendar uses. */
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Today's place in the week, Monday = 0, Sri Lanka time. */
function todayIndex(now: number): number {
  return (new Date(now + 330 * 60_000).getUTCDay() + 6) % 7;
}


/** Pick a photo: a label around a hidden file input (it opens the camera or the gallery on every phone). */
function PickPhoto(props: { onFile: (f: File) => void; class?: string; label: string; children: ComponentChildren }) {
  return (
    <label class={props.class} aria-label={props.label}>
      <input
        type="file"
        accept="image/*"
        class="f-pickfile"
        onChange={(e) => {
          const el = e.currentTarget as HTMLInputElement;
          const f = el.files?.[0];
          el.value = "";
          if (f) props.onFile(f);
        }}
      />
      {props.children}
    </label>
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

/** A word from the teachers (they said no to his photo or his name): read once, then OK. */
function Told(props: { text: string; onOk: () => void }) {
  return (
    <div class="f-told rise" role="status">
      <p>{props.text}</p>
      <button type="button" class="f-btn ghost" onClick={props.onOk}>
        OK
      </button>
    </div>
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
  onReport: () => void;
  /** His photo, name or birthday changed: the app asks the server again. */
  onChanged: () => void;
}) {
  const me = props.me;
  const p = useProfile();
  const [on, setOn] = useState(soundOn());
  const [gags, setGags] = useState(surprisesOn());
  const [race, setRace] = useState<boolean | null>(null);
  const [sure, setSure] = useState(false);
  const { b } = useBoard();
  usePics([me?.photo?.key]);
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
  const place = b ? myPlace(b, "grade") : null;
  const rank = place?.mine?.rank ?? null;
  const pic = picOf(me.photo?.key);
  const party = isBirthday(me.bday, Date.now());
  const shown = race ?? !me.photoHide;
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      if (done) toast(done);
      props.onChanged();
    } catch (e) {
      toast(problemWords(e), true);
    }
  };
  const openPhoto = (file: File) =>
    showSheet((close) => (
      <PhotoSheet
        file={file}
        onClose={close}
        onDone={() => {
          close();
          toast("உன் photo வந்தது! ஆசிரியர் OK சொன்னதும் Race இல் தெரியும்.");
          props.onChanged();
        }}
      />
    ));
  return (
    <>
      <header class="f-hero me">
        {props.top}
        <div class="f-me-id">
          <PickPhoto class="f-me-pic" label={me.photo ? "Change your photo" : "Add your photo"} onFile={openPhoto}>
            <Avatar name={me.name} pic={pic} size="xl" />
            <i class="f-me-cam" aria-hidden="true">
              <Icon name="camera" size={17} />
            </i>
          </PickPhoto>
          <div class="f-me-w">
            <b class={`f-me-name${titleSize(me.name)}`}>
              {me.name}
              {party && <span class="f-cake"> 🎂</span>}
            </b>
            <small>{whoWords(me)}</small>
            {me.photo?.wait ? (
              <Tag tone="glass" class="f-me-tag">
                Photo · waiting for OK
              </Tag>
            ) : !me.photo ? (
              <small class="f-me-add">📷 உன் photo ஐச் சேர்</small>
            ) : null}
          </div>
        </div>
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
          <OwlBadge mood={party ? "party" : s.today ? "cheer" : s.days === 0 && (me.best ?? 0) > 0 ? "cry" : flameAtRisk(s) ? "grumpy" : "sleep"} class="hero" />
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
      <GiftCards gifts={me.gifts} />
      <Cheered c={me.cheers} />
      {me.photoNo && <Told text="உன் photo ஐ ஆசிரியர் ஏற்கவில்லை. வேறு ஒன்றைத் தேர்ந்தெடு." onOk={() => void act(() => mutation("family:forget", { kind: "photo" }))} />}
      {me.nameAsk?.no && <Told text={`"${me.nameAsk.name}": உன் ஆசிரியர் இந்தப் பெயரை ஏற்கவில்லை.`} onOk={() => void act(() => mutation("family:forget", { kind: "name" }))} />}
      {p && <HeatMap p={p} onDay={(day) => showSheet((close) => <DaySheet day={day} onClose={close} />)} />}
      {p && <ClassCard p={p} />}
      {p && <ReportCard me={me} p={p} onOpen={props.onReport} />}
      {me.dayXp && <XpBars xp={me.dayXp} total={me.xp} today={today} />}
      {b && place?.mine && (
        <button type="button" class="f-racecard f-card rise" onClick={props.onRace}>
          <span class={`f-race-rank${rank === 1 ? " r1" : ""}`}>{rank !== null ? `#${rank}` : "–"}</span>
          <span class="f-racecard-w">
            <b>{rank === 1 ? "#1 in the race!" : rank !== null ? `#${rank} in the race` : "Not in the race yet"}</b>
            <small>
              {rank === null
                ? "ஒரு Level செய்து race இல் சேர்"
                : place.above && place.gap > 0
                  ? `${place.gap} XP to #${place.above.rank}`
                  : `${place.count} in the race`}{" "}
              · ends in {endsIn(b.since, Date.now())}
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
      <section class="f-set f-card rise" aria-label="Your details">
        <h2 class="f-h2">Your details</h2>
        <button type="button" class="f-row f-drow" onClick={() => showSheet((close) => <NameSheet me={me} onClose={close} onDone={() => (close(), props.onChanged())} />)}>
          <Icon name="user" />
          <span>
            Name
            <small>{me.nameAsk && !me.nameAsk.no ? `${me.nameAsk.name} · waiting for OK` : me.name}</small>
          </span>
          <Icon name="pen" size={18} />
        </button>
        <button
          type="button"
          class="f-row f-drow"
          onClick={() => {
            if (me.bday) {
              sound("tap");
              return toast("பிறந்தநாளை மாற்ற உன் ஆசிரியரிடம் கேள்.");
            }
            showSheet((close) => <BdaySheet onClose={close} onDone={() => (close(), props.onChanged())} />);
          }}
        >
          <Icon name="cake" />
          <span>
            Birthday
            <small>{me.bday ? bdayWords(me.bday) : "அன்று owl ஒரு party வைக்கும்!"}</small>
          </span>
          <Icon name={me.bday ? "lock" : "plus"} size={18} />
        </button>
        {me.photo && (
          <button
            type="button"
            class="f-row"
            aria-pressed={shown}
            onClick={() => {
              setRace(!shown);
              void act(() => mutation("family:setRace", { show: !shown }));
            }}
          >
            <Icon name="trophy" />
            <span>
              Photo in the race
              <small>{shown ? "வகுப்பு நண்பர்கள் பார்ப்பார்கள்" : "உனக்கு மட்டும்"}</small>
            </span>
            <span class={`f-switch${shown ? " on" : ""}`} aria-hidden="true" />
          </button>
        )}
        {me.photo &&
          (sure ? (
            <div class="f-sure rise" role="alertdialog" aria-label="Remove photo">
              <p>உன் photo ஐ நீக்கவா? உன் எழுத்து மீண்டும் வரும்.</p>
              <div class="f-sure-b">
                <button
                  type="button"
                  class="f-btn danger"
                  onClick={() => {
                    setSure(false);
                    void act(() => mutation("family:dropPhoto"), "நீக்கப்பட்டது.");
                  }}
                >
                  Remove
                </button>
                <button type="button" class="f-btn ghost" onClick={() => setSure(false)}>
                  No
                </button>
              </div>
            </div>
          ) : (
            <button type="button" class="f-link danger" onClick={() => setSure(true)}>
              <Icon name="bin" size={18} /> Remove photo
            </button>
          ))}
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
        <button
          type="button"
          class="f-row"
          aria-pressed={gags}
          onClick={() => {
            setSurprisesOn(!gags);
            setGags(!gags);
          }}
        >
          <Icon name="star" />
          <span>Owl surprises</span>
          <span class={`f-switch${gags ? " on" : ""}`} aria-hidden="true" />
        </button>
      </section>
    </>
  );
}
