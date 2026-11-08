// The race's small pieces the first screens need (8 Nov 2026: the race tab itself is a later part, raceTab.tsx, out of
// the first load's budget): the kept race, how long the week has left, who cheered him, the gifts he won. The race tab
// (7 Nov 2026, his voice note): raceTab.tsx; its rules convex/lib/race.ts.

import { useEffect, useState } from "preact/hooks";
import type { FamilyBoard, FamilyMe } from "../../convex/family";
import { keep, query } from "./net";
import { BRAND, problemWords } from "./ui";

export type Board = FamilyBoard;

const WEEK_MS = 7 * 24 * 60 * 60_000;

/** "4d 6h" until Monday 00:00 (Sri Lanka). */
export function endsIn(since: number, now: number): string {
  const left = Math.max(0, since + WEEK_MS - now);
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h` : `${Math.max(1, Math.ceil(left / 60_000))} min`;
}

/**
 * The leagues' names, the first to the top: a copy of convex/lib/race.ts LEAGUES (the rules stay out of the first
 * load; tests/league.test.ts compares them).
 */
export const LEAGUE_NAMES = ["🥉 வெண்கலம்", "🥈 வெள்ளி", "🥇 தங்கம்", "💎 வைரம்", "🏆 சாம்பியன்"];

/** The race kept for this child (a copy kept before 7 Nov 2026 had another shape: none). */
export function keptBoard(): Board | null {
  const k = keep<Board>("board");
  return k && Array.isArray(k.rows) && typeof k.you === "string" ? k : null;
}

/** The race, kept for this child: the screen shows the last one at once, then the new one (`err`: none came). */
export function useBoard(): { b: Board | null; err: string | null } {
  const [b, setB] = useState<Board | null>(keptBoard);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    query("family:board")
      .then((x) => {
        keep("board", x);
        setB(x as Board);
      })
      .catch((e) => setErr(problemWords(e)));
  }, []);
  return { b, err };
}

/** "Nila S, Raj K and 3 others" (the newest three, then how many more). */
export function cheerWords(from: string[], n: number): string {
  const more = n - from.length;
  if (more <= 0) return from.length > 1 ? `${from.slice(0, -1).join(", ")} and ${from[from.length - 1]}` : (from[0] ?? "");
  return `${from.join(", ")} and ${more} ${more === 1 ? "other" : "others"}`;
}

/** Who cheered him this week (👏, 7 Nov 2026): on Home and Me, nothing when nobody did. */
export function Cheered(props: { c: FamilyMe["cheers"] | undefined }) {
  const c = props.c;
  if (!c || c.n <= 0) return null;
  return (
    <section class="f-card f-clapped rise" aria-label="Cheers this week">
      <span class="f-clap-h" aria-hidden="true">
        👏
      </span>
      <p>
        <b>{cheerWords(c.from, c.n)}</b>
        <small>இந்த வாரம் உன்னை உற்சாகப்படுத்தினார்கள்!</small>
      </p>
    </section>
  );
}

/** "2 Nov": a week's Monday (Sri Lanka). */
function weekWords(wk: number): string {
  const d = new Date(wk + 330 * 60_000);
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
}

/** What won it, in his words (8 Nov 2026: a league's winner, the month's most improved, a gift by hand with its reason). */
export function giftWhy(x: { kind: FamilyMe["gifts"][number]["kind"]; g: number | null; wk: number; l?: number; why?: string }): string {
  if (x.kind === "own") return x.why ? `🎁 ${x.why}` : `🎁 ${BRAND} வின் பரிசு`;
  if (x.kind === "mi") {
    const d = new Date(x.wk + 330 * 60_000);
    return `📈 ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} மாதம் மிக அதிகம் முன்னேறியவர்`;
  }
  const lg = LEAGUE_NAMES[(x.l ?? 1) - 1] ?? LEAGUE_NAMES[0];
  const win =
    x.kind === "lg"
      ? `${lg} லீக் வெற்றியாளர்`
      : x.kind === "a"
        ? `🏆 ${BRAND} champion`
        : x.kind === "g"
          ? `👑 Grade ${x.g ?? ""} champion`
          : `🥇 Grade ${x.g ?? ""} won the cup`;
  return `${win} · week of ${weekWords(x.wk)}`;
}

/** A gift from the centre he won (7 Nov 2026): on Home and Me until a teacher gives it to him. */
export function GiftCards(props: { gifts: FamilyMe["gifts"] | undefined }) {
  const list = props.gifts ?? [];
  if (!list.length) return null;
  return (
    <>
      {list.map((x) => (
        <section key={x.id} class="f-card f-giftc rise" aria-label="A gift for you">
          <span class="f-giftc-b" aria-hidden="true">
            🎁
          </span>
          <div class="f-giftc-w">
            <small class="f-giftc-k">{x.kind === "own" ? "உனக்கு ஒரு பரிசு!" : "நீ வென்றாய்!"}</small>
            <b>{x.what}</b>
            <small>{giftWhy(x)}</small>
            <p>இதை உன் ஆசிரியரிடம் காட்டு: உனக்குத் தருவார்.</p>
          </div>
        </section>
      ))}
    </>
  );
}

