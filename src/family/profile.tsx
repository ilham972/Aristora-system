// Me's profile (4 Nov 2026, his voice note: "a proper profile page for the students ... as simple as possible"):
// - his 12 weeks, home and class on one map: a day darkens with each Level he finished (at home or in class), a blue
//   dot = he came to class; tap a day = what he did, hour by hour;
// - his class: days and hours this month and last, the days he usually comes, his last class (never waiting time);
// - his report, like a school report in a child's words: each Stage's ring (his marks), its Levels, and its questions
//   as Right, Learned (lost marks a teacher then explained or taught) and To learn (still waiting): never "wrong";
// - the month's report on WhatsApp for his parents (his pick); his name (asked: the teachers say OK); his birthday.

import { useEffect, useState } from "preact/hooks";
import type { FamilyMe, FamilyProfile } from "../../convex/family";
import type { DayItem } from "../../convex/lib/family";
import type { QCounts, StageLine } from "../../convex/lib/profile";
import { DAY_EN, DAY_S, MONTH, partsOf, span, Timeline } from "./home";
import { pctOf, useProfile } from "./later";
import { mutation, query } from "./net";
import { buzz, sound } from "./sound";
import { Avatar, BRAND, Dashes, firstName, Gem, Icon, problemWords, Sheet, titleSize, toast, Waiting } from "./ui";

