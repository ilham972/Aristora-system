// One student's sheet (31 Oct 2026, his ask: "the individual progress sheet I share on WhatsApp to the parents").
// The model from progress.report (convex/progress.ts), the same for the screen and the image, so what the parent sees
// is what the owner saw. The image: 1080 × 1350 (the poster's shape), Tamil first, drawn on the phone (no AI, no
// server), shared through the phone's share sheet. Rank is off unless he switches it on (his choice).

import type { FunctionReturnType } from "convex/server";
import type { api } from "../convex/_generated/api";
import { DAY_MS, slDay, slWeekStart } from "../convex/lib/day";
import { pace } from "../convex/lib/progress";
import { termOf } from "../convex/lib/syllabus";
import { C, H, loadImage, pctColor, posterDate, rr, text, W, width, type G } from "./poster";
import { stageName, type Stage } from "./store";

export type SR = NonNullable<FunctionReturnType<typeof api.progress.report>>;
export type SUnit = SR["units"][number];

export type UnitLine = {
  unit: SUnit;
  kind: "m" | "f" | "none";
  done: number;
  of: number;
  /** Workbook: marks % of the corrected levels. */
  pct: number | null;
  finished: boolean;
  current: boolean;
  /** Workbook: each level's marks % once corrected (null = not yet), the levels waiting, the level he is on. */
  marks: (number | null)[];
  waiting: number[];
  level: number | null;
};

export type Model = {
  name: string;
  grade: number | null;
  stage: Stage | null;
  term: number;
  today: string;
  now: UnitLine | null;
  att: {
    days28: number;
    hours28: number;
    /** Minutes a visit, on average (last 4 weeks). */
    avgMin: number | null;
    /** Days since he last came (0 = today), null = never. */
    lastDays: number | null;
    /** The last 4 weeks, Monday to Sunday: came, and days still to come. */
    grid: { day: string; came: boolean; future: boolean }[];
  };
  termUnits: UnitLine[];
  termDone: { levels: number; of: number; finished: number; started: number; pct: number | null };
  week: { levels: number; prev: number; pct: number | null; prevPct: number | null; days: number; prevDays: number };
  help: { explained: number; taught: number; evalVisits: number; lessons: number };
  waiting: { levels: number; evaluation: number; theory: number };
  best: UnitLine | null;
  weakest: UnitLine | null;
  pace: number | null;
};

function lineOf(r: SR, u: SUnit): UnitLine {
  const rows = r.rows.filter((x) => x.unitId === u._id);
  const m = rows.find((x) => x.stage === "master");
  const f = rows.find((x) => x.stage === "fighter");
  const current = r.student.unitId === u._id;
  const base = { unit: u, current, marks: [] as (number | null)[], waiting: [] as number[], level: null as number | null };
  if (m && m.m) {
    return { ...base, kind: "m", done: m.m.done, of: m.m.levels, pct: m.m.pct, finished: m.m.finished, marks: m.m.marks, waiting: m.m.waiting, level: m.m.current };
  }
  if (f && f.f) return { ...base, kind: "f", done: f.f.done, of: f.f.total, pct: null, finished: f.f.finished };
  if (u.master) return { ...base, kind: "m", done: 0, of: u.master.levels, pct: null, finished: false, marks: Array(u.master.levels).fill(null), level: 1 };
  if (u.fighter) return { ...base, kind: "f", done: 0, of: u.fighter.solo, pct: null, finished: false };
  return { ...base, kind: "none", done: 0, of: 0, pct: null, finished: false };
}

