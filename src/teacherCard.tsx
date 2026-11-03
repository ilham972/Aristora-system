// A teacher's card (3 Nov 2026, his ask: "a dashboard for them: their own work, free time, how much better than the
// other teachers, not including me"; his rule: no red, yellow for warnings, green for good). Opened from the Class tab
// (her name). Hers only; the manager and the owner see everyone's and mark her arrived / went at the bottom (his
// "arrived time and went time, all done by manager"). One screen. The numbers come from the server (duty.card: the
// class digests, convex/lib/boss.ts), read once and every minute while it is open; never a live query.
//
// The yellow number is "free while students waited": free (nobody with her, nobody called to her) while a student sat
// with no work waiting for her job, after the first 2 minutes of each free stretch. Free time alone is never yellow:
// free when nobody needs her is not her fault, and a slow teacher looks busy. A corrector: free = no paper corrected for
// over 3 minutes; yellow = free while papers waited. A manager's managing isn't measured: no free time for her.

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { TSeg } from "../convex/lib/boss";
import { slClock } from "../convex/lib/day";
import { errorText, fetchOnce, mutate } from "./backend";
import type { Stay } from "./manager";
import { act, now as clockNow, toast } from "./store";
import { tone } from "./tones";
import { Sheet } from "./ui";

type Card = Awaited<ReturnType<typeof fetchCard>>;
type Line = NonNullable<Card["today"]>;
type Others = Card["others"]["today"];

const fetchCard = (userId: string) => fetchOnce(api.duty.card, { userId: userId as Id<"users"> });
const READ_MS = 60_000;
/** Below the others by this many points (working %): yellow. */
const BELOW_PTS = 10;
const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

/** "1h 32m", "38m", "0m". */
export function mins(m: number | null | undefined): string {
  const x = Math.max(0, Math.round(m ?? 0));
  return x >= 60 ? `${Math.floor(x / 60)}h ${String(x % 60).padStart(2, "0")}m` : `${x}m`;
}
const pct = (l: Pick<Line, "workMin" | "hereMin">) =>
  l.workMin !== null && l.hereMin ? Math.min(100, Math.round((l.workMin / l.hereMin) * 100)) : null;

/** Her working % against the others': green at or above (and working at all), yellow when well below, plain otherwise. */
export function workTone(mine: number | null, others: number | null): "good" | "warn" | "plain" {
  if (mine === null || others === null) return "plain";
  if (mine >= others) return mine > 0 ? "good" : "plain";
  return others - mine >= BELOW_PTS ? "warn" : "plain";
}
/** Free while work waited: none (or no more than the others) green, more yellow. */
export function missTone(mine: number | null, others: number | null): "good" | "warn" | "plain" {
  if (mine === null) return "plain";
  if (mine < 1) return "good";
  if (others !== null && mine <= others) return "good";
  return "warn";
}

export function TeacherCard(props: { userId: string; name: string; canManage: boolean; stay: Stay | null; onClose: () => void }) {
  const [c, setC] = useState<Card | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reads, setReads] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () =>
      void fetchCard(props.userId)
        .then((d) => {
          if (live) {
            setC(d);
            setErr(null);
          }
        })
        .catch((e) => {
          if (live) setErr(errorText(e));
        });
    load();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, READ_MS);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [props.userId, reads]);
  const reload = () => setReads((n) => n + 1);
  const now = clockNow();
  // The stay from the live team list (the manager's taps show at once), else the card's.
  const open = props.stay && props.stay.outAt === null ? props.stay : null;
  const went = props.stay && props.stay.outAt !== null ? props.stay : null;
  const sub = open
    ? `Arrived ${slClock(open.inAt)} · here ${mins((now - open.inAt) / 60_000)}`
    : went
      ? `Went ${slClock(went.outAt!)}`
      : props.canManage
        ? "Not marked here: tap Arrived when she comes."
        : "Not marked here yet: the manager marks you when you come.";
  const own = c?.own ?? !props.canManage;
  return (
    <Sheet
      title={own ? `${props.name}: your day` : props.name}
      sub={sub}
      onClose={props.onClose}
      cls="tcard"
      foot={props.canManage ? <StayControls userId={props.userId} name={props.name} stay={props.stay} onDone={reload} /> : undefined}
    >
      {err && !c && <p class="tc-note">{err}</p>}
      {!c && !err && <p class="tc-note">Reading the day…</p>}
      {c && <CardBody c={c} own={own} now={now} />}
    </Sheet>
  );
}

