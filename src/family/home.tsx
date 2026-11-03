// Home: the institute's side of the app (3 Nov 2026, his voice note: "this is also the learning app of our education
// institute"). Today's class (in class now, when it starts, or the next one), today's learning goal (his Level now and
// his flame), his class week (the centre's hours from Settings → Class hours, the days he usually comes, the days he
// came), what he did on a day (in class and at home, hour by hour), and his last classes. Never his waiting time.

import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { ClassDay, FamilyClasses, FamilyMe } from "../../convex/family";
import type { DayItem } from "../../convex/lib/family";
import { levelsDone } from "./map";
import { keep, query } from "./net";
import { nextPlay } from "./play";
import { buzz, sound } from "./sound";
import { Dashes, firstName, Flame, Icon, Owl, OwlBadge, problemWords, Tag, type IconName } from "./ui";

const SL = 330 * 60_000;
const DAY = 86_400_000;
/** Days and times in English, as every phone and calendar shows them (his ask, 4 Nov 2026: "M for Monday"). */
export const DAY_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_S = ["M", "T", "W", "T", "F", "S", "S"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Sri Lanka now: the date ("2026-11-03"), minutes after midnight, the weekday (Monday = 0). */
function slNow(now: number) {
  const d = new Date(now + SL);
  return { day: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes(), wd: (d.getUTCDay() + 6) % 7 };
}
/** "2026-11-03" → its weekday (Monday = 0), its day of the month, its month. */
function partsOf(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  return { wd: (d.getUTCDay() + 6) % 7, date: d.getUTCDate(), month: MONTH[d.getUTCMonth()] };
}
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** Minutes after midnight → "3:30 PM". */
export function clock(min: number): string {
  const h = Math.floor(min / 60) % 24;
  return `${((h + 11) % 12) + 1}:${String(min % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
/** A moment → its time of day in Sri Lanka. */
const timeOf = (t: number) => clock(Math.floor(((((t + SL) % DAY) + DAY) % DAY) / 60_000));
/** "2 h 10 min" */
function span(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} h${m ? ` ${m} min` : ""}` : `${Math.max(1, m)} min`;
}

// ---- Today's class ----

function TodayCard(props: { cls: FamilyClasses | null; me: FamilyMe | null; now: number; today: DayItem[] | undefined; onStage: (unitId: string) => void }) {
  const { cls, me } = props;
  const t = slNow(props.now);
  const hours = cls?.hours ?? [];
  const h = hours[t.wd] ?? null;
  const came = cls?.week?.[t.wd];
  let live = false;
  let line: string | null = null;
  let note: string | null = null;
  if (cls?.inClass) {
    live = true;
    line = "In class now";
    note = `since ${timeOf(cls.inClass)}${h ? ` · till ${clock(h.to)}` : ""}`;
  } else if (came?.inAt) {
    line = "Today's class ✓";
    note = `${timeOf(came.inAt)} – ${came.outAt ? timeOf(came.outAt) : "…"}`;
  } else if (h && t.min < h.from) {
    line = `Today ${clock(h.from)} – ${clock(h.to)}`;
    note = `in ${span(h.from - t.min)}`;
  } else if (h && t.min < h.to) {
    line = "Class is on now";
    note = `till ${clock(h.to)}`;
  } else if (cls) {
    // The next class: one of his usual days first, else any day the class is open.
    const usual = cls.usual ?? [];
    for (const pass of [true, false]) {
      for (let k = 1; k <= 7 && !line; k++) {
        const wd = (t.wd + k) % 7;
        const x = hours[wd];
        if (x && (!pass || usual.includes(wd))) {
          line = `Next class: ${k === 1 ? "Tomorrow" : DAY_EN[wd]}`;
          note = `${clock(x.from)} – ${clock(x.to)}`;
        }
      }
      if (line) break;
    }
  }
  if (!line) return null;
  const w = me?.worlds.find((x) => x.now) ?? null;
  const inClassToday = (props.today ?? []).filter((x) => x.k === "level" && x.how !== "home").length;
  return (
    <section class={`f-today rise${live ? " live" : ""}`} aria-label="Today's class">
      <div class="f-today-w">
        <p class="f-today-l">
          {live && <i class="f-livedot" aria-hidden="true" />}
          {line}
        </p>
        {note && <small class="f-today-n">{note}</small>}
        {w ? (
          <>
            <b class="f-today-t">{w.ta}</b>
            <span class="f-today-p">
              <Dashes done={levelsDone(w)} of={w.levels.length} />
              <small>
                Stage {w.no}
                {w.book ? ` · ${levelsDone(w)}/${w.levels.length}` : ""}
                {inClassToday ? ` · ${inClassToday} Level${inClassToday > 1 ? "s" : ""} today` : ""}
              </small>
            </span>
          </>
        ) : (
          <b class="f-today-t">ARISTORA class</b>
        )}
      </div>
      <Owl mood={live ? "happy" : "idle"} class="today" still />
      {w?.book && (
        <button type="button" class="f-today-go" aria-label={`Stage ${w.no}`} onClick={() => props.onStage(w.unitId)}>
          <Icon name="play" size={20} class="fill" />
        </button>
      )}
    </section>
  );
}

// ---- Today's goal: his Level now and his flame ----

function GoalCard(props: { me: FamilyMe | null; onPlay: () => void; onLearn: () => void }) {
  const me = props.me;
  if (!me) return null;
  const next = nextPlay(me);
  const s = me.streak;
  return (
    <section class={`f-goal f-card rise${s.today ? " lit" : ""}`}>
      <div class="f-goal-w">
        <p class="f-kicker">Today's goal</p>
        {next ? (
          <>
            <b class="f-goal-t">
              Level {next.n} <small>· Stage {next.world.no}</small>
            </b>
            <small class="f-goal-s">{next.world.ta}</small>
          </>
        ) : (
          <b class="f-goal-t">இப்போது phone இல் Level இல்லை</b>
        )}
        <p class="f-goal-f">
          <Flame lit={s.today} size={17} />
          {s.today
            ? "இன்றைய தீ மூண்டது! இன்னொரு Level?"
            : s.days > 0
              ? `இன்று ஒரு Level செய்தால் ${s.days + 1} நாள் தொடர்!`
              : "இன்று ஒரு Level செய்து தீயை மூட்டு!"}
        </p>
      </div>
      {next ? (
        <button type="button" class={`f-btn gold f-goal-b${s.today ? "" : " shine"}`} onClick={props.onPlay}>
          START
        </button>
      ) : (
        <button type="button" class="f-btn ghost f-goal-b" onClick={props.onLearn}>
          Learn
        </button>
      )}
    </section>
  );
}

// ---- His class week and a day's timeline ----

function itemLook(x: DayItem): { icon: IconName; b: string; s: string } {
  if (x.k === "room") {
    const what = x.room === "evaluation" ? "விளக்கினார்" : "கற்பித்தார்";
    const qs = x.qs.length ? `Q${x.qs.join(", Q")} ${what}` : "";
    return {
      icon: "teach",
      b: `${x.room === "evaluation" ? "Evaluation" : "Theory"}${x.teacher ? ` · ${x.teacher}` : ""}`,
      s: [x.no !== null ? `Stage ${x.no}` : "", x.section ?? "", qs].filter(Boolean).join(" · "),
    };
  }
  if (x.k === "level") {
    if (x.how === "handed") return { icon: "clock", b: `Level ${x.n}: கொடுத்தாய்`, s: `Stage ${x.no} · ஆசிரியரிடம்` };
    const xp = x.got !== null ? ` · ${x.got}/${x.max} XP` : "";
    return x.how === "home"
      ? { icon: "home", b: `Level ${x.n}${xp}`, s: `Stage ${x.no} · வீட்டில், phone இல்` }
      : { icon: "check", b: `Level ${x.n}${xp}`, s: `Stage ${x.no} · வகுப்பில் திருத்தப்பட்டது` };
  }
  return x.k === "in" ? { icon: "in", b: "வகுப்புக்கு வந்தாய்", s: "" } : { icon: "out", b: "வகுப்பிலிருந்து சென்றாய்", s: "" };
}

function Timeline(props: { items: DayItem[] | undefined; err: string | null }) {
  if (props.items === undefined) {
    return props.err ? <p class="f-muted small f-center-t">{props.err}</p> : <p class="f-tl-wait">…</p>;
  }
  if (props.items.length === 0) {
    return (
      <div class="f-tl-none">
        <Owl mood="sleep" class="tiny" still />
        <small>இந்த நாள் எதுவும் இல்லை</small>
      </div>
    );
  }
  return (
    <ol class="f-tl">
      {props.items.map((x, i) => {
        const l = itemLook(x);
        return (
          <li key={i} class={`f-tli k-${x.k}${x.k === "level" ? ` h-${x.how}` : ""}`}>
            <time class="f-tlt">{timeOf(x.at)}</time>
            <span class="f-tld" aria-hidden="true">
              <Icon name={l.icon} size={15} />
            </span>
            <span class="f-tlw">
              <b>{l.b}</b>
              {l.s && <small>{l.s}</small>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Recent(props: { list: ClassDay[]; sel: string; onSel: (day: string) => void }) {
  return (
    <ul class="f-recent">
      {props.list.map((c) => {
        const p = partsOf(c.day);
        return (
          <li key={c.day}>
            <button type="button" class={`f-rc${props.sel === c.day ? " on" : ""}`} onClick={() => props.onSel(c.day)}>
              <span class="f-rc-d">
                <small>{DAY_EN[p.wd]}</small>
                <b>{p.date}</b>
              </span>
              <span class="f-rc-w">
                <b>
                  {timeOf(c.inAt)} – {c.outAt ? timeOf(c.outAt) : "…"}
                </b>
                <small>
                  {c.levels ? `${c.levels} Level${c.levels > 1 ? "s" : ""}` : "No Levels"}
                  {c.teachers.length ? ` · ${c.teachers.join(", ")}` : ""}
                </small>
              </span>
              <Icon name="next" size={18} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function HomeTab(props: { top: ComponentChildren; me: FamilyMe | null; onPlay: () => void; onLearn: () => void; onStage: (unitId: string) => void }) {
  const [cls, setCls] = useState<FamilyClasses | null>(() => keep<FamilyClasses>("classes"));
  const [now, setNow] = useState(() => Date.now());
  const t = slNow(now);
  const [sel, setSel] = useState(t.day);
  const [days, setDays] = useState<Record<string, DayItem[]>>(() => {
    const kept = keep<{ day: string; items: DayItem[] }>("today");
    return kept ? { [kept.day]: kept.items } : {};
  });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    query("family:classes")
      .then((x) => {
        keep("classes", x);
        setCls(x as FamilyClasses);
      })
      .catch(() => {});
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (sel > t.day) return;
    let gone = false;
    setErr(null);
    query("family:day", { day: sel })
      .then((x) => {
        if (gone) return;
        const r = x as { day: string; items: DayItem[] };
        if (r.day === t.day) keep("today", r);
        setDays((d) => ({ ...d, [r.day]: r.items }));
      })
      .catch((e) => {
        if (!gone) setErr(problemWords(e));
      });
    return () => {
      gone = true;
    };
  }, [sel]);

  const pick = (day: string) => {
    buzz();
    sound("tap");
    setSel(day);
  };
  const me = props.me;
  const name = me?.name ?? "";
  const tp = partsOf(t.day);
  const monday = addDays(t.day, -t.wd);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const hours = cls?.hours ?? [];
  const usual = cls?.usual ?? [];
  const sp = partsOf(sel);
  const sh = hours[sp.wd] ?? null;
  const future = sel > t.day;
  const recent = cls?.recent ?? [];
  return (
    <>
      <header class="f-head">
        {props.top}
        <div class="f-greet rise">
          <div>
            <p class="f-kicker">
              {DAY_EN[t.wd]} · {tp.date} {tp.month}
            </p>
            <h1 class="f-title">வணக்கம்{name ? `, ${firstName(name)}` : ""}!</h1>
          </div>
          <OwlBadge mood="wave" class="greet" />
        </div>
      </header>
      <TodayCard cls={cls} me={me} now={now} today={days[t.day]} onStage={props.onStage} />
      <GoalCard me={me} onPlay={props.onPlay} onLearn={props.onLearn} />
      <section class="f-sched f-card rise" aria-label="Class week">
        <h2 class="f-h2">
          <Icon name="cal" size={19} /> Class week
        </h2>
        <div class="f-weekstrip" role="group">
          {week.map((day, i) => {
            const came = !!cls?.week?.[i]?.inAt;
            return (
              <button
                type="button"
                key={day}
                class={`f-wd${day === t.day ? " today" : ""}${day === sel ? " sel" : ""}${came ? " came" : ""}${hours[i] ? " open" : ""}${usual.includes(i) ? " usual" : ""}`}
                aria-pressed={day === sel}
                aria-label={`${DAY_EN[i]} ${partsOf(day).date}`}
                onClick={() => pick(day)}
              >
                <small>{DAY_S[i]}</small>
                <b>{partsOf(day).date}</b>
                <i class="f-wd-dot" aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <p class="f-dayhours">
          <b>
            {sel === t.day ? "Today" : `${DAY_EN[sp.wd]} ${sp.date} ${sp.month}`}
          </b>
          {sh ? (
            <span>
              Class {clock(sh.from)} – {clock(sh.to)}
              {usual.includes(sp.wd) && <Tag tone="violet" class="f-usual">Your day</Tag>}
            </span>
          ) : (
            <span class="f-muted">No class</span>
          )}
        </p>
        {!future && <Timeline items={days[sel]} err={err} />}
        <p class="f-legend" aria-hidden="true">
          <span>
            <i class="came" /> You came
          </span>
          <span>
            <i class="usual" /> Your usual day
          </span>
        </p>
      </section>
      {recent.length > 0 && (
        <section class="f-recentbox rise">
          <h2 class="f-h2 out">
            <Icon name="clock" size={19} /> Last classes
          </h2>
          <Recent
            list={recent}
            sel={sel}
            onSel={(day) => {
              pick(day);
              document.querySelector(".f-sched")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        </section>
      )}
    </>
  );
}
