// Online, last seen and time in the app on a profile (12 Nov 2026, his voice note: "the green dot ... closed a few
// minutes ago or few hours ago ... the bar graph that shows how many hours studied each day ... month and week and also
// day ... if I press any bar, that will open the dialog ... the time they come and go"; his answers: the bars = time in
// the app, the sheet also shows the time inside Levels, "students want to know the bar is pressable"). His own Me and a
// classmate's profile; a classmate's only while the owner's switch is on (Settings → Race: the server says no and the
// card stays away). The decisions: convex/lib/appTime.ts.

import { useEffect, useState } from "preact/hooks";
import type { Usage, UsageStay } from "../../convex/online";
import { hourBars, seenWords, spanWords, type DayBar } from "../../convex/lib/appTime";
import { DAY_MS, slClock } from "../../convex/lib/day";
import { DAY_EN, MONTH } from "./home";
import { keep, query } from "./net";
import { buzz, sound } from "./sound";
import { Sheet, showSheet, Waiting } from "./ui";

type View = "day" | "week" | "month";

/** A day number's words: "Thu 12 Nov", or its parts. */
function dayParts(d: number) {
  const t = new Date(d * DAY_MS);
  return { wd: DAY_EN[(t.getUTCDay() + 6) % 7], date: t.getUTCDate(), month: MONTH[t.getUTCMonth()] };
}
const dayWords = (d: number) => {
  const p = dayParts(d);
  return `${p.wd} ${p.date} ${p.month}`;
};

/** The green dot on a face: in the app now. */
export function OnDot(props: { on: boolean }) {
  return props.on ? <i class="f-on" role="img" aria-label="Online" /> : null;
}

/** Under a name: "● Online" or "Seen 2 h ago" (nothing when he was never in the app). */
export function SeenLine(props: { seen?: { at: number | null; on: boolean } }) {
  const s = props.seen;
  const w = s ? seenWords(s.at, s.on, Date.now()) : null;
  if (!w) return null;
  return <span class={`f-seen${s?.on ? " on" : ""}`}>{s?.on ? <i class="f-on in" aria-hidden="true" /> : null}{s?.on ? w : `Seen ${w}`}</span>;
}

/** Bars from minutes: the tallest fills the box (at least an hour's scale for a day, 10 min for an hour). */
function Bars(props: { items: { key: string | number; min: number; label: string; hot?: boolean; tip?: string }[]; floor: number; onTap: (i: number) => void; dense?: boolean }) {
  const max = Math.max(props.floor, ...props.items.map((x) => x.min));
  const top = props.items.reduce((b, x, i) => (x.min > props.items[b].min ? i : b), 0);
  return (
    <div class={`f-ubars${props.dense ? " dense" : ""}`}>
      <span class="f-ubars-top">{spanWords(max * 60_000)}</span>
      {props.items.map((x, i) => (
        <button
          type="button"
          key={x.key}
          class={`f-ubar${x.hot ? " hot" : ""}${i === top && x.min > 0 ? " big" : ""}`}
          aria-label={`${x.tip ?? x.label}: ${spanWords(x.min * 60_000)}`}
          onClick={() => props.onTap(i)}
        >
          <span class="f-ubar-col">
            {!props.dense && x.min > 0 && <small>{spanWords(x.min * 60_000)}</small>}
            <i style={{ height: `${x.min > 0 ? Math.max(4, (x.min / max) * 100) : 0}%` }} />
          </span>
          <em>{x.label}</em>
        </button>
      ))}
    </div>
  );
}