function CardBody(props: { c: Card; own: boolean; now: number }) {
  const { c } = props;
  const t = c.today;
  const you = props.own ? "You" : c.name;
  const o = c.others.today;
  const room = c.family === "room";
  if (!t) {
    return (
      <>
        <p class="tc-note">Nothing yet today.</p>
        <Week c={c} />
      </>
    );
  }
  const p = pct(t);
  return (
    <>
      <div class="tc-tiles">
        {c.manager ? (
          <Tile big={mins(t.workMin)} label="correcting" sub={`of ${mins(t.hereMin)} here`} tone="plain" />
        ) : room ? (
          <Tile big={mins(t.workMin)} label="working" sub={p !== null ? `${p}% of the time here` : "not marked here"} tone={workTone(p, o?.workPct ?? null)} />
        ) : (
          <Tile big={String(t.levels + t.checks)} label={t.levels + t.checks === 1 ? "level corrected" : "levels corrected"} sub={t.marks ? `+ ${t.marks} answers` : `in ${mins(t.hereMin)} here`} tone="plain" />
        )}
        {c.manager ? (
          <Tile big={String(room ? t.students : t.levels + t.checks)} label={room ? "students" : "levels"} sub="managing isn't counted" tone="plain" />
        ) : (
          <Tile big={mins(t.freeMin)} label="free" sub={room ? "nobody with you" : "no paper for 3+ min"} tone="plain" />
        )}
        {!c.manager && (
          <Tile
            big={mins(t.missedMin)}
            label={room ? "free while students waited" : "free while papers waited"}
            sub={(t.missedMin ?? 0) < 1 ? "none: well done" : room ? "they had no work" : "papers handed in"}
            tone={missTone(t.missedMin, o?.missedMin ?? null)}
          />
        )}
      </div>
      <p class="tc-done">
        {room
          ? `${t.students} ${t.students === 1 ? "student" : "students"} seen${t.lessons ? ` · ${t.lessons} ${t.lessons === 1 ? "lesson" : "lessons"}` : ""}${t.levels ? ` · ${t.levels} levels corrected` : ""}`
          : `${t.waits ? `papers waited ${mins((t.waitMin ?? 0) / t.waits)} on average` : "no papers handed in yet"}${t.marks ? ` · ${t.marks} theory answers` : ""}`}
      </p>
      {c.segs.length > 0 && <StayBar segs={c.segs} room={room} now={props.now} />}
      {!c.manager && <Compare you={you} t={t} o={o} room={room} />}
      <Week c={c} />
    </>
  );
}

function Tile(props: { big: string; label: string; sub: string; tone: "good" | "warn" | "plain" }) {
  return (
    <div class={`tc-tile t-${props.tone}`}>
      <b>{props.big}</b>
      <span>{props.label}</span>
      <small>{props.sub}</small>
    </div>
  );
}

