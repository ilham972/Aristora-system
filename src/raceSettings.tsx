// Settings → Race (7 Nov 2026, his voice note): the family app's race has every student, joined or not, with XP from
// class and home; since 11 Nov 2026 his grade this week, his grade all time and the GOAT (all grades, all time); any
// student's profile one tap away, cheers. Here:
// - the owner: the marks switch (his answer for the profiles was "Everything"; this is the way back if a parent
//   complains: classmates stop seeing a student's marks, the rest stays), the weekly coins (11 Nov 2026, his answer:
//   each grade's #1 wins coins for the Shop instead of a gift, never two weeks running) and the centre's prizes (his ask:
//   "gift cards ... ice-cream or chicken fries": the month's most improved on the 1st, the grade cup until the houses);
// - the owner and the Manager: the gifts to give (the student's phone shows his card until Given) and given lately, and
//   since 8 Nov 2026 a gift by hand, any time (his ask: "how we can give the gift when we want to give the gift?");
// - the owner, Reports and the Manager: last week's champions (each grade's coin winner) and their poster for the
//   WhatsApp group and the wall.

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { Champions, GiftItem, Prizes } from "../convex/race";
import { mutate, subscribe } from "./backend";
import { championsFile, drawChampions, weekSpan } from "./champions";
import type { View } from "./derive";
import { useQuery } from "./live";
import { saveFiles, shareFiles } from "./poster";
import { act, currentRole, may, toast } from "./store";
import { Sheet } from "./ui";

/** Gifts waiting to be given (the gear's count): the owner and the Manager. */
export function useGiftsWaiting(allowed: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!allowed) return;
    return subscribe(
      api.race.giftCount,
      {},
      (x) => setN(x),
      () => setN(0),
    );
  }, [allowed]);
  return allowed ? n : 0;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** What won a gift, and when: the win's words and its week (a month for the most improved, the reason for one by hand). */
function winOf(x: GiftItem): string {
  // Bought in the Shop (10 Nov 2026): his coins.
  if (x.kind === "shop") return `🛍️ bought in the Shop · ${(x.c ?? 0).toLocaleString("en")} coins`;
  if (x.kind === "own") return `🎁 ${x.why ? x.why : "given by hand"} · ${weekSpan(x.wk)}`;
  if (x.kind === "mi") return `📈 Most improved · ${MONTHS[new Date(x.wk + 330 * 60_000).getUTCMonth()]}`;
  const win = x.kind === "lg" ? "🏆 League winner" : x.kind === "g" ? "👑 Grade champion" : x.kind === "a" ? "🏆 ARISTORA champion" : "🥇 Grade cup";
  return `${win} · ${weekSpan(x.wk)}`;
}

function MarksSwitch() {
  const s = useQuery<{ marks: boolean; seen: boolean; prizes: Prizes }>(api.race.settings, {});
  const [busy, setBusy] = useState(false);
  if (!s) return null;
  return (
    <section class="phq-sum">
      <b>Profiles</b>
      <label class="phq-req">
        <input
          type="checkbox"
          checked={s.marks}
          disabled={busy}
          onChange={() => {
            setBusy(true);
            void act(() => mutate(api.race.setMarks, { on: !s.marks })).finally(() => setBusy(false));
          }}
        />
        <span>Classmates see a student's marks on his profile (% right, questions, each Stage's marks)</span>
      </label>
      <small class="muted">
        {s.marks
          ? "On: everything, as you chose. Turn it off if a parent asks: his own phone still shows him everything."
          : "Off: classmates see his Levels, XP, days and trophies, not his marks. His own phone still shows him everything."}
      </small>
      <label class="phq-req">
        <input
          type="checkbox"
          checked={s.seen}
          disabled={busy}
          onChange={() => {
            setBusy(true);
            void act(() => mutate(api.race.setSeen, { on: !s.seen })).finally(() => setBusy(false));
          }}
        />
        <span>Classmates see who is online, last seen and app time (the bars and the times he came and went)</span>
      </label>
      <small class="muted">
        {s.seen
          ? "On: the green dot, \"Seen 2 h ago\" and every profile's bars, as you chose. Turn it off if a parent complains."
          : "Off: no green dots, no last seen, no classmate's bars. His own phone still shows him his own app time."}
      </small>
    </section>
  );
}

