// Online, studying, last seen and study time on a profile (12 Nov 2026). His voice note asked for the green dot, "closed
// a few minutes ago", bars of the hours studied each day (day, week, month) and a bar pressed = the times they came and
// went. At 1:40 AM he took my recommendation ("if the student online show online, if studies show studying"): two
// states (Online = the app open; Studying = inside a Level, with its Stage), a classmate's last seen by day only, the
// bars = minutes inside Levels (study), the app time in a day's sheet; the come and go times only on his own phone (him
// and his parents). A classmate's bar still opens: that day's study and app time, no clock times. A classmate's card
// only while the owner's switch is on (Settings → Race). The arithmetic: convex/lib/appTime.ts.

import { useEffect, useState } from "preact/hooks";
import type { Seen, Usage, UsageStay } from "../../convex/online";
import { hourBars, seenDayWords, seenWords, spanWords, type DayBar } from "../../convex/lib/appTime";
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

/** On a face: the green dot (in the app), or the green pencil badge (studying: inside a Level). */
export function OnDot(props: { on: boolean; lv?: boolean }) {
  if (props.lv)
    return (
      <i class="f-on lv" role="img" aria-label="Studying">
        ✏️
      </i>
    );
  return props.on ? <i class="f-on" role="img" aria-label="Online" /> : null;
}

/** "Studying · Stage 4", "Online", "Seen 2 h ago" (his own phone) or "Seen yesterday" (a classmate: the day only). */
export function seenText(s: Seen | undefined, now = Date.now()): string | null {
  if (!s) return null;
  if (s.lv) return s.st ? `Studying · Stage ${s.st}` : "Studying";
  if (s.on) return "Online";
  const w = s.at !== null ? seenWords(s.at, false, now) : seenDayWords(s.d, now);
  return w ? `Seen ${w.toLowerCase() === "today" || w === "Yesterday" || w === "Just now" ? w.toLowerCase() : w}` : null;
}

/** Under a name: the state in words, with its dot or pencil. */
export function SeenLine(props: { seen?: Seen }) {
  const s = props.seen;
  const w = seenText(s);
  if (!w) return null;
  return (
    <span class={`f-seen${s?.on ? " on" : ""}${s?.lv ? " lv" : ""}`}>
      {s?.lv ? <i aria-hidden="true">✏️</i> : s?.on ? <i class="f-on in" aria-hidden="true" /> : null}
      {w}
    </span>
  );
}

/** Bars from minutes: the tallest fills the box. */
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

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;

/** The three numbers of a day: studied (inside Levels), in the app, and visits (his own) or nothing. */
function DayStats(props: { lv: number; ms: number; visits?: number }) {
  return (
    <div class={`f-ustats${props.visits === undefined ? " two" : ""}`}>
      <div class="lv">
        <b>{spanWords(props.lv)}</b>
        <small>Studied</small>
      </div>
      <div>
        <b>{spanWords(props.ms)}</b>
        <small>In the app</small>
      </div>
      {props.visits !== undefined && (
        <div>
          <b>{props.visits}</b>
          <small>{props.visits === 1 ? "Visit" : "Visits"}</small>
        </div>
      )}
    </div>
  );
}

