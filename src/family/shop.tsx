// The Shop on his phone (10 Nov 2026, his voice note: "students always have questions like, I have diamonds and I don't
// know what to do with the diamonds"; his answers). His coins (every Monday last week's XP pays them, 5 XP = 1 coin; his
// XP stays his rank and never goes down), the owner's things on two shelves (owl things, treats), a thing bought = his
// gold card until a teacher taps Given (Cancel until then), his last coin lines. The owl says once what XP and coins
// are. One of the parts right after the first screen (parts.ts: never import it straight); its style is in profile.css.
// The server: convex/coins.ts.

import { useEffect, useState } from "preact/hooks";
import type { CoinLine, FamilyShop, ShopItem } from "../../convex/coins";
import type { FamilyMe } from "../../convex/family";
import { BoughtCard } from "./board";
import { keep, mutation, query } from "./net";
import { buzz, sound } from "./sound";
import { Coin, Icon, OwlBadge, OwlSays, problemWords, Sheet, showSheet, toast, Waiting } from "./ui";

/** A thing's emoji (the first one in its name), for a thing without a photo; 🎁 when it has none. */
export function emojiOf(n: string): string {
  const m = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/u.exec(n);
  return m ? m[0] : "🎁";
}

/** The shelves, in order: English (game words). */
const SHELVES: { id: ShopItem["sh"]; name: string }[] = [
  { id: "owl", name: "🦉 Owl things" },
  { id: "treat", name: "🍦 Treats" },
];