const DAY = 86_400_000;
const WEEKS = 12;
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** A day number (Sri Lanka) → "2026-11-03", its weekday (Monday = 0). */
const isoOf = (d: number) => new Date(d * DAY).toISOString().slice(0, 10);
const wdOf = (d: number) => (new Date(d * DAY).getUTCDay() + 6) % 7;
/** A moment → "4 Nov" (Sri Lanka). */
const dateWords = (t: number) => {
  const d = new Date(t + 330 * 60_000);
  return `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
};
const monthName = (m: string, full = false) => (full ? MONTH_FULL : MONTH)[Number(m.slice(5)) - 1];
// ---- The map of 12 weeks ----

export function HeatMap(props: { p: FamilyProfile; onDay: (day: string) => void }) {
  const { p } = props;
  const [sel, setSel] = useState(p.today);
  const by = new Map(p.days.map((x) => [x.d, x]));
  const first = p.today - wdOf(p.today) - (WEEKS - 1) * 7;
  const since = p.since ?? p.today;
  const active = p.days.filter((x) => x.home + x.cls > 0).length;
  const cls = p.days.filter((x) => x.in).length;
  const cells = [];
  const months: { w: number; m: string }[] = [];
  for (let w = 0; w < WEEKS; w++) {
    const days = Array.from({ length: 7 }, (_, i) => first + w * 7 + i);
    // A month's name over the week its 1st is in; the first week names its month only if the next 1st is far.
    const firstOfMonth = days.find((d) => isoOf(d).endsWith("-01"));
    if (firstOfMonth !== undefined) {
      if (months.length && w - months[months.length - 1].w < 3) months.pop();
      months.push({ w, m: isoOf(firstOfMonth).slice(0, 7) });
    } else if (w === 0) months.push({ w, m: isoOf(days[0]).slice(0, 7) });
    for (let i = 0; i < 7; i++) {
      const d = days[i];
      const x = by.get(d);
      const n = x ? x.home + x.cls : 0;
      const style = { gridColumn: w + 2, gridRow: i + 2 };
      if (d > p.today || d < since) {
        cells.push(<span key={d} class={`f-hc ${d > p.today ? "later" : "pre"}`} style={style} />);
        continue;
      }
      const pt = partsOf(isoOf(d));
      cells.push(
        <button
          type="button"
          key={d}
          class={`f-hc h${Math.min(n, 4)}${x?.in ? " in" : ""}${d === p.today ? " today" : ""}${d === sel ? " sel" : ""}`}
          style={style}
          aria-label={`${DAY_EN[pt.wd]} ${pt.date} ${pt.month}: ${n} Levels${x?.in ? ", in class" : ""}`}
          aria-pressed={d === sel}
          onClick={() => {
            buzz();
            sound("tap");
            setSel(d);
          }}
        >
          {x?.in && <i />}
        </button>,
      );
    }
  }
  const x = by.get(sel);
  const n = x ? x.home + x.cls : 0;
  const sp = partsOf(isoOf(sel));
  return (
    <section class="f-card f-heatbox rise" aria-label="Your 12 weeks">
      <h2 class="f-h2 f-heat-h">
        <Icon name="cal" size={19} /> 12 weeks
      </h2>
      <p class="f-heat-sum">
        {active} {active === 1 ? "day" : "days"} with a Level · {cls} in class
      </p>
      <div class="f-heat">
        {months.map((m) => (
          <span key={m.m} class="f-heat-mo" style={{ gridColumn: `${m.w + 2} / span 3`, gridRow: 1 }}>
            {monthName(m.m)}
          </span>
        ))}
        {DAY_S.map((d, i) => (
          <span key={i} class="f-heat-d" style={{ gridColumn: 1, gridRow: i + 2 }}>
            {i % 2 === 0 ? d : ""}
          </span>
        ))}
        {cells}
      </div>
      <p class="f-heat-key" aria-hidden="true">
        <span>Less</span>
        <i class="f-hc h0" />
        <i class="f-hc h1" />
        <i class="f-hc h2" />
        <i class="f-hc h3" />
        <i class="f-hc h4" />
        <span>More</span>
        <i class="f-hc h0 in">
          <i />
        </i>
        <span>Class</span>
      </p>
      <div class="f-hday">
        <span class="f-hday-w">
          <b>{sel === p.today ? "Today" : `${DAY_EN[sp.wd]} ${sp.date} ${sp.month}`}</b>
          <small>
            {n ? `${n} Level${n > 1 ? "s" : ""}` : "No Level"}
            {x?.home ? ` · ⌂ ${x.home} at home` : ""}
            {x?.in ? " · in class" : ""}
          </small>
        </span>
        {x?.xp ? (
          <span class="f-hday-xp">
            <Gem size={14} /> {x.xp}
          </span>
        ) : null}
        <button type="button" class="f-hday-go" onClick={() => props.onDay(isoOf(sel))}>
          See <Icon name="next" size={16} />
        </button>
      </div>
    </section>
  );
}

/** One day of his, hour by hour (the map's day): the same timeline as Home's. */
export function DaySheet(props: { day: string; onClose: () => void }) {
  const [items, setItems] = useState<DayItem[] | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    query("family:day", { day: props.day })
      .then((r) => setItems((r as { items: DayItem[] }).items))
      .catch((e) => setErr(problemWords(e)));
  }, []);
  const pt = partsOf(props.day);
  return (
    <Sheet title={`${DAY_EN[pt.wd]} ${pt.date} ${pt.month}`} onClose={props.onClose}>
      <div class="f-daysheet">
        <Timeline items={items} err={err} />
      </div>
    </Sheet>
  );
}

// ---- His class: days and hours ----

export function ClassCard(props: { p: FamilyProfile }) {
  const { months, usual } = props.p;
  const last = props.p.last ? partsOf(props.p.last) : null;
  return (
    <section class="f-card f-cls rise" aria-label="Class">
      <h2 class="f-h2">
        <Icon name="in" size={19} /> Class
      </h2>
      <div class="f-cls-m">
        {months.slice(0, 2).map((m, i) => (
          <div key={m.m} class={i === 0 ? "now" : ""}>
            <small>{i === 0 ? "This month" : monthName(m.m, true)}</small>
            <b>
              {m.days}
              <i> {m.days === 1 ? "day" : "days"}</i>
            </b>
            <span>{m.min ? span(m.min) : "—"}</span>
          </div>
        ))}
      </div>
      <div class="f-cls-row f-dayrow">
        <small>Your days</small>
        <span class="f-cls-days">
          {DAY_S.map((d, i) => (
            <i key={i} class={usual.includes(i) ? "on" : ""}>
              {d}
            </i>
          ))}
        </span>
      </div>
      {last && (
        <div class="f-cls-row">
          <small>Last class</small>
          <b>
            {DAY_EN[last.wd]} {last.date} {last.month}
          </b>
        </div>
      )}
    </section>
  );
}

// ---- His report ----

/** His marks in a Stage as a ring: violet, gold when every mark is his. */
function Ring(props: { pct: number | null; size?: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, props.pct ?? 0));
  const n = props.size ?? 52;
  return (
    <span class={`f-sring${v >= 100 ? " full" : ""}`} style={{ width: `${n}px`, height: `${n}px` }} aria-hidden="true">
      <svg viewBox="0 0 52 52" width={n} height={n}>
        <circle cx="26" cy="26" r={r} class="bg" />
        {v > 0 && <circle cx="26" cy="26" r={r} class="fg" style={{ strokeDasharray: `${(c * v) / 100} ${c}` }} />}
      </svg>
      <b>{props.pct === null ? "—" : `${props.pct}%`}</b>
    </span>
  );
}

const sumQ = (xs: QCounts[]): QCounts =>
  xs.reduce((a, x) => ({ right: a.right + x.right, learned: a.learned + x.learned, toLearn: a.toLearn + x.toLearn }), { right: 0, learned: 0, toLearn: 0 });

/** Right, Learned, To learn: three counts, and what the last two mean (in his words). */
function QChips(props: { q: QCounts }) {
  return (
    <>
      <div class="f-qc">
        <span class="right">
          <b>{props.q.right}</b>
          <small>✓ Right</small>
        </span>
        <span class="learned">
          <b>{props.q.learned}</b>
          <small>Learned</small>
        </span>
        <span class="tolearn">
          <b>{props.q.toLearn}</b>
          <small>To learn</small>
        </span>
      </div>
      <p class="f-qc-say">Learned: ஆசிரியர் விளக்கிய கேள்விகள். To learn: ஆசிரியர் இனி விளக்குவார்.</p>
    </>
  );
}

/** The month's report as a WhatsApp message (his parents read it; the numbers are the class's own). */
export function waText(me: FamilyMe, p: FamilyProfile, mi: number): string {
  const m = p.months[mi] ?? p.months[0];
  const month = `${monthName(m.m, true)} ${m.m.slice(0, 4)}`;
  const out = [
    `*${BRAND}* · ${me.name}${me.grade ? ` · Grade ${me.grade}` : ""}`,
    `${firstName(me.name)} இன் ${month} அறிக்கை`,
    "",
    `Class: ${m.days} ${m.days === 1 ? "day" : "days"}${m.min ? ` · ${span(m.min)}` : ""}`,
    `Levels: ${m.levels}${m.home ? ` (⌂ ${m.home} at home)` : ""}`,
    `XP: ${m.xp}`,
    `Questions: ✓ ${m.right} right · ${m.learned} learned with a teacher · ${m.toLearn} to learn`,
  ];
  const st = p.stages.filter((s) => s.done > 0 || s.now);
  if (st.length) {
    out.push("", "Stages:");
    for (const s of st) {
      const pct = pctOf(s);
      out.push(`• Stage ${s.no} ${s.ta}: ${pct !== null ? `${pct}% · ` : ""}${s.done}/${s.levels} Levels${s.allDone ? " ✓" : ""}`);
    }
  }
  out.push("", "app.aristora.org");
  return out.join("\n");
}

function WaButton(props: { me: FamilyMe; p: FamilyProfile; mi: number }) {
  return (
    <a
      class="f-btn go big f-wa"
      href={`https://wa.me/?text=${encodeURIComponent(waText(props.me, props.p, props.mi))}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => sound("send")}
    >
      <Icon name="share" size={20} /> Send on WhatsApp
    </a>
  );
}