/** Her stay today as a bar: working green, free pale, free while work waited yellow. */
function StayBar(props: { segs: TSeg[]; room: boolean; now: number }) {
  const from = props.segs[0].s;
  const to = Math.max(props.segs[props.segs.length - 1].e, from + 60_000);
  const span = to - from;
  const w = (x: number) => `${((x / span) * 100).toFixed(2)}%`;
  return (
    <div class="tc-bar">
      <div class="tc-track" role="img" aria-label="Your time here: working, free, free while work waited">
        {props.segs.map((s) => (
          <i key={s.s} class={`k-${s.k}`} style={{ left: w(s.s - from), width: w(s.e - s.s) }} />
        ))}
      </div>
      <div class="tc-bl">
        <span>{slClock(from, false)}</span>
        <span class="tc-legend">
          <i class="k-w" /> working <i class="k-f" /> free <i class="k-m" /> {props.room ? "students waited" : "papers waited"}
        </span>
        <span>{to >= props.now - 90_000 ? "now" : slClock(to, false)}</span>
      </div>
    </div>
  );
}

/** You and the others (their average; the owner and the manager never in it). */
function Compare(props: { you: string; t: Line; o: Others; room: boolean }) {
  const { t, o } = props;
  if (!o) return <p class="tc-note">Nobody else to compare with today.</p>;
  const mine = pct(t);
  const rows: { k: string; a: number | null; b: number | null; unit: "pct" | "min" | "n"; tone: "good" | "warn" | "plain"; max: number }[] = props.room
    ? [
        { k: "Working, % of the time here", a: mine, b: o.workPct, unit: "pct", tone: workTone(mine, o.workPct), max: 100 },
        {
          k: "Free while students waited",
          a: t.missedMin,
          b: o.missedMin,
          unit: "min",
          tone: missTone(t.missedMin, o.missedMin),
          max: Math.max(10, t.missedMin ?? 0, o.missedMin ?? 0),
        },
      ]
    : [
        {
          k: "Levels an hour",
          a: t.hereMin ? Math.round(((t.levels + t.checks) / (t.hereMin / 60)) * 10) / 10 : null,
          b: o.perHour,
          unit: "n",
          tone: "plain",
          max: Math.max(4, o.perHour ?? 0, t.hereMin ? (t.levels + t.checks) / (t.hereMin / 60) : 0),
        },
        {
          k: "Free while papers waited",
          a: t.missedMin,
          b: o.missedMin,
          unit: "min",
          tone: missTone(t.missedMin, o.missedMin),
          max: Math.max(10, t.missedMin ?? 0, o.missedMin ?? 0),
        },
      ];
  const fmt = (x: number | null, u: "pct" | "min" | "n") => (x === null ? "–" : u === "pct" ? `${x}%` : u === "min" ? mins(x) : String(x));
  return (
    <section class="tc-cmp" aria-label="You and the others">
      <h3>
        {props.you} and the others <small>today · average of {o.n}</small>
      </h3>
      {rows.map((r) => (
        <div key={r.k} class="tc-row">
          <span class="tc-k">{r.k}</span>
          <div class={`tc-pair t-${r.tone}`}>
            <Bar label={props.you === "You" ? "you" : props.you} v={r.a} max={r.max} text={fmt(r.a, r.unit)} me />
            <Bar label="others" v={r.b} max={r.max} text={fmt(r.b, r.unit)} />
          </div>
        </div>
      ))}
    </section>
  );
}

function Bar(props: { label: string; v: number | null; max: number; text: string; me?: boolean }) {
  const w = props.v === null || props.max <= 0 ? 0 : Math.min(100, (props.v / props.max) * 100);
  return (
    <div class={`tc-b${props.me ? " me" : ""}`}>
      <span class="tc-bn">{props.label}</span>
      <span class="tc-bt">
        <i style={{ width: `${w.toFixed(1)}%` }} />
      </span>
      <b>{props.text}</b>
    </div>
  );
}

