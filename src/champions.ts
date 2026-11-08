// Last week's champions as one image (7 Nov 2026, his pick: "Monday poster ... for the WhatsApp group and the hall
// wall"): 1080 × 1350 like the progress poster, drawn on the phone, shared through the phone's own share sheet or saved.
// ARISTORA's top 3 on a podium of cards, each league's winner (8 Nov 2026: the leagues, his answer; before them each
// grade's champion 👑), the grade cup; first names and initials only, as in class; never marks or a last place. Tamil
// first, English after.

import { LEAGUES } from "../convex/lib/race";
import type { Champions } from "../convex/race";
import { C, H, loadImage, rr, text, W, width } from "./poster";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86_400_000;
const PLACE = [C.gold, C.silver, C.bronze];

/** "2–8 Nov" for a week's Monday (Sri Lanka). */
export function weekSpan(wk: number): string {
  const a = new Date(wk + 330 * 60_000);
  const b = new Date(wk + 6 * DAY + 330 * 60_000);
  const m = (d: Date) => MONTHS[d.getUTCMonth()];
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${b.getUTCDate()} ${m(b)}` : `${a.getUTCDate()} ${m(a)} – ${b.getUTCDate()} ${m(b)}`;
}

/** The names at one place of one list ("Bilal M · Hana K" when they tie). */
function namesAt(c: Champions, k: "g" | "a", place: number, g?: number) {
  return c.top.filter((x) => x.k === k && x.place === place && (g === undefined || x.g === g));
}

export async function drawChampions(c: Champions): Promise<HTMLCanvasElement> {
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;
  const logo = await loadImage("/icon-512.png").catch(() => null);
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  // Header.
  g.fillStyle = C.navy;
  g.fillRect(0, 0, W, 230);
  if (logo) g.drawImage(logo, 56, 56, 116, 116);
  text(g, "ARISTORA", 200, 112, "800 62px", "#ffffff");
  text(g, "இந்த வார வெற்றியாளர்கள்", 200, 162, "700 34px", C.soft);
  text(g, `Champions · ${weekSpan(c.wk)}`, 200, 202, "600 28px", "#9fb0e8");
  let y = 274;
  // ARISTORA's top 3: three cards, the first in the middle and tallest.
  text(g, `🏆  ${"ARISTORA"} · முதல் மூவர்`, 56, y, "800 34px", C.ink);
  y += 26;
  const cardW = 312;
  const gap = 24;
  const x0 = (W - 3 * cardW - 2 * gap) / 2;
  const order = [2, 1, 3];
  order.forEach((place, i) => {
    const who = namesAt(c, "a", place);
    const h = place === 1 ? 290 : place === 2 ? 250 : 226;
    const x = x0 + i * (cardW + gap);
    const top = y + (290 - h);
    g.fillStyle = C.card;
    rr(g, x, top, cardW, h, 28);
    g.fill();
    // The place as a medal.
    g.fillStyle = PLACE[place - 1];
    g.beginPath();
    g.arc(x + cardW / 2, top + 62, 40, 0, Math.PI * 2);
    g.fill();
    text(g, String(place), x + cardW / 2, top + 78, "800 44px", place === 1 ? C.navy : "#ffffff", "center");
    if (!who.length) {
      text(g, "—", x + cardW / 2, top + 160, "700 34px", C.ink3, "center");
      return;
    }
    const first = who[0];
    text(g, who.map((w) => w.n).join(" · "), x + cardW / 2, top + 150, "800 36px", C.ink, "center", cardW - 32);
    text(g, first.g !== null ? `Grade ${first.g}` : "", x + cardW / 2, top + 192, "700 26px", C.ink2, "center");
    text(g, `${first.xp} XP`, x + cardW / 2, top + h - 30, "800 30px", C.blue, "center");
  });
  y += 290 + 54;
  // Each league's winner, the top league first (a week from before the leagues: each grade's champion).
  const rowH = 66;
  if (c.lw.length) {
    text(g, "🏆  ஒவ்வொரு லீக்கிலும் · League winners", 56, y, "800 34px", C.ink);
    y += 22;
    g.fillStyle = C.card;
    rr(g, 40, y, W - 80, LEAGUES.length * rowH + 20, 26);
    g.fill();
    y += 10;
    for (let l = LEAGUES.length; l >= 1; l--) {
      const who = c.lw.filter((x) => x.l === l);
      text(g, `${LEAGUES[l - 1].e} ${LEAGUES[l - 1].n}`, 64, y + 46, "800 30px", C.blue, "left", 300);
      if (who.length) {
        text(g, who.map((w) => (w.g !== null ? `${w.n} (${w.g})` : w.n)).join(" · "), 372, y + 46, "800 32px", C.ink, "left", 520);
        text(g, `${who[0].xp} XP`, W - 72, y + 46, "800 30px", C.blue, "right");
      } else text(g, "—", 372, y + 46, "700 30px", C.ink3);
      y += rowH;
    }
    y += 10 + 50;
  } else {
    text(g, "👑  ஒவ்வொரு தரத்திலும் · Each grade", 56, y, "800 34px", C.ink);
    y += 22;
    const grades = [6, 7, 8, 9, 10, 11];
    g.fillStyle = C.card;
    rr(g, 40, y, W - 80, grades.length * rowH + 20, 26);
    g.fill();
    y += 10;
    for (const gr of grades) {
      const who = namesAt(c, "g", 1, gr);
      g.fillStyle = "#e7ebff";
      rr(g, 64, y + 12, 64, 44, 12);
      g.fill();
      text(g, String(gr), 96, y + 46, "800 30px", C.blue, "center");
      if (who.length) {
        text(g, who.map((w) => w.n).join(" · "), 152, y + 46, "800 32px", C.ink, "left", 640);
        text(g, `${who[0].xp} XP`, W - 72, y + 46, "800 30px", C.blue, "right");
      } else text(g, "—", 152, y + 46, "700 30px", C.ink3);
      y += rowH;
    }
    y += 10 + 50;
  }
  // The grade cup: the grade with the best share of students who learned.
  const cup = c.cup.filter((x) => x.of > 0);
  const best = cup[0];
  text(g, "🥇  Grade cup", 56, y, "800 34px", C.ink);
  if (best && best.n > 0) {
    const pct = Math.round((best.n / best.of) * 100);
    const words = `Grade ${best.g} · ${best.n}/${best.of} கற்றார்கள் (${pct}%)`;
    text(g, words, W - 56, y, "800 30px", C.blue, "right", W - 120 - width(g, "🥇  Grade cup", "800 34px"));
  }
  // Footer.
  g.fillStyle = C.line;
  g.fillRect(34, H - 76, W - 68, 2);
  text(g, c.lup ? `⬆ ${c.lup} பேர் மேல் லீக்குக்கு · XP என்றும் உனக்கே` : "திங்கள்: புதிய வாரம் · XP என்றும் உனக்கே", 40, H - 30, "600 24px", C.ink2, "left", W - 360);
  text(g, "app.aristora.org", W - 40, H - 30, "700 24px", C.ink3, "right");
  return cv;
}

/** The image as a PNG file named for the week. */
export function championsFile(cv: HTMLCanvasElement, wk: number): Promise<File> {
  const d = new Date(wk + 330 * 60_000).toISOString().slice(0, 10);
  return new Promise((ok, no) =>
    cv.toBlob((blob) => (blob ? ok(new File([blob], `ARISTORA-champions-${d}.png`, { type: "image/png" })) : no(new Error("The phone couldn't make the image."))), "image/png"),
  );
}