/** His report on Me: the questions, his Stage now, the whole report, WhatsApp. */
export function ReportCard(props: { me: FamilyMe; p: FamilyProfile; onOpen: () => void }) {
  const st = props.p.stages;
  const now = st.find((s) => s.now) ?? st[st.length - 1];
  return (
    <section class="f-card f-rep rise" aria-label="Report">
      <h2 class="f-h2">
        <Icon name="chart" size={19} /> Report
        <button type="button" class="f-h2-go" onClick={props.onOpen}>
          See all <Icon name="next" size={15} />
        </button>
      </h2>
      <QChips q={sumQ(st)} />
      {now && (
        <button type="button" class="f-srow" onClick={props.onOpen}>
          <Ring pct={pctOf(now)} />
          <span class="f-srow-w">
            <small>
              Stage {now.no}
              {now.now ? " · now" : ""}
            </small>
            <b>{now.ta}</b>
            <span class="f-srow-d">
              <Dashes done={now.done} of={now.levels} />
              <small>
                {now.done}/{now.levels}
              </small>
            </span>
          </span>
          <Icon name="next" size={18} />
        </button>
      )}
      <WaButton me={props.me} p={props.p} mi={0} />
    </section>
  );
}

function StageCard(props: { s: StageLine; onCert: () => void }) {
  const s = props.s;
  const dates = [s.given !== null ? `Given ${dateWords(s.given)}` : "", s.start !== null ? `Started ${dateWords(s.start)}` : "", s.end !== null ? `Finished ${dateWords(s.end)}` : ""].filter(Boolean);
  return (
    <article class={`f-card f-sc rise${s.allDone ? " done" : ""}`}>
      <div class="f-sc-top">
        <Ring pct={pctOf(s)} size={60} />
        <div class="f-sc-w">
          <small>
            Stage {s.no}
            {s.now ? " · now" : s.allDone ? " · done ✓" : ""}
          </small>
          <b>{s.ta}</b>
          <span>{s.en}</span>
        </div>
      </div>
      <div class="f-sc-lv">
        <Dashes done={s.done} of={s.levels} />
        <small>
          {s.done} / {s.levels} Levels{s.home ? ` · ⌂ ${s.home} at home` : ""}
        </small>
      </div>
      <p class="f-sc-q">
        <span class="right">✓ {s.right}</span>
        <span class="learned">Learned {s.learned}</span>
        <span class="tolearn">To learn {s.toLearn}</span>
      </p>
      {dates.length > 0 && <p class="f-sc-dates">{dates.join(" · ")}</p>}
      {s.allDone && (
        <button type="button" class="f-btn gold f-sc-cert" onClick={props.onCert}>
          <Icon name="award" size={19} /> Certificate
        </button>
      )}
    </article>
  );
}