/** A coin line in his words: Monday's pay, his grade's weekly coins, what he bought, coins given back. */
function lineWords(l: CoinLine): { what: string; when: string } {
  const d = new Date(l.at + 330 * 60_000);
  const when = `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
  if (l.k === "pay") return { what: `PAYDAY${l.w ? ` · ${l.w}` : ""}`, when };
  if (l.k === "back") return { what: `Coins back · ${l.w ?? ""}`, when };
  // His grade's weekly #1 (11 Nov 2026): "👑 Grade 8 · #1 · 2–8 Nov".
  if (l.k === "win") return { what: `👑 ${l.w ?? ""}`, when };
  return { what: l.w ?? "", when };
}

/** How far his coins go towards a price: a thin gold bar (saving towards it). */
function Saving(props: { n: number; of: number }) {
  const pct = Math.max(4, Math.min(100, Math.round((props.n / props.of) * 100)));
  return (
    <span class="f-shbar" aria-hidden="true">
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}

function Pic(props: { x: ShopItem; big?: boolean }) {
  return (
    <span class={`f-shpic${props.big ? " big" : ""}`}>
      {props.x.ph ? <img src={props.x.ph} alt="" loading="lazy" decoding="async" /> : <span class="f-shemo">{emojiOf(props.x.n)}</span>}
    </span>
  );
}

/** One thing on a shelf: its photo, name, price; sold out, a few left, or how far his coins go. */
function Item(props: { x: ShopItem; n: number; onPick: () => void }) {
  const x = props.x;
  const out = x.st !== null && x.st <= 0;
  const can = !out && props.n >= x.p;
  return (
    <button type="button" class={`f-shi${out ? " out" : can ? " can" : ""}`} aria-label={`${x.n}: ${x.p} coins${out ? ", sold out" : ""}`} onClick={props.onPick}>
      <Pic x={x} />
      {out ? <span class="f-shtag">SOLD OUT</span> : x.st !== null && x.st <= 5 ? <span class="f-shtag few">{x.st} left</span> : null}
      <b class="f-shi-n">{x.n}</b>
      <span class="f-shi-p">
        <Coin size={16} />
        {x.p.toLocaleString("en")}
      </span>
      {!out && !can && <Saving n={props.n} of={x.p} />}
    </button>
  );
}

/** A thing opened: big, its price, what his coins will be; Buy (gold), or how many coins he still needs. */
function BuySheet(props: { x: ShopItem; n: number; onClose: () => void; onBought: () => void }) {
  const [busy, setBusy] = useState(false);
  const x = props.x;
  const out = x.st !== null && x.st <= 0;
  const short = x.p - props.n;
  const buy = () => {
    setBusy(true);
    mutation("coins:buy", { id: x.id, p: x.p })
      .then(() => {
        buzz();
        sound("perfect");
        toast("🎉 வாங்கினாய்! இதை உன் ஆசிரியரிடம் காட்டு: உனக்குத் தருவார்.");
        props.onBought();
      })
      .catch((e) => {
        toast(problemWords(e), true);
        setBusy(false);
      });
  };
  return (
    <Sheet title={x.n} onClose={props.onClose} class="f-buy">
      <Pic x={x} big />
      <p class="f-buy-p">
        <Coin size={28} />
        {x.p.toLocaleString("en")}
      </p>
      {out ? (
        <p class="f-buy-w">இது தீர்ந்துவிட்டது. விரைவில் மீண்டும் வரும்!</p>
      ) : short > 0 ? (
        <>
          <p class="f-buy-w">
            இன்னும் <b>{short.toLocaleString("en")}</b> coins வேண்டும். ஒவ்வொரு Level உம் உன் அடுத்த திங்கள் சம்பளத்தைக் கூட்டும்!
          </p>
          <Saving n={props.n} of={x.p} />
        </>
      ) : (
        <p class="f-buy-w">
          வாங்கிய பின்: <b>{props.n.toLocaleString("en")}</b> → <b>{(props.n - x.p).toLocaleString("en")}</b> coins. உன் XP குறையாது.
        </p>
      )}
      <button type="button" class="f-btn gold big" disabled={busy || out || short > 0} onClick={buy}>
        <Coin size={22} /> {out ? "Sold out" : short > 0 ? `${short.toLocaleString("en")} more` : `Buy · ${x.p.toLocaleString("en")}`}
      </button>
    </Sheet>
  );
}

export function ShopScreen(props: { me: FamilyMe | null; onBack: () => void; onChanged: () => void }) {
  const [s, setS] = useState<FamilyShop | null>(() => keep<FamilyShop>("shop"));
  const [err, setErr] = useState<string | null>(null);
  // The owl says once (per child) what XP and coins are: his students' own question.
  const [hi, setHi] = useState(() => !keep<boolean>("shopHi"));
  const load = () =>
    query("coins:shop").then(
      (x) => {
        keep("shop", x);
        setS(x as FamilyShop);
        setErr(null);
      },
      (e) => setErr(problemWords(e)),
    );
  useEffect(() => {
    void load();
  }, []);
  const n = s?.n ?? props.me?.coins?.n ?? 0;
  const changed = () => {
    void load();
    props.onChanged();
  };
  const pick = (x: ShopItem) => {
    buzz();
    sound("pop");
    showSheet((close) => (
      <BuySheet
        x={x}
        n={n}
        onClose={close}
        onBought={() => {
          close();
          changed();
        }}
      />
    ));
  };
  return (
    <div class="f-shop">
      <header class="f-hero">
        <div class="f-toprow">
          <button type="button" class="f-round on-brand" aria-label="Back" onClick={props.onBack}>
            <Icon name="back" size={20} />
          </button>
          <span class="f-sp" />
        </div>
        <div class="f-hero-in">
          <div class="f-hero-w">
            <p class="f-kicker">SHOP</p>
            <h1 class="f-title f-shop-n">
              <Coin size={34} />
              {n.toLocaleString("en")}
              <small>coins</small>
            </h1>
            <p class="f-hsub">ஒவ்வொரு திங்களும் கடந்த வாரத்தின் XP உன் coins ஆகும்: 5 XP = 1 coin.</p>
          </div>
          <OwlBadge mood={n > 0 ? "love" : "wave"} />
        </div>
      </header>
      {hi && (
        <section class="f-card f-shop-hi rise">
          <OwlSays mood="happy">
            💎 XP = உன் rank: அது ஒருபோதும் குறையாது. 🪙 Coins = உன் பணம்: வாங்கும்போது coins மட்டுமே குறையும்.
          </OwlSays>
          <button
            type="button"
            class="f-btn go"
            onClick={() => {
              keep("shopHi", true);
              setHi(false);
            }}
          >
            OK!
          </button>
        </section>
      )}
      {!s ? (
        err ? (
          <p class="f-lead f-shop-err">{err}</p>
        ) : (
          <Waiting />
        )
      ) : (
        <>
          {s.orders.length > 0 && (
            <section class="f-shop-orders" aria-label="Waiting for you">
              <h2 class="f-h2">Waiting for you</h2>
              {s.orders.map((o) => (
                <BoughtCard key={o.id} id={o.id} what={o.what} c={o.c} onDone={() => void load()} />
              ))}
            </section>
          )}
          {s.items.length === 0 ? (
            <section class="f-card f-shop-none rise">
              <OwlSays mood="wave">கடை விரைவில் திறக்கும்! அதுவரை உன் coins சேர்த்து வை.</OwlSays>
            </section>
          ) : (
            SHELVES.map((sh) => {
              const list = s.items.filter((x) => x.sh === sh.id);
              return list.length ? (
                <section key={sh.id} class="f-card f-shelf rise" aria-label={sh.name}>
                  <h2 class="f-h2">{sh.name}</h2>
                  <div class="f-shgrid">
                    {list.map((x) => (
                      <Item key={x.id} x={x} n={n} onPick={() => pick(x)} />
                    ))}
                  </div>
                </section>
              ) : null;
            })
          )}
          {s.lines.length > 0 && (
            <section class="f-card f-shlines rise" aria-label="Your coins">
              <h2 class="f-h2">Your coins</h2>
              <ul>
                {s.lines.map((l, i) => {
                  const w = lineWords(l);
                  return (
                    <li key={i}>
                      <span>
                        <b>{w.what}</b>
                        <small>{w.when}</small>
                      </span>
                      <b class={l.n > 0 ? "up" : "down"}>
                        {l.n > 0 ? "+" : "−"}
                        {Math.abs(l.n).toLocaleString("en")}
                      </b>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
