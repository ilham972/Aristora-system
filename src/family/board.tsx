// The race's small pieces the first screens need (8 Nov 2026: the race tab itself is a later part, raceTab.tsx, out of
// the first load's budget): the kept race, how long the week has left, who cheered him, the gifts he won. The race tab
// (7 Nov 2026, his voice note): raceTab.tsx; its rules convex/lib/race.ts.

import { useEffect, useState } from "preact/hooks";
import type { FamilyBoard, FamilyMe } from "../../convex/family";
import { keep, mutation, query } from "./net";
import { BRAND, Coin, problemWords, toast } from "./ui";

export type Board = FamilyBoard;

const WEEK_MS = 7 * 24 * 60 * 60_000;

/** "4d 6h" until Monday 00:00 (Sri Lanka). */
export function endsIn(since: number, now: number): string {
  const left = Math.max(0, since + WEEK_MS - now);
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h` : `${Math.max(1, Math.ceil(left / 60_000))} min`;
}

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

/** What won it, in his words (a league's winner 8–10 Nov 2026, the month's most improved, a gift by hand with its reason). */
export function giftWhy(x: { kind: FamilyMe["gifts"][number]["kind"]; g: number | null; wk: number; l?: number; why?: string }): string {
  if (x.kind === "own") return x.why ? `🎁 ${x.why}` : `🎁 ${BRAND} வின் பரிசு`;
  if (x.kind === "mi") {
    const d = new Date(x.wk + 330 * 60_000);
    return `📈 ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} மாதம் மிக அதிகம் முன்னேறியவர்`;
  }
  const win =
    x.kind === "lg"
      ? "🏆 லீக் வெற்றியாளர்"
      : x.kind === "a"
        ? `🏆 ${BRAND} champion`
        : x.kind === "g"
          ? `👑 Grade ${x.g ?? ""} champion`
          : `🥇 Grade ${x.g ?? ""} won the cup`;
  return `${win} · week of ${weekWords(x.wk)}`;
}

/** A gift from the centre he won (7 Nov 2026): on Home and Me until a teacher gives it to him. Since 10 Nov 2026 also
 * what he bought in the Shop (its coins; Cancel until it is given: two taps, the coins come back). */
export function GiftCards(props: { gifts: FamilyMe["gifts"] | undefined }) {
  const list = props.gifts ?? [];
  if (!list.length) return null;
  return (
    <>
      {list.map((x) =>
        x.kind === "shop" ? (
          <BoughtCard key={x.id} id={x.id} what={x.what} c={x.c ?? 0} />
        ) : (
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
        ),
      )}
    </>
  );
}

/**
 * A thing he bought in the Shop (10 Nov 2026): his gold card until a teacher taps Given. Cancel asks once more ("Coins
 * back?"), then his coins come back (coins.cancel) and the app reads his coins again (the "f-me" event, app.tsx).
 */
export function BoughtCard(props: { id: string; what: string; c: number; onDone?: () => void }) {
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancel = () => {
    if (!sure) return setSure(true);
    setBusy(true);
    mutation("coins:cancel", { id: props.id })
      .then(() => {
        toast(`🪙 ${props.c} coins திரும்ப வந்தன.`);
        props.onDone?.();
        window.dispatchEvent(new Event("f-me"));
      })
      .catch((e) => toast(problemWords(e), true))
      .finally(() => {
        setBusy(false);
        setSure(false);
      });
  };
  return (
    <section class="f-card f-giftc bought rise" aria-label={`You bought ${props.what}`}>
      <span class="f-giftc-b" aria-hidden="true">
        🛍️
      </span>
      <div class="f-giftc-w">
        <small class="f-giftc-k">நீ வாங்கியது</small>
        <b>{props.what}</b>
        <small class="f-giftc-c">
          <Coin size={15} /> {props.c.toLocaleString("en")}
        </small>
        <p>இதை உன் ஆசிரியரிடம் காட்டு: உனக்குத் தருவார்.</p>
        <button type="button" class={`f-linkbtn f-giftc-x${sure ? " sure" : ""}`} disabled={busy} onClick={cancel}>
          {sure ? "Coins back? Tap again" : "Cancel"}
        </button>
      </div>
    </section>
  );
}

/**
 * Pay day on Home (10 Nov 2026): the Monday his last week's XP paid coins, a gold card with them and the Shop, until he
 * opens the Shop or closes it (kept per child: `paySeen` = that Monday). Nothing in a week without a pay.
 */
export function PayCard(props: { coins: FamilyMe["coins"]; won?: FamilyMe["won"]; onShop: () => void }) {
  const c = props.coins;
  // His grade's weekly coins came with this pay (11 Nov 2026): the card says he won.
  const won = props.won && c && props.won.wk + WEEK_MS === c.wk ? props.won : null;
  const [seen, setSeen] = useState(() => keep<number>("paySeen"));
  if (!c || c.last <= 0 || Date.now() - c.wk >= WEEK_MS || seen === c.wk) return null;
  const close = (shop: boolean) => {
    keep("paySeen", c.wk);
    setSeen(c.wk);
    if (shop) props.onShop();
  };
  return (
    <section class={`f-card f-payc rise${won ? " won" : ""}`} aria-label={won ? "You won" : "Payday"}>
      <button type="button" class="f-payc-x" aria-label="Close" onClick={() => close(false)}>
        ✕
      </button>
      <span class="f-tag gold">{won ? `👑 Grade ${won.g} · #1` : "PAYDAY"}</span>
      <p class="f-payc-n">
        <Coin size={30} />+{c.last.toLocaleString("en")}
      </p>
      <p class="f-payc-w">
        {won
          ? `கடந்த வாரம் Grade ${won.g} இல் நீ முதலிடம்! +${won.c.toLocaleString("en")} coins பரிசு, மீதி உன் XP இன் coins.`
          : "கடந்த வாரத்தின் XP உன் coins ஆனது! உன் XP அப்படியே இருக்கும்."}
      </p>
      <button type="button" class="f-btn go f-payc-go" onClick={() => close(true)}>
        Shop
      </button>
    </section>
  );
}