export function buildModel(r: SR, now: number): Model {
  const s = r.student;
  const today = slDay(now);
  const term = s.term ?? termOf(now);
  const grade = s.grade;
  const termUnits = r.units
    .filter((u) => u.grade === grade && u.term === term)
    .sort((a, b) => a.order - b.order)
    .map((u) => lineOf(r, u));
  const nowUnit = s.unitId ? r.units.find((u) => u._id === s.unitId) : undefined;
  const nowLine = nowUnit ? lineOf(r, nowUnit) : null;

  // Attendance: the last four weeks, Monday to Sunday.
  const first = slWeekStart(now) - 21 * DAY_MS;
  const days = new Set(r.visits.map((v) => v.day));
  const grid = Array.from({ length: 28 }, (_, i) => {
    const day = slDay(first + i * DAY_MS + 6 * 60 * 60_000);
    return { day, came: days.has(day), future: day > today };
  });
  const from28 = slDay(now - 27 * DAY_MS);
  const recent = r.visits.filter((v) => v.day >= from28);
  const minutes = recent.map((v) => Math.max(0, (v.outAt ?? Math.min(now, v.inAt + 3 * 60 * 60_000)) - v.inAt) / 60_000);
  const lastIn = r.visits.reduce<number | null>((a, v) => (a === null || v.inAt > a ? v.inAt : a), s.lastInAt);
  const lastDays = lastIn === null ? null : Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${slDay(lastIn)}T00:00:00Z`)) / DAY_MS);

  // This week and last week: levels done (handed in or corrected), marks of the levels corrected, days he came.
  const wk = slWeekStart(now);
  const prevWk = wk - 7 * DAY_MS;
  const week = { levels: 0, prev: 0, got: 0, max: 0, pgot: 0, pmax: 0 };
  for (const row of r.rows) {
    for (const l of row.levels ?? []) {
      const at = l.done ?? l.fixed;
      if (at && at >= wk) week.levels++;
      else if (at && at >= prevWk) week.prev++;
      if (l.fixed && l.got !== null) {
        if (l.fixed >= wk) {
          week.got += l.got;
          week.max += l.max;
        } else if (l.fixed >= prevWk) {
          week.pgot += l.got;
          week.pmax += l.max;
        }
      }
    }
  }
  const weekDays = (from: number, to: number) => new Set(r.visits.filter((v) => v.inAt >= from && v.inAt < to).map((v) => v.day)).size;

  // Teachers' help in the last four weeks.
  const since = now - 28 * DAY_MS;
  const inWindow = (ts: number[]) => ts.filter((t) => t >= since).length;
  const help = {
    explained: r.rows.reduce((a, x) => a + inWindow(x.explained), 0),
    taught: r.rows.reduce((a, x) => a + inWindow(x.taught), 0),
    evalVisits: r.calls.filter((c) => c.kind === "evaluation" && (c.end ?? 0) >= since).length,
    lessons: r.calls.filter((c) => c.kind === "theory" && (c.end ?? 0) >= since).length,
  };
  const waiting = r.rows.reduce(
    (a, x) => ({ levels: a.levels + x.waiting.levels, evaluation: a.evaluation + x.waiting.evaluation, theory: a.theory + x.waiting.theory }),
    { levels: 0, evaluation: 0, theory: 0 },
  );

  const workbooks = termUnits.filter((x) => x.kind === "m");
  const corrected = (x: UnitLine) => x.marks.filter((p) => p !== null).length;
  const rated = workbooks.filter((x) => x.pct !== null && corrected(x) >= 2);
  const best = rated.length >= 2 ? rated.reduce((a, x) => ((x.pct ?? 0) > (a.pct ?? 0) ? x : a)) : null;
  const weakest = rated.length >= 2 ? rated.reduce((a, x) => ((x.pct ?? 100) < (a.pct ?? 100) ? x : a)) : null;
  const termRows = r.rows.filter((x) => x.stage === "master" && termUnits.some((t) => t.unit._id === x.unitId) && x.m);
  const got = termRows.reduce((a, x) => a + (x.m?.got ?? 0), 0);
  const max = termRows.reduce((a, x) => a + (x.m?.max ?? 0), 0);
  const cur = r.rows.find((x) => x.current);

  return {
    name: s.name,
    grade,
    stage: (s.stage as Stage | null) ?? null,
    term,
    today,
    now: nowLine,
    att: {
      days28: new Set(recent.map((v) => v.day)).size,
      hours28: Math.round((minutes.reduce((a, b) => a + b, 0) / 60) * 10) / 10,
      avgMin: minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : null,
      lastDays,
      grid,
    },
    termUnits,
    termDone: {
      levels: workbooks.reduce((a, x) => a + x.done, 0),
      of: workbooks.reduce((a, x) => a + x.of, 0),
      finished: termUnits.filter((x) => x.finished).length,
      started: termUnits.filter((x) => x.done > 0).length,
      pct: max > 0 ? Math.round((got / max) * 100) : null,
    },
    week: {
      levels: week.levels,
      prev: week.prev,
      pct: week.max ? Math.round((week.got / week.max) * 100) : null,
      prevPct: week.pmax ? Math.round((week.pgot / week.pmax) * 100) : null,
      days: weekDays(wk, wk + 7 * DAY_MS),
      prevDays: weekDays(prevWk, wk),
    },
    help,
    waiting,
    best: best && weakest && best !== weakest ? best : null,
    weakest: best && weakest && best !== weakest && (weakest.pct ?? 100) < 70 ? weakest : null,
    pace: cur?.m ? pace(cur.m.done, cur.m.days) : cur?.f ? pace(cur.f.done, cur.f.days) : null,
  };
}

/** "today", "yesterday", "3 days ago" in English; Tamil below. */
export function lastWords(d: number | null): { en: string; ta: string } {
  if (d === null) return { en: "not yet", ta: "இன்னும் இல்லை" };
  if (d <= 0) return { en: "today", ta: "இன்று" };
  if (d === 1) return { en: "yesterday", ta: "நேற்று" };
  return { en: `${d} days ago`, ta: `${d} நாட்களுக்கு முன்` };
}

/** The image's layout (px): the header, the gap between cards, where the footer starts. */
const HEAD = 250;
const GAP = 12;
const FOOT_TOP = H - 70;

/** Monday first, as Tamil calendars shorten them. */
const WEEK_TA = ["தி", "செ", "பு", "வி", "வெ", "ச", "ஞா"];

export type ImageOpts = { marks: boolean; rank: boolean; note: string };
export type RankLine = { rank: number; of: number; unitNo: number };

/** "3rd". */
export function nth(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** Long note lines, broken into words that fit (the teacher's note on the image). */
function wrap(g: G, s: string, font: string, maxW: number, maxLines: number): string[] {
  const words = s.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (width(g, next, font) <= maxW || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}

/** The parents' image: one page, Tamil first. */
export async function drawReport(m: Model, opts: ImageOpts, rank: RankLine | null): Promise<HTMLCanvasElement> {
  const logo = await loadImage("/icon-512.png").catch(() => null);
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);

  // Header: owl, ARISTORA, the report's name, then his name big.
  g.fillStyle = C.navy;
  g.fillRect(0, 0, W, HEAD);
  if (logo) g.drawImage(logo, 48, 34, 100, 100);
  text(g, "ARISTORA", 168, 86, "800 50px", "#ffffff");
  text(g, "மாணவர் முன்னேற்ற அறிக்கை", 168, 126, "700 27px", C.soft);
  text(g, "Student progress report", W - 48, 86, "600 24px", "#9fb0e8", "right");
  text(g, posterDate(m.today), W - 48, 126, "500 24px", C.soft, "right");
  text(g, m.name, 48, 206, "800 54px", "#ffffff", "left", W - 430);
  const who = [m.grade ? `தரம் ${m.grade} · Grade ${m.grade}` : null, m.stage ? stageName(m.stage) : null].filter(Boolean).join(" · ");
  text(g, who, W - 48, 204, "700 29px", C.soft, "right", 390);

  let y = HEAD + 16;
  const card = (h: number) => {
    g.fillStyle = C.card;
    rr(g, 32, y, W - 64, h, 22);
    g.fill();
    const top = y;
    y += h + GAP;
    return top;
  };
  const title = (ta: string, en: string, top: number) => {
    text(g, ta, 60, top + 44, "800 29px", C.ink);
    text(g, en, 60 + width(g, ta, "800 29px") + 14, top + 44, "600 22px", C.ink3);
  };

  // Attendance: days in the last 4 weeks, the 4 × 7 grid, the last visit.
  {
    const top = card(180);
    title("வருகை", "Attendance", top);
    text(g, String(m.att.days28), 60, top + 124, "800 70px", C.ink);
    const nx = 60 + width(g, String(m.att.days28), "800 70px") + 14;
    text(g, "நாட்கள் · days", nx, top + 98, "700 26px", C.ink2);
    text(g, "கடந்த 4 வாரங்களில் · in 4 weeks", nx, top + 128, "600 21px", C.ink3);
    const last = lastWords(m.att.lastDays);
    text(g, `கடைசி வருகை: ${last.ta} · Last came: ${last.en}`, 60, top + 164, "600 22px", C.ink2, "left", 530);
    const gx = 620;
    const cell = 50;
    WEEK_TA.forEach((d, i) => text(g, d, gx + i * cell + 17, top + 32, "700 16px", C.ink3, "center"));
    m.att.grid.forEach((d, i) => {
      const cx = gx + (i % 7) * cell + 17;
      const cy = top + 56 + Math.floor(i / 7) * 32;
      g.beginPath();
      g.arc(cx, cy, 11.5, 0, Math.PI * 2);
      g.fillStyle = d.came ? C.green : d.future ? C.bg : C.grey;
      g.fill();
    });
  }

  // Now: his unit and its level bar.
  if (m.now) {
    const top = card(172);
    const u = m.now.unit;
    title("இப்போது", "Now", top);
    text(g, `அலகு ${Number(u.code.slice(1))} · ${u.ta}`, 60, top + 86, "700 28px", C.ink, "left", W - 300);
    text(g, `Unit ${Number(u.code.slice(1))} · ${u.en}`, 60, top + 116, "600 22px", C.ink3, "left", W - 300);
    if (m.now.kind !== "none") {
      text(g, `${m.now.done} / ${m.now.of}`, W - 60, top + 84, "800 40px", C.ink, "right");
      text(g, m.now.kind === "m" ? "Levels" : "வினாக்கள் · Q", W - 60, top + 112, "600 20px", C.ink3, "right");
    }
    levelBar(g, m.now, 60, top + 130, W - 120, 26, opts.marks);
  }

  // The term: one square per unit, filled as far as he got; ✓ finished; ring = his unit now.
  {
    const top = card(196);
    title(`தவணை ${m.term}`, `Term ${m.term}`, top);
    const t = m.termDone;
    const right = `${t.finished} / ${m.termUnits.length}`;
    text(g, right, W - 60, top + 46, "800 34px", C.ink, "right");
    text(g, "முடிந்த அலகுகள் · units finished", W - 60 - width(g, right, "800 34px") - 12, top + 44, "600 20px", C.ink3, "right");
    const n = Math.max(1, m.termUnits.length);
    const size = Math.min(74, Math.floor((W - 120 - (n - 1) * 10) / n));
    m.termUnits.forEach((x, i) => {
      const bx = 60 + i * (size + 10);
      const by = top + 66;
      g.fillStyle = C.grey;
      rr(g, bx, by, size, size, 12);
      g.fill();
      const frac = x.of ? x.done / x.of : 0;
      if (frac > 0) {
        g.save();
        rr(g, bx, by, size, size, 12);
        g.clip();
        g.fillStyle = x.kind === "f" ? C.blue : opts.marks && x.pct !== null ? pctColor(x.pct) : C.green;
        g.fillRect(bx, by + size * (1 - frac), size, size * frac);
        g.restore();
      }
      if (x.current) {
        g.strokeStyle = C.navy;
        g.lineWidth = 4;
        rr(g, bx + 2, by + 2, size - 4, size - 4, 10);
        g.stroke();
      }
      text(g, x.finished ? "✓" : String(Number(x.unit.code.slice(1))), bx + size / 2, by + size / 2 + 10, "800 27px", frac > 0.55 ? "#ffffff" : C.ink, "center");
    });
    const words = [
      t.of ? `${t.levels} / ${t.of} Levels` : null,
      opts.marks && t.pct !== null ? `புள்ளிகள் · Marks ${t.pct}%` : null,
    ]
      .filter(Boolean)
      .join("   ·   ");
    text(g, words, 60, top + 176, "700 23px", C.ink2, "left", W - 120);
  }

  // This week against last week, and the teachers' help.
  {
    const top = card(138);
    title("இந்த வாரம்", "This week", top);
    const cols: [string, string, string][] = [[String(m.week.levels), "Levels", `கடந்த வாரம் · last week ${m.week.prev}`]];
    if (opts.marks && m.week.pct !== null) cols.push([`${m.week.pct}%`, "புள்ளிகள் · Marks", m.week.prevPct !== null ? `last week ${m.week.prevPct}%` : ""]);
    cols.push([String(m.help.explained + m.help.taught), "ஆசிரியர் விளக்கியவை", "teachers explained · 4 weeks"]);
    const cw = (W - 120) / cols.length;
    cols.forEach(([v, a, b], k) => {
      const cx = 60 + cw * k;
      text(g, v, cx, top + 100, "800 44px", C.ink, "left");
      const vx = cx + width(g, v, "800 44px") + 10;
      text(g, a, vx, top + 84, "700 19px", C.ink2, "left", cw - (vx - cx) - 8);
      text(g, b, vx, top + 108, "600 17px", C.ink3, "left", cw - (vx - cx) - 8);
    });
  }

  if (opts.rank && rank) {
    const top = card(64);
    text(g, `அலகு ${rank.unitNo}: ${rank.of} பேரில் ${rank.rank}ஆம் இடம்`, 60, top + 42, "800 27px", C.ink, "left", 560);
    text(g, `${nth(rank.rank)} of ${rank.of} on Unit ${rank.unitNo}`, W - 60, top + 42, "700 23px", C.ink3, "right");
  }

  // The teacher's note: as many lines as fit above the footer (four at most).
  const note = opts.note.trim();
  if (note) {
    const fits = Math.floor((FOOT_TOP - 8 - y - 62) / 34);
    const lines = wrap(g, note, "600 25px", W - 120, Math.max(1, Math.min(4, fits)));
    const top = card(62 + lines.length * 34);
    text(g, "ஆசிரியர் குறிப்பு · Teacher's note", 60, top + 40, "800 23px", C.ink2);
    lines.forEach((l, i) => text(g, l, 60, top + 76 + i * 34, "600 25px", C.ink, "left", W - 120));
  }

  g.fillStyle = C.line;
  g.fillRect(32, FOOT_TOP, W - 64, 2);
  text(g, `ARISTORA · ${m.name}${m.grade ? ` · தரம் ${m.grade}` : ""} · ${posterDate(m.today)}`, 40, H - 28, "600 21px", C.ink3, "left", W - 80);
  return cv;
}

/** A workbook's levels as blocks (marks colour, waiting amber, his level ringed); a theory book as a fill. */
function levelBar(g: G, x: UnitLine, bx: number, by: number, bw: number, bh: number, marks: boolean) {
  if (x.kind === "m" && x.marks.length) {
    const n = x.marks.length;
    const gap = n > 16 ? 3 : 6;
    const lw = (bw - gap * (n - 1)) / n;
    const waiting = new Set(x.waiting);
    for (let l = 0; l < n; l++) {
      const lx = bx + l * (lw + gap);
      const p = x.marks[l];
      g.fillStyle = p !== null && p !== undefined ? (marks ? pctColor(p) : C.green) : waiting.has(l + 1) ? C.amber : C.grey;
      rr(g, lx, by, lw, bh, 6);
      g.fill();
      if (x.level === l + 1) {
        g.strokeStyle = C.navy;
        g.lineWidth = 3;
        rr(g, lx + 1.5, by + 1.5, lw - 3, bh - 3, 5);
        g.stroke();
      }
    }
    return;
  }
  g.fillStyle = C.grey;
  rr(g, bx, by, bw, bh, 8);
  g.fill();
  const frac = x.of ? x.done / x.of : 0;
  if (frac > 0) {
    g.fillStyle = x.kind === "f" ? C.blue : C.green;
    rr(g, bx, by, Math.max(16, bw * frac), bh, 8);
    g.fill();
  }
}

/** The image as a PNG file named for him and the day. */
export async function reportFile(cv: HTMLCanvasElement, m: Model): Promise<File> {
  return await new Promise<File>((ok, no) =>
    cv.toBlob((blob) => {
      if (!blob) return no(new Error("The phone couldn't make the image."));
      ok(new File([blob], `ARISTORA-${m.name.replace(/[^A-Za-z0-9]+/g, "-")}-${m.today}.png`, { type: "image/png" }));
    }, "image/png"),
  );
}