/** One day's stays (a bar tapped): when he came and left, his time, his time inside Levels, hour by hour. */
function DaySheet(props: { id: string; day: number; onClose: () => void }) {
  const [stays, setStays] = useState<UsageStay[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    query("online:usageDay", { id: props.id, day: props.day })
      .then((r) => setStays((r as { stays: UsageStay[] }).stays))
      .catch(() => setErr("இப்போது பார்க்க முடியவில்லை."));
  }, []);
  const ms = (stays ?? []).reduce((a, s) => a + s.ms, 0);
  const lv = (stays ?? []).reduce((a, s) => a + s.lv, 0);
  const hours = stays ? hourBars(stays, props.day) : [];
  const busy = hours.map((m, h) => ({ m, h })).filter((x) => x.m > 0);
  const first = busy.length ? Math.min(busy[0].h, 18) : 6;
  const shown = hours.slice(Math.max(0, first - 1), Math.min(24, Math.max(first + 11, (busy[busy.length - 1]?.h ?? 0) + 2)));
  return (
    <Sheet title={dayWords(props.day)} onClose={props.onClose}>
      <div class="f-usheet">
        {!stays ? (
          err ? <p class="f-none">{err}</p> : <Waiting />
        ) : (
          <>
            <div class="f-ustats">
              <div>
                <b>{spanWords(ms)}</b>
                <small>In the app</small>
              </div>
              <div class="lv">
                <b>{spanWords(lv)}</b>
                <small>In Levels</small>
              </div>
              <div>
                <b>{stays.length}</b>
                <small>{stays.length === 1 ? "Visit" : "Visits"}</small>
              </div>
            </div>
            {stays.length === 0 ? (
              <p class="f-none">இந்த நாள் app திறக்கப்படவில்லை.</p>
            ) : (
              <>
                <Bars
                  dense
                  floor={10}
                  onTap={() => {}}
                  items={shown.map((m, i) => {
                    const h = Math.max(0, first - 1) + i;
                    return { key: h, min: m, label: h % 3 === 0 ? `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}` : "", tip: `${h}:00` };
                  })}
                />
                <ol class="f-ustays">
                  {stays.map((s) => (
                    <li key={s.from} class={s.on ? "on" : ""}>
                      <span class="f-ustay-t">
                        <b>{slClock(s.from)}</b>
                        <i aria-hidden="true">→</i>
                        <b>{s.on ? "now" : slClock(s.to)}</b>
                      </span>
                      <span class="f-ustay-m">
                        {spanWords(s.ms)}
                        {s.lv > 0 && <small>Levels {spanWords(s.lv)}</small>}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

/** The profile's card: the last seen line's twin for the numbers, Day / Week / Month bars, each bar a door to its day. */
export function UsageCard(props: { id: string }) {
  const [u, setU] = useState<Usage | null>(null);
  const [gone, setGone] = useState(false);
  const [view, setView] = useState<View>(() => keep<View>("usageView") ?? "week");
  const [today, setToday] = useState<UsageStay[] | null>(null);
  useEffect(() => {
    query("online:usage", { id: props.id })
      .then((x) => setU(x as Usage))
      .catch(() => setGone(true));
  }, [props.id]);
  useEffect(() => {
    if (view === "day" && u && !today)
      query("online:usageDay", { id: props.id, day: u.today })
        .then((r) => setToday((r as { stays: UsageStay[] }).stays))
        .catch(() => setToday([]));
  }, [view, u]);
  if (gone) return null;
  const open = (day: number) => {
    buzz();
    sound("tap");
    showSheet((close) => <DaySheet id={props.id} day={day} onClose={close} />);
  };
  const pick = (v: View) => {
    if (v === view) return;
    buzz();
    sound("tap");
    setView(v);
    keep("usageView", v);
  };
  let body = <Waiting />;
  let sum = "";
  let lvSum = 0;
  if (u) {
    const t = u.today;
    const mon = t - ((new Date(t * DAY_MS).getUTCDay() + 6) % 7);
    const asItem = (b: DayBar, label: string) => ({ key: b.d, min: Math.round(b.ms / 60_000), label, hot: b.d === t, tip: dayWords(b.d) });
    if (view === "month") {
      const bars = u.bars;
      sum = spanWords(bars.reduce((a, b) => a + b.ms, 0));
      lvSum = bars.reduce((a, b) => a + b.lv, 0);
      body = <Bars dense floor={60} onTap={(i) => open(bars[i].d)} items={bars.map((b) => asItem(b, b.d === t || (t - b.d) % 7 === 0 ? String(dayParts(b.d).date) : ""))} />;
    } else if (view === "week") {
      const bars = u.bars.filter((b) => b.d >= mon);
      const all = Array.from({ length: 7 }, (_, i) => bars.find((b) => b.d === mon + i) ?? { d: mon + i, ms: 0, lv: 0 });
      sum = spanWords(bars.reduce((a, b) => a + b.ms, 0));
      lvSum = bars.reduce((a, b) => a + b.lv, 0);
      body = <Bars floor={60} onTap={(i) => (all[i].d <= t ? open(all[i].d) : undefined)} items={all.map((b) => asItem(b, DAY_EN[(b.d - mon) % 7][0]))} />;
    } else {
      const hours = today ? hourBars(today, t) : null;
      const tb = u.bars[u.bars.length - 1];
      sum = spanWords(tb.ms);
      lvSum = tb.lv;
      body = !hours ? (
        <Waiting />
      ) : (
        <Bars
          dense
          floor={10}
          onTap={() => open(t)}
          items={hours.map((m, h) => ({ key: h, min: m, label: h % 6 === 0 ? `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}` : "", tip: `${h}:00` }))}
        />
      );
    }
  }
  const tab = (v: View, label: string) => (
    <button type="button" class={view === v ? "on" : ""} aria-pressed={view === v} onClick={() => pick(v)}>
      {label}
    </button>
  );
  return (
    <section class="f-card f-usage rise" aria-label="App time">
      <h2 class="f-h2">
        App time <small>{u ? `${sum}${lvSum > 0 ? ` · Levels ${spanWords(lvSum)}` : ""}` : ""}</small>
      </h2>
      <div class="f-utabs" role="group" aria-label="Day, week or month">
        {tab("day", "Day")}
        {tab("week", "Week")}
        {tab("month", "Month")}
      </div>
      {body}
      <p class="f-utap">👆 ஒரு bar ஐ அழுத்து: வந்த நேரம், போன நேரம், Levels இல் எவ்வளவு நேரம்</p>
    </section>
  );
}