function PrizeForm() {
  const s = useQuery<{ marks: boolean; seen: boolean; prizes: Prizes }>(api.race.settings, {});
  const [p, setP] = useState<{ wc: string; mi: string; cup: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (s && !p) setP({ ...s.prizes, wc: String(s.prizes.wc) });
  }, [s]);
  if (!s || !p) return null;
  const wc = /^\d{1,5}$/.test(p.wc.trim()) ? Number(p.wc.trim()) : null;
  const changed = wc !== s.prizes.wc || p.mi !== s.prizes.mi || p.cup !== s.prizes.cup;
  const field = (k: "mi" | "cup", label: string, hint: string) => (
    <label class="rc-prize">
      <span>
        {label}
        <small class="muted">{hint}</small>
      </span>
      <input value={p[k]} maxLength={40} placeholder="No gift" onInput={(e) => setP({ ...p, [k]: (e.target as HTMLInputElement).value })} />
    </label>
  );
  return (
    <section class="rc-box">
      <b>Weekly coins and gifts</b>
      <label class="rc-prize">
        <span>
          🪙 Each grade's weekly #1 (every Monday)
          <small class="muted">
            coins for the Shop, with Monday's pay. Last week's winner of a grade can't win it again the next week: the
            coins go to the next one. 0 = none.
          </small>
        </span>
        <input value={p.wc} inputMode="numeric" maxLength={5} placeholder="0" onInput={(e) => setP({ ...p, wc: (e.target as HTMLInputElement).value })} />
      </label>
      <small class="muted">Gifts: the app gives the winners a gift card on their phone (empty = no gift).</small>
      {field("mi", "📈 The month's most improved (the 1st)", "the 3 students whose XP grew the most against the month before")}
      {field("cup", "🥇 Grade cup (every Monday)", "every student who learned in the grade that won")}
      <button
        type="button"
        class="btn primary wide"
        disabled={busy || !changed || wc === null}
        onClick={() => {
          if (wc === null) return;
          setBusy(true);
          void act(() => mutate(api.race.setPrizes, { wc, mi: p.mi, cup: p.cup }))
            .then((r) => r && toast("Prizes saved."))
            .finally(() => setBusy(false));
        }}
      >
        {wc === null ? "Coins: a whole number" : "Save the prizes"}
      </button>
    </section>
  );
}

