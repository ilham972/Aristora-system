// A classmate's profile (7 Nov 2026, his voice note: "every profile want to be clickable ... we can see everything about
// the student. Even one student can look another student"; his answer: "Everything"). Tap anyone in the race: his face
// and name, his flame and his week, XP, Levels, his place in his grade and in ARISTORA, the weeks he won (👑), cheers
// (👏, one tap, no words), his trophies, his 12 weeks (class days among them), his class, his questions and every Stage.
// His marks only while the owner's switch is on (Settings → Race): off, the Stages show their Levels and no %.
// Never his account (sign-in, his children, sounds), his day hour by hour, WhatsApp or a certificate.

import { useEffect, useState } from "preact/hooks";
import type { FamilyMate, FamilyMe } from "../../convex/family";
import { placed, type RaceRow } from "../../convex/lib/race";
import type { Board } from "./board";
import { RankLine } from "./league";
import { mutation, query } from "./net";
import { picOf, usePics } from "./pics";
import { ClassCard, HeatMap, QChips, StageCard, sumQ } from "./profile";
import { buzz, sound } from "./sound";
import { Avatar, BRAND, Flame, Gem, Icon, Medal, problemWords, titleSize, toast, TROPHY_ORDER, Waiting } from "./ui";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Profiles seen in this visit (back and forth between the race and a profile asks once). */
const seen = new Map<string, FamilyMate>();

/** His place in a list of the race (null: not started this week, or not in it). */
function placeIn(rows: RaceRow[], id: string): number | null {
  return placed(rows).find((x) => x.r.id === id)?.rank ?? null;
}