/** The whole report (Me → Report): a month's numbers (this month and the two before), the questions, every Stage. */
export function ReportScreen(props: { me: FamilyMe; pic: string | null; onBack: () => void; onCert: (s: StageLine) => void }) {
  const { me } = props;
  const p = useProfile();
  const [mi, setMi] = useState(0);
  const m = p?.months[mi];
  return (
    <div class="f-report">
      <header class="f-hero">
        <div class="f-toprow">
          <button type="button" class="f-round on-brand" aria-label="Back" onClick={props.onBack}>
            <Icon name="back" size={20} />
          </button>
          <span class="f-sp" />
        </div>
        <div class="f-hero-in">
          <div class="f-hero-w">
            <p class="f-kicker">Report{me.grade ? ` · Grade ${me.grade}` : ""}</p>
            <h1 class={`f-title${titleSize(me.name)}`}>{me.name}</h1>
            {me.index ? <p class="f-hsub">#{me.index}</p> : null}
          </div>
          <Avatar name={me.name} pic={props.pic} size="l" />
        </div>
        {p && (
          <div class="f-months" role="group" aria-label="Month">
            {p.months.map((x, i) => (
              <button
                type="button"
                key={x.m}
                class={i === mi ? "on" : ""}
                aria-pressed={i === mi}
                onClick={() => {
                  sound("tap");
                  setMi(i);
                }}
              >
                {i === 0 ? "This month" : monthName(x.m, true)}
              </button>
            ))}
          </div>
        )}
      </header>
      {!p || !m ? (
        <Waiting />
      ) : (
        <>
          <section class="f-card f-mnum rise" aria-label={monthName(m.m, true)}>
            <div>
              <b>{m.days}</b>
              <small>Class days</small>
            </div>
            <div>
              <b>{m.min ? span(m.min) : "0"}</b>
              <small>In class</small>
            </div>
            <div>
              <b>{m.levels}</b>
              <small>Levels{m.home ? ` · ⌂ ${m.home}` : ""}</small>
            </div>
            <div>
              <b>{m.xp}</b>
              <small>XP</small>
            </div>
          </section>
          <section class="f-card rise">
            <h2 class="f-h2">
              Questions <small>{monthName(m.m, true)}</small>
            </h2>
            <QChips q={m} />
          </section>
          <h2 class="f-h2 out f-rep-h">Stages</h2>
          {p.stages.length === 0 ? (
            <p class="f-none">இன்னும் எந்த Stage உம் இல்லை. உன் முதல் Level ஐச் செய்!</p>
          ) : (
            p.stages.map((s) => <StageCard key={s.unitId} s={s} onCert={() => props.onCert(s)} />)
          )}
          <div class="f-rep-foot">
            <WaButton me={me} p={p} mi={mi} />
          </div>
        </>
      )}
    </div>
  );
}

// ---- His name and his birthday ----

/** Ask for a new name: it changes everywhere only after the teachers' OK (Settings → Students → Waiting for your OK). */
export function NameSheet(props: { me: FamilyMe; onClose: () => void; onDone: () => void }) {
  const ask = props.me.nameAsk;
  const [v, setV] = useState(ask && !ask.no ? ask.name : props.me.name);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      toast(done);
      props.onDone();
    } catch (e) {
      setErr(problemWords(e));
    } finally {
      setBusy(false);
    }
  };
  const same = v.trim().replace(/\s+/g, " ").toLowerCase() === props.me.name.toLowerCase();
  return (
    <Sheet title="Your name" sub="உன் ஆசிரியர் OK சொன்ன பின்தான் மாறும்: வகுப்பும் Race உம் இந்தப் பெயரைப் பார்க்கும்." onClose={props.onClose}>
      {ask && (
        <div class={`f-ask${ask.no ? " no" : ""}`}>
          <p>
            <b>{ask.name}</b>
            <small>{ask.no ? "உன் ஆசிரியர் இதை ஏற்கவில்லை." : "உன் ஆசிரியரின் OK க்காகக் காத்திருக்கிறது."}</small>
          </p>
          <button type="button" class="f-link" disabled={busy} onClick={() => void run(() => mutation("family:forget", { kind: "name" }), ask.no ? "சரி." : "கேட்டது திரும்பப் பெறப்பட்டது.")}>
            {ask.no ? "OK" : "Cancel"}
          </button>
        </div>
      )}
      <label class="f-field">
        <span>First name and initial</span>
        <input
          value={v}
          maxLength={30}
          autoComplete="off"
          autoCapitalize="words"
          placeholder="Bilal R"
          onInput={(e) => setV((e.currentTarget as HTMLInputElement).value)}
        />
      </label>
      {err && <p class="f-err">{err}</p>}
      <button
        type="button"
        class="f-btn go big"
        disabled={busy || !v.trim() || same}
        onClick={() => void run(() => mutation("family:askName", { name: v }), "அனுப்பப்பட்டது! உன் ஆசிரியர் OK சொன்னதும் மாறும்.")}
      >
        Ask for this name
      </button>
    </Sheet>
  );
}

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** His birthday, day and month (no year), once: a change goes through a teacher (no party every day). */
export function BdaySheet(props: { onClose: () => void; onDone: () => void }) {
  const [mo, setMo] = useState(0);
  const [d, setD] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const max = mo ? MONTH_DAYS[mo - 1] : 31;
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const bday = `${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      await mutation("family:setBday", { bday });
      sound("unlock");
      // Today? The party is on Home now.
      toast(new Date(Date.now() + 330 * 60_000).toISOString().slice(5, 10) === bday ? "இன்றுதானா! Home இல் உன் party!" : "சேமிக்கப்பட்டது! அன்று owl ஒரு party வைக்கும்.");
      props.onDone();
    } catch (e) {
      setErr(problemWords(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="Your birthday" sub="நாளும் மாதமும் மட்டும். ஒரு முறைதான்: பிறகு மாற்ற உன் ஆசிரியரிடம் கேள்." onClose={props.onClose}>
      <div class="f-bday">
        <label class="f-field">
          <span>Day</span>
          <select value={d} aria-label="Day" onChange={(e) => setD(Number((e.currentTarget as HTMLSelectElement).value))}>
            <option value={0}>—</option>
            {Array.from({ length: max }, (_, i) => (
              <option key={i} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label class="f-field">
          <span>Month</span>
          <select
            value={mo}
            aria-label="Month"
            onChange={(e) => {
              const m = Number((e.currentTarget as HTMLSelectElement).value);
              setMo(m);
              if (m && d > MONTH_DAYS[m - 1]) setD(0);
            }}
          >
            <option value={0}>—</option>
            {MONTH_FULL.map((x, i) => (
              <option key={x} value={i + 1}>
                {x}
              </option>
            ))}
          </select>
        </label>
      </div>
      {err && <p class="f-err">{err}</p>}
      <button type="button" class="f-btn go big" disabled={busy || !d || !mo} onClick={() => void save()}>
        Save
      </button>
    </Sheet>
  );
}