/** His own day (a bar tapped on his phone): when he came and left, his study and app time, hour by hour. */
function OwnDaySheet(props: { day: number; onClose: () => void }) {
  const [stays, setStays] = useState<UsageStay[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    query("online:usageDay", { id: "me", day: props.day })
      .then((r) => setStays((r as { stays: UsageStay[] }).stays))
      .catch(() => setErr("இப்போது பார்க்க முடியவில்லை."));
  }, []);
  const ms = (stays ?? []).reduce((a, s) => a + s.ms, 0);
  const lv = (stays ?? []).reduce((a, s) => a + s.lv, 0);
  const hours = stays ? hourBars(stays, props.day, "lv") : [];
  const app = stays ? hourBars(stays, props.day) : [];
  const busy = app.map((m, h) => ({ m, h })).filter((x) => x.m > 0);
  const first = busy.length ? Math.min(busy[0].h, 18) : 6;
  const from = Math.max(0, first - 1);
  const shown = hours.slice(from, Math.min(24, Math.max(first + 11, (busy[busy.length - 1]?.h ?? 0) + 2)));
  return (
    <Sheet title={dayWords(props.day)} onClose={props.onClose}>
      <div class="f-usheet">
        {!stays ? (
          err ? <p class="f-none">{err}</p> : <Waiting />
        ) : (
          <>
            <DayStats lv={lv} ms={ms} visits={stays.length} />
            {stays.length === 0 ? (
              <p class="f-none">இந்த நாள் app திறக்கப்படவில்லை.</p>
            ) : (
              <>
                <Bars dense floor={10} onTap={() => {}} items={shown.map((m, i) => ({ key: from + i, min: m, label: (from + i) % 3 === 0 ? hourLabel(from + i) : "", tip: `${from + i}:00` }))} />
                <ol class="f-ustays">
                  {stays.map((s) => (
                    <li key={s.from} class={s.on ? "on" : ""}>
                      <span class="f-ustay-t">
                        <b>{slClock(s.from)}</b>
                        <i aria-hidden="true">→</i>
                        <b>{s.on ? "now" : slClock(s.to)}</b>
                      </span>
                      <span class="f-ustay-m">
                        {s.lv > 0 ? `Studied ${spanWords(s.lv)}` : "—"}
                        <small>App {spanWords(s.ms)}</small>
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

/** A classmate's day (a bar tapped): that day's study and app time; the times he came and went are his own. */
function MateDaySheet(props: { b: DayBar; onClose: () => void }) {
  return (
    <Sheet title={dayWords(props.b.d)} onClose={props.onClose}>
      <div class="f-usheet">
        <DayStats lv={props.b.lv} ms={props.b.ms} />
        <p class="f-utap">🔒 வந்த நேரம், போன நேரம் அவருக்கும் அவர் பெற்றோருக்கும் மட்டும்.</p>
      </div>
    </Sheet>
  );
}

/** The profile's card: study bars (minutes inside Levels) by week and month (and today hour by hour on his own), each bar a door to its day. */
export function UsageCard(props: { id: string }) {
  const [u, setU] = useState<Usage | null>(null);
  const [gone, setGone] = useState(false);
  const [viewKept, setView] = useState<View>(() => keep<View>("usageView") ?? "week");
  const [today, setToday] = useState<UsageStay[] | null>(null);
  const own = !!u?.own;
  const view: View = viewKept === "day" && u && !own ? "week" : viewKept;
  useEffect(() => {
    query("online:usage", { id: props.id })
      .then((x) => setU(x as Usage))
      .catch(() => setGone(true));
  }, [props.id]);
  useEffect(() => {
    if (view === "day" && u?.own && !today)
      query("online:usageDay", { id: "me", day: u.today })
        .then((r) => setToday((r as { stays: UsageStay[] }).stays))
        .catch(() => setToday([]));
  }, [view, u]);
  if (gone) return null;
  const open = (b: DayBar) => {
    buzz();
    sound("tap");
    showSheet((close) => (own ? <OwnDaySheet day={b.d} onClose={close} /> : <MateDaySheet b={b} onClose={close} />));
  };
  const pick = (v: View) => {
    if (v === view) return;
    buzz();
    sound("tap");
    setView(v);
    keep("usageView", v);
  };
  let body = <Waiting />;
  let lvSum = 0;
  let msSum = 0;
  if (u) {
    const t = u.today;
    const mon = t - ((new Date(t * DAY_MS).getUTCDay() + 6) % 7);
    const asItem = (b: DayBar, label: string) => ({ key: b.d, min: Math.round(b.lv / 60_000), label, hot: b.d === t, tip: dayWords(b.d) });
    const sum = (bars: DayBar[]) => {
      lvSum = bars.reduce((a, b) => a + b.lv, 0);
      msSum = bars.reduce((a, b) => a + b.ms, 0);
    };
    if (view === "month") {
      const bars = u.bars;
      sum(bars);
      body = <Bars dense floor={30} onTap={(i) => open(bars[i])} items={bars.map((b) => asItem(b, b.d === t || (t - b.d) % 7 === 0 ? String(dayParts(b.d).date) : ""))} />;
    } else if (view === "week") {
      const all = Array.from({ length: 7 }, (_, i) => u.bars.find((b) => b.d === mon + i) ?? { d: mon + i, ms: 0, lv: 0 });
      sum(all);
      body = <Bars floor={30} onTap={(i) => (all[i].d <= t ? open(all[i]) : undefined)} items={all.map((b) => asItem(b, DAY_EN[(b.d - mon) % 7][0]))} />;
    } else {
      const tb = u.bars[u.bars.length - 1];
      sum([tb]);
      const hours = today ? hourBars(today, t, "lv") : null;
      body = !hours ? <Waiting /> : <Bars dense floor={10} onTap={() => open(tb)} items={hours.map((m, h) => ({ key: h, min: m, label: h % 6 === 0 ? hourLabel(h) : "", tip: `${h}:00` }))} />;
    }
  }
  const tab = (v: View, label: string) => (
    <button type="button" class={view === v ? "on" : ""} aria-pressed={view === v} onClick={() => pick(v)}>
      {label}
    </button>
  );
  return (
    <section class="f-card f-usage rise" aria-label="Study time">
      <h2 class="f-h2">
        Study time <small>{u ? `${spanWords(lvSum)}${msSum > 0 ? ` · App ${spanWords(msSum)}` : ""}` : ""}</small>
      </h2>
      <div class="f-utabs" role="group" aria-label={own ? "Day, week or month" : "Week or month"}>
        {own && tab("day", "Day")}
        {tab("week", "Week")}
        {tab("month", "Month")}
      </div>
      {body}
      <p class="f-utap">
        {own ? "👆 ஒரு bar ஐ அழுத்து: வந்த நேரம், போன நேரம், படித்த நேரம்" : "👆 ஒரு bar ஐ அழுத்து: அந்த நாள் படித்த நேரம்"}
      </p>
    </section>
  );
}