/** Her week: a column a class day, working % as its height; a yellow dot = students (papers) waited while she was free. */
function Week(props: { c: Card }) {
  const { c } = props;
  const days = c.week.slice(-7);
  if (days.length < 2) return null;
  const room = c.family === "room";
  const ow = c.others.week;
  const sum = (f: "workMin" | "hereMin" | "missedMin") => days.reduce((a, d) => a + (d[f] ?? 0), 0);
  const here = sum("hereMin");
  const weekPct = here ? Math.round((sum("workMin") / here) * 100) : null;
  return (
    <section class="tc-week" aria-label="Your week">
      <h3>
        This week{" "}
        <small>
          {room && weekPct !== null && !c.manager ? `working ${weekPct}%${ow?.workPct != null ? ` · others ${ow.workPct}%` : ""} · ` : ""}
          {!c.manager ? `free while waited ${mins(sum("missedMin"))}` : `${mins(sum("workMin"))} correcting`}
        </small>
      </h3>
      <div class="tc-days">
        {days.map((d) => {
          const p = d.hereMin ? Math.round(((d.workMin ?? 0) / d.hereMin) * 100) : null;
          const wd = new Date(`${d.day}T12:00:00+05:30`).getUTCDay();
          return (
            <div key={d.day} class={`tc-day${d.day === c.today?.day ? " now" : ""}`} title={d.day}>
              <span class="tc-dcol">
                <i style={{ height: `${Math.max(4, p ?? 0)}%` }} class={p === null ? "none" : ""} />
              </span>
              <b>{p === null ? "–" : `${p}%`}</b>
              <small class={(d.missedMin ?? 0) >= 1 ? "warn" : ""}>{WEEKDAY[wd]}</small>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The manager's (and the owner's) part: Arrived now or a few minutes ago; when she is here, Went (now or a few minutes
 * ago) and the arrival moved earlier or later. Undo on the message for 5 minutes.
 */
function StayControls(props: { userId: string; name: string; stay: Stay | null; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const open = props.stay && props.stay.outAt === null ? props.stay : null;
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    const r = await act(fn);
    setBusy(false);
    if (r !== undefined) {
      tone("tick");
      props.onDone();
    }
    return r;
  };
  const mark = async (here: boolean, ago: number) => {
    const r = await run(() => mutate(api.duty.mark, { userId: props.userId as Id<"users">, here, ago }));
    if (!r) return;
    toast(`${props.name} ${here ? "arrived" : "went"} ${slClock(r.at)}.`, "info", () => {
      void act(() => mutate(api.duty.undo, { id: r.id, what: here ? "in" : "out" })).then((x) => {
        if (x) {
          toast(here ? `${props.name}: arrival taken back.` : `${props.name} is here again.`);
          props.onDone();
        }
      });
    });
  };
  const move = async (minutes: number) => {
    if (!open) return;
    const r = await run(() => mutate(api.duty.move, { id: open.id as Id<"duty">, minutes }));
    if (r) toast(`${props.name}: arrived ${slClock(r.at)}.`);
  };
  const AGO = [0, 5, 15, 30];
  return (
    <div class="tc-ctl">
      {!open ? (
        <>
          <span class="tc-ck">Arrived</span>
          <div class="tc-cr">
            {AGO.map((a) => (
              <button key={a} type="button" class={`btn small${a === 0 ? " primary" : " ghost"}`} disabled={busy} onClick={() => void mark(true, a)}>
                {a === 0 ? "Now" : `${a}m ago`}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <span class="tc-ck">Went</span>
          <div class="tc-cr">
            {AGO.map((a) => (
              <button key={a} type="button" class="btn small ghost" disabled={busy} onClick={() => void mark(false, a)}>
                {a === 0 ? "Now" : `${a}m ago`}
              </button>
            ))}
          </div>
          <span class="tc-ck">She came at {slClock(open.inAt, false)}: earlier or later?</span>
          <div class="tc-cr">
            {[-10, -5, 5, 10].map((m) => (
              <button key={m} type="button" class="btn small ghost" disabled={busy} onClick={() => void move(m)} aria-label={`${Math.abs(m)} minutes ${m < 0 ? "earlier" : "later"}`}>
                {m < 0 ? `−${-m} min` : `+${m} min`}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