function GiftList() {
  const g = useQuery<{ open: GiftItem[]; given: GiftItem[] }>(api.race.gifts, {});
  const [busy, setBusy] = useState<string | null>(null);
  // A thing bought that the Shop couldn't get (10 Nov 2026): Coins back asks once more.
  const [sure, setSure] = useState<string | null>(null);
  if (!g) return null;
  /** His coins come back (coins.refund), the card goes. */
  const back = (x: GiftItem) => {
    if (sure !== x.id) return setSure(x.id);
    setBusy(x.id);
    void act(() => mutate(api.coins.refund, { id: x.id as never, by: currentRole() }))
      .then((r) => r && toast(`${x.n}: ${(x.c ?? 0).toLocaleString("en")} coins back.`))
      .finally(() => {
        setBusy(null);
        setSure(null);
      });
  };
  // What to buy for the Shop's cards waiting (10 Nov 2026): one line, by thing.
  const toBuy = new Map<string, number>();
  for (const x of g.open) if (x.kind === "shop") toBuy.set(x.what, (toBuy.get(x.what) ?? 0) + 1);
  const give = (x: GiftItem, given: boolean) => {
    setBusy(x.id);
    void act(() => mutate(api.race.give, { id: x.id as never, given }))
      .then((r) => {
        if (r && given) toast(`${x.n}: ${x.what} given.`, "info", () => void mutate(api.race.give, { id: x.id as never, given: false }));
      })
      .finally(() => setBusy(null));
  };
  return (
    <section class="rc-box">
      <b>Gifts to give{g.open.length ? ` · ${g.open.length}` : ""}</b>
      {toBuy.size > 0 && (
        <p class="sh-buy">
          <b>From the Shop:</b> {[...toBuy].map(([w, c]) => `${w} × ${c}`).join(" · ")}
        </p>
      )}
      {g.open.length === 0 ? (
        <small class="muted">Nothing waits. The winners get theirs when you set a prize below.</small>
      ) : (
        <ul class="rc-gifts">
          {g.open.map((x) => (
            <li key={x.id} class={x.kind === "shop" ? "rc-shop" : undefined}>
              <span>
                <b>
                  {x.n}
                  {x.g !== null ? <i class="rc-g">{x.g}</i> : null}
                </b>
                <small>
                  {x.what} · {winOf(x)}
                </small>
              </span>
              {x.kind === "shop" && (
                <button type="button" class={`btn ${sure === x.id ? "danger" : "ghost"}`} disabled={busy === x.id} onClick={() => back(x)}>
                  {sure === x.id ? "Sure?" : "Coins back"}
                </button>
              )}
              <button type="button" class="btn primary" disabled={busy === x.id} onClick={() => give(x, true)}>
                Given
              </button>
            </li>
          ))}
        </ul>
      )}
      {g.given.length > 0 && (
        <details class="rc-given">
          <summary>Given lately · {g.given.length}</summary>
          <ul class="rc-gifts">
            {g.given.map((x) => (
              <li key={x.id}>
                <span>
                  <b>{x.n}</b>
                  <small>
                    {x.what} · {x.by ?? ""}
                  </small>
                </span>
                <button type="button" class="btn ghost" disabled={busy === x.id} onClick={() => give(x, false)}>
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ChampionsCard() {
  const c = useQuery<Champions>(api.race.champions, {});
  const [busy, setBusy] = useState(false);
  if (!c) return null;
  const ones = (k: "g" | "a", g?: number) => c.top.filter((x) => x.k === k && x.place === 1 && (g === undefined || x.g === g));
  const all = ones("a");
  const cup = c.cup[0];
  const share = async (save: boolean) => {
    setBusy(true);
    try {
      const file = await championsFile(await drawChampions(c), c.wk);
      if (save) saveFiles([file]);
      else {
        const r = await shareFiles([file], `ARISTORA · Champions · ${weekSpan(c.wk)}`);
        if (r === "saved") toast("Saved the image.");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "The phone couldn't make the image.", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section class="rc-box">
      <b>Last week's champions · {weekSpan(c.wk)}</b>
      <ul class="rc-champs">
        <li>
          <span>🏆 ARISTORA</span>
          <b>{all.length ? `${all.map((x) => x.n).join(" · ")} · ${all[0].xp} XP` : "—"}</b>
        </li>
        {[6, 7, 8, 9, 10, 11].map((g) => {
          // A week with the coins: each grade's coin winner; a week from before: its champion.
          const coin = c.cw.find((x) => x.g === g);
          const w = coin ? [coin] : ones("g", g);
          return (
            <li key={g}>
              <span>👑 {g}</span>
              <b>
                {w.length ? `${w.map((x) => x.n).join(" · ")} · ${w[0].xp} XP` : "—"}
                {coin ? ` · +${coin.c} 🪙` : ""}
              </b>
            </li>
          );
        })}
        <li>
          <span>🥇 Cup</span>
          <b>{cup && cup.n > 0 ? `Grade ${cup.g} · ${cup.n}/${cup.of} learned` : "—"}</b>
        </li>
      </ul>
      {c.cw.some((x) => !ones("g", x.g).some((o) => o.id === x.id)) && (
        <small class="muted">A grade's #1 who won the coins the week before gave them to the next one.</small>
      )}
      {!c.kept && <small class="muted">Worked out now from the race; Monday 00:05 keeps it for good.</small>}
      <div class="rc-row">
        <button type="button" class="btn primary" disabled={busy} onClick={() => void share(false)}>
          Share poster
        </button>
        <button type="button" class="btn ghost" disabled={busy} onClick={() => void share(true)}>
          Save
        </button>
      </div>
    </section>
  );
}

/** The grades a gift by hand can go to (the class's real students). */
const GRADES = [6, 7, 8, 9, 10, 11];

/**
 * A gift by hand (8 Nov 2026, his ask: "how we can give the gift when we want to give the gift?"): students ticked from
 * any grade, the gift, why ("7 days in a row"), and whether the owl tells everyone in Us (the reason and the names,
 * never the gift). Each gets the gold card on his phone until Given.
 */
function GiveSheet(props: { views: View[]; onClose: () => void }) {
  const real = props.views.filter((v) => !v.s.demo && !v.s.test && typeof v.s.grade === "number");
  const [g, setG] = useState<number>(() => GRADES.find((x) => real.some((v) => v.s.grade === x)) ?? 8);
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [what, setWhat] = useState("");
  const [why, setWhy] = useState("");
  const [tell, setTell] = useState(true);
  const [busy, setBusy] = useState(false);
  const list = real.filter((v) => v.s.grade === g).sort((a, b) => a.s.name.localeCompare(b.s.name));
  const flip = (id: string) => {
    const next = new Set(ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setIds(next);
  };
  const ready = ids.size > 0 && what.trim().length > 0;
  return (
    <Sheet title="🎁 Give a gift" sub="Pick students from any grade, the gift and why. Their phones show the gold card until you tap Given." onClose={props.onClose} cls="rc-give">
      <div class="rc-grades" role="group" aria-label="Grade">
        {GRADES.map((x) => {
          const n = real.filter((v) => v.s.grade === x && ids.has(v.s._id)).length;
          return (
            <button key={x} type="button" class={`st-chip${x === g ? " on" : ""}`} aria-pressed={x === g} onClick={() => setG(x)}>
              {x}
              {n ? <i class="rc-n">{n}</i> : null}
            </button>
          );
        })}
      </div>
      {list.length === 0 ? (
        <p class="muted">No Grade {g} students.</p>
      ) : (
        <ul class="plain-list rc-pick">
          {list.map((v) => (
            <li key={v.s._id}>
              <label>
                <input type="checkbox" checked={ids.has(v.s._id)} onChange={() => flip(v.s._id)} />
                <span>{v.s.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <label class="rc-prize">
        <span>The gift</span>
        <input value={what} maxLength={40} placeholder="🍦 Ice cream" onInput={(e) => setWhat((e.target as HTMLInputElement).value)} />
      </label>
      <label class="rc-prize">
        <span>
          Why <small class="muted">(they see it on the card)</small>
        </span>
        <input value={why} maxLength={80} placeholder="7 days in a row" onInput={(e) => setWhy((e.target as HTMLInputElement).value)} />
      </label>
      <label class="phq-req">
        <input type="checkbox" checked={tell} onChange={() => setTell(!tell)} />
        <span>The owl tells everyone in Us (the names and why, never the gift)</span>
      </label>
      <button
        type="button"
        class="btn primary wide"
        disabled={busy || !ready}
        onClick={() => {
          setBusy(true);
          void act(() => mutate(api.race.giveNow, { sids: [...ids] as Id<"students">[], what, why, tell, by: currentRole() }))
            .then((n) => {
              if (n) {
                toast(`${what.trim()}: ${n} ${n === 1 ? "student" : "students"}. Their phones show it now.`);
                props.onClose();
              }
            })
            .finally(() => setBusy(false));
        }}
      >
        {ids.size ? `Give to ${ids.size} ${ids.size === 1 ? "student" : "students"}` : "Pick students"}
      </button>
    </Sheet>
  );
}

export function RaceSettings(props: { views: View[] }) {
  const owner = may("owner");
  const [giving, setGiving] = useState(false);
  return (
    <div class="settings-body rc">
      <section class="phq-sum">
        <b>The race in the family app</b>
        <small class="muted">
          Every student is in it, on the app or not: XP from class and from home. Three lists: his grade this week (starts
          again every Monday; last week's #1 wears a 👑), his grade all time (XP ever: never resets), and the GOAT (every
          grade, all time: the #1 wears the GOAT medal until someone passes him).
        </small>
      </section>
      {(owner || may("manager")) && (
        <button type="button" class="btn primary wide rc-givebtn" onClick={() => setGiving(true)}>
          🎁 Give a gift now
        </button>
      )}
      {giving && <GiveSheet views={props.views} onClose={() => setGiving(false)} />}
      {(owner || may("manager")) && <GiftList />}
      <ChampionsCard />
      {owner && <PrizeForm />}
      {owner && <MarksSwitch />}
    </div>
  );
}