export function MateScreen(props: {
  id: string;
  row: RaceRow | null;
  board: Board | null;
  me: FamilyMe | null;
  onBack: () => void;
  /** A teacher (the class app's Us tab, 7 Nov 2026): 🌟 a shout-out for him instead of a classmate's 👏. */
  onShout?: (id: string, name: string) => void;
  /** 💬 A private chat with him (8 Nov 2026): only where his rule allows (the server says: `dm`). */
  onMessage?: (id: string) => void;
}) {
  const [m, setM] = useState<FamilyMate | null>(() => seen.get(props.id) ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pop, setPop] = useState(false);
  useEffect(() => {
    query("family:mate", { id: props.id })
      .then((x) => {
        seen.set(props.id, x as FamilyMate);
        setM(x as FamilyMate);
      })
      .catch((e) => setErr(problemWords(e)));
  }, [props.id]);
  const name = m?.name ?? props.row?.n ?? "";
  const grade = m?.grade ?? props.row?.g ?? null;
  const key = m?.pic ?? props.row?.pic ?? null;
  usePics([key]);
  const b = props.board;
  const inGrade = b && grade !== null ? placeIn(b.rows.filter((r) => r.g === grade), props.id) : null;
  const inAll = b ? placeIn(b.rows, props.id) : null;
  const today = (new Date(Date.now() + 330 * 60_000).getUTCDay() + 6) % 7;
  const cheer = async () => {
    if (!m || m.cheers.mine || busy) return;
    setBusy(true);
    buzz();
    try {
      const r = (await mutation("family:cheer", { id: props.id })) as { n: number; mine: boolean };
      const next = { ...m, cheers: r };
      seen.set(props.id, next);
      setM(next);
      sound("level");
      setPop(true);
      window.setTimeout(() => setPop(false), 1200);
    } catch (e) {
      toast(problemWords(e), true);
    } finally {
      setBusy(false);
    }
  };
  const won = m?.trophies ?? [];
  const s = m?.streak;
  return (
    <div class="f-mate">
      <header class="f-hero me">
        <div class="f-toprow">
          <button type="button" class="f-round on-brand" aria-label="Back" onClick={props.onBack}>
            <Icon name="back" size={20} />
          </button>
          <span class="f-sp" />
        </div>
        <div class="f-me-id">
          <span class="f-me-pic">
            <Avatar name={name || "?"} pic={picOf(key)} size="xl" />
          </span>
          <div class="f-me-w">
            <b class={`f-me-name${titleSize(name)}`}>
              {name}
              {m?.bday && <span class="f-cake"> 🎂</span>}
            </b>
            <small>{grade ? `Grade ${grade}` : BRAND}</small>
            {m && <RankLine total={m.total} rk={m.rk} lg={m.lg} />}
            {m && (m.wins.g > 0 || m.wins.a > 0) && (
              <span class="f-mate-wins">
                👑 {m.wins.g > 0 ? `${m.wins.g} ${m.wins.g === 1 ? "week" : "weeks"} won` : ""}
                {m.wins.g > 0 && m.wins.a > 0 ? " · " : ""}
                {m.wins.a > 0 ? `${BRAND} ×${m.wins.a}` : ""}
              </span>
            )}
          </div>
        </div>
        {s && (
          <div class="f-hero-in">
            <div class="f-hero-w">
              <p class="f-kicker">Streak</p>
              <p class={`f-streaknum${s.today ? " lit" : ""}`}>
                <Flame lit={s.today} size={44} />
                <b>{s.days}</b>
              </p>
              <p class="f-hsub">{s.today ? `${s.days === 1 ? "day" : "days"} in a row · today ✓` : `${s.days === 1 ? "day" : "days"} in a row`}</p>
            </div>
          </div>
        )}
        {m && (
          <div class="f-weekdots" aria-label="This week">
            {DAYS.map((d, i) => (
              <span key={i} class={`f-wdot${m.week[i] ? " lit" : ""}${i === today ? " today" : ""}${i > today ? " later" : ""}`}>
                <i>{m.week[i] ? <Flame lit size={18} /> : i < today ? "·" : ""}</i>
                <small>{d}</small>
              </span>
            ))}
          </div>
        )}
      </header>
      {!m ? (
        err ? <p class="f-none">{err}</p> : <Waiting />
      ) : (
        <>
          <section class="f-stats rise">
            <div>
              <Gem size={22} />
              <b>{m.total.toLocaleString("en")}</b>
              <small>Total XP</small>
            </div>
            <div>
              <Flame lit size={22} />
              <b>{m.best}</b>
              <small>Best streak</small>
            </div>
            <div>
              <Icon name="check" size={22} />
              <b>{m.levelsDone}</b>
              <small>Levels</small>
            </div>
          </section>
          {props.onShout ? (
            <section class="f-card f-clap rise" aria-label="Shout-out">
              <button type="button" class="f-btn big gold" onClick={() => props.onShout!(props.id, name)}>
                <span class="f-clap-h" aria-hidden="true">
                  🌟
                </span>
                Shout-out for {name.split(" ")[0]}
              </button>
              <small>{m.cheers.n > 0 ? `இந்த வாரம் மாணவர்களிடமிருந்து ${m.cheers.n} 👏` : "அவருடைய முயற்சியைப் பாராட்டுங்கள்: அவருக்கு அறிவிப்பு போகும்."}</small>
            </section>
          ) : (
          <section class={`f-card f-clap rise${pop ? " pop" : ""}`} aria-label="Cheers">
            <button type="button" class={`f-btn big ${m.cheers.mine ? "ghost" : "gold"}`} disabled={m.cheers.mine || busy} onClick={() => void cheer()}>
              <span class="f-clap-h" aria-hidden="true">
                👏
              </span>
              {m.cheers.mine ? "Cheered today" : `Cheer ${name.split(" ")[0]}`}
            </button>
            <small>
              {m.cheers.n > 0 ? `இந்த வாரம் ${m.cheers.n} 👏` : "இந்த வாரம் முதல் 👏 உன்னுடையதாக இருக்கட்டும்!"}
            </small>
          </section>
          )}
          {m.dm && props.onMessage && (
            <button type="button" class="f-btn white f-mate-dm rise" onClick={() => props.onMessage!(props.id)}>
              💬 Message {name.split(" ")[0]}
            </button>
          )}
          <section class="f-card f-mate-race rise" aria-label="This week">
            <h2 class="f-h2">
              This week <small>{m.xp} XP</small>
            </h2>
            <div class="f-mate-pl">
              <div>
                <b>{inGrade !== null ? `#${inGrade}` : "—"}</b>
                <small>{grade ? `Grade ${grade}` : "Grade"}</small>
              </div>
              <div>
                <b>{inAll !== null ? `#${inAll}` : "—"}</b>
                <small>{BRAND}</small>
              </div>
            </div>
          </section>
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
          <HeatMap p={m.p} />
          <ClassCard p={m.p} />
          {m.marks && (
            <section class="f-card rise">
              <h2 class="f-h2">
                Questions <small>All</small>
              </h2>
              <QChips q={sumQ(m.p.stages)} />
            </section>
          )}
          <h2 class="f-h2 out f-rep-h">Stages</h2>
          {m.p.stages.length === 0 ? (
            <p class="f-none">இன்னும் எந்த Stage உம் இல்லை.</p>
          ) : (
            m.p.stages.map((x) => <StageCard key={x.unitId} s={x} marks={m.marks} />)
          )}
          <div class="f-pad-x f-mate-foot" />
        </>
      )}
    </div>
  );
}
