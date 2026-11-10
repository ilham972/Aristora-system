// Settings → Shop (10 Nov 2026, his voice note: "creating the marketplace for the students ... we are going to put what
// actually student needs"; his answers: coins, never XP; Monday pays last week's XP, 5 XP = 1 coin; all three shelves;
// no limit on a week's pay). The owner: what the month's coins cost (paid, spent, in students' hands), what to buy for
// the cards waiting (Settings → Race → Gifts to give hands them over), the things (photo, name, price in coins, how
// many, shelf, on the phones), and the escape hatch: the most coins a week (off). The server: convex/coins.ts.

import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { ShopAdmin, ShopAdminItem } from "../convex/coins";
import { mutate, upload } from "./backend";
import { useQuery } from "./live";
import { act, toast } from "./store";
import { Sheet } from "./ui";

const SHELVES: { id: ShopAdminItem["sh"]; name: string; hint: string }[] = [
  { id: "owl", name: "🦉 Owl things", hint: "stickers, pencils, rulers with the owl" },
  { id: "treat", name: "🍦 Treats", hint: "ice cream, chicken fries: the big goals" },
];

/** A photo made small on this phone (640 px on its long side, JPEG): light for students' phones and their data. */
async function smaller(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(img.naturalWidth * k));
    cv.height = Math.max(1, Math.round(img.naturalHeight * k));
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise((ok, no) => cv.toBlob((b) => (b ? ok(b) : no(new Error("The phone couldn't read that photo."))), "image/jpeg", 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Rs and coins are the same number (1 coin = Rs 1 of the Shop's price). */
const coins = (n: number) => `${n.toLocaleString("en")} coins`;

function Numbers(props: { s: ShopAdmin }) {
  const s = props.s;
  return (
    <section class="rc-box">
      <b>This month</b>
      <ul class="sh-nums">
        <li>
          <b>{s.month.paid.toLocaleString("en")}</b>
          <small>coins paid</small>
        </li>
        <li>
          <b>{(s.month.spent - s.month.back).toLocaleString("en")}</b>
          <small>spent</small>
        </li>
        <li>
          <b>{s.held.toLocaleString("en")}</b>
          <small>in students' hands</small>
        </li>
      </ul>
      <small class="muted">1 coin = Rs 1 of your price: what was spent is what the things cost you at most.</small>
      {s.toBuy.length > 0 ? (
        <p class="sh-buy">
          <b>To buy for the cards waiting:</b> {s.toBuy.map((x) => `${x.n} × ${x.c}`).join(" · ")}
        </p>
      ) : (
        <small class="muted">Nothing bought waits to be given.</small>
      )}
    </section>
  );
}

function Row(props: { x: ShopAdminItem; onOpen: () => void }) {
  const x = props.x;
  return (
    <li>
      <button type="button" class={`sh-row${x.on ? "" : " off"}`} onClick={props.onOpen}>
        <span class="sh-pic">{x.ph ? <img src={x.ph} alt="" loading="lazy" /> : <i>{x.n.match(/\p{Extended_Pictographic}/u)?.[0] ?? "🎁"}</i>}</span>
        <span class="sh-w">
          <b>{x.n}</b>
          <small>
            {coins(x.p)} · {x.st === null ? "no end" : x.st === 0 ? "sold out" : `${x.st} left`}
            {x.open ? ` · ${x.open} to give` : ""}
            {x.on ? "" : " · hidden"}
          </small>
        </span>
      </button>
    </li>
  );
}

/** A thing added or changed: photo, name, price in coins, how many (empty = no end), shelf, on the phones; Remove. */
function ItemSheet(props: { x: ShopAdminItem | null; onClose: () => void }) {
  const x = props.x;
  const [n, setN] = useState(x?.n ?? "");
  const [p, setP] = useState(x ? String(x.p) : "");
  const [st, setSt] = useState(x?.st === null || !x ? "" : String(x.st));
  const [sh, setSh] = useState<ShopAdminItem["sh"]>(x?.sh ?? "owl");
  const [on, setOn] = useState(x?.on ?? true);
  // The photo: unchanged (undefined), a new one (its file and preview), or none (null).
  const [pic, setPic] = useState<{ blob: Blob; url: string } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const shown = pic === undefined ? (x?.ph ?? null) : (pic?.url ?? null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      const blob = await smaller(f);
      setPic({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      toast(e instanceof Error ? e.message : "The phone couldn't read that photo.", "error");
    }
  };
  const price = Number(p);
  const stock = st.trim() === "" ? null : Number(st);
  const ready = n.trim().length > 0 && Number.isInteger(price) && price > 0 && (stock === null || (Number.isInteger(stock) && stock >= 0));
  const save = async () => {
    setBusy(true);
    const ok = await act(async () => {
      const ph = pic ? ((await upload(api.coins.photoUrl, pic.blob)) as Id<"_storage">) : pic === null ? null : undefined;
      await mutate(api.coins.save, { ...(x ? { id: x.id as Id<"shopItems"> } : {}), n, p: price, st: stock, sh, on, ...(ph !== undefined ? { ph } : {}) });
      return true;
    });
    setBusy(false);
    if (ok) {
      toast(`${n.trim()}: saved. Students see it ${on ? "now" : "when you show it"}.`);
      props.onClose();
    }
  };
  const drop = async () => {
    if (!x) return;
    if (!sure) return setSure(true);
    setBusy(true);
    const ok = await act(() => mutate(api.coins.drop, { id: x.id as Id<"shopItems"> }));
    setBusy(false);
    if (ok) {
      toast(`${x.n}: removed from the Shop.`);
      props.onClose();
    }
  };
  return (
    <Sheet title={x ? x.n : "Add a thing"} sub="Students see its photo, name and price in coins (1 coin = Rs 1 of your price)." onClose={props.onClose} cls="sh-sheet">
      <div class="sh-photo">
        <span class="sh-pic big">{shown ? <img src={shown} alt="" /> : <i>📷</i>}</span>
        <label class="btn ghost">
          {shown ? "Another photo" : "Take or pick a photo"}
          <input type="file" accept="image/*" aria-label="Photo" onChange={(e) => void pick((e.target as HTMLInputElement).files?.[0])} />
        </label>
        {shown && (
          <button type="button" class="btn ghost" onClick={() => setPic(null)}>
            No photo
          </button>
        )}
      </div>
      <label class="rc-prize">
        <span>Name</span>
        <input value={n} maxLength={40} placeholder="🍦 Ice cream" onInput={(e) => setN((e.target as HTMLInputElement).value)} />
      </label>
      <div class="sh-two">
        <label class="rc-prize">
          <span>Price (coins)</span>
          <input value={p} inputMode="numeric" placeholder="150" onInput={(e) => setP((e.target as HTMLInputElement).value.replace(/\D/g, ""))} />
        </label>
        <label class="rc-prize">
          <span>How many</span>
          <input value={st} inputMode="numeric" placeholder="No end" onInput={(e) => setSt((e.target as HTMLInputElement).value.replace(/\D/g, ""))} />
        </label>
      </div>
      <div class="sh-shelves" role="group" aria-label="Shelf">
        {SHELVES.map((s) => (
          <button key={s.id} type="button" class={`st-chip${sh === s.id ? " on" : ""}`} aria-pressed={sh === s.id} onClick={() => setSh(s.id)}>
            {s.name}
          </button>
        ))}
      </div>
      <small class="muted">{SHELVES.find((s) => s.id === sh)?.hint}</small>
      <label class="phq-req">
        <input type="checkbox" checked={on} onChange={() => setOn(!on)} />
        <span>On the students' phones</span>
      </label>
      <button type="button" class="btn primary wide" disabled={busy || !ready} onClick={() => void save()}>
        {x ? "Save" : "Add to the Shop"}
      </button>
      {x && (
        <button type="button" class={`btn ${sure ? "danger" : "ghost"} wide`} disabled={busy} onClick={() => void drop()}>
          {sure ? "Remove it? Tap again" : "Remove from the Shop"}
        </button>
      )}
    </Sheet>
  );
}

/** The escape hatch (his answer was no limit): the most coins one student gets in a week. */
function LimitCard(props: { limit: number | null }) {
  const [on, setOn] = useState(props.limit !== null);
  const [n, setN] = useState(props.limit !== null ? String(props.limit) : "70");
  const [busy, setBusy] = useState(false);
  const want = on ? Number(n) : null;
  const changed = want !== props.limit;
  return (
    <section class="rc-box">
      <b>The most coins a week</b>
      <label class="phq-req">
        <input type="checkbox" checked={on} onChange={() => setOn(!on)} />
        <span>Stop a student's Monday pay at</span>
        <input class="sh-limit" value={n} inputMode="numeric" disabled={!on} aria-label="Coins a week" onInput={(e) => setN((e.target as HTMLInputElement).value.replace(/\D/g, ""))} />
        <span>coins</span>
      </label>
      <small class="muted">
        {props.limit === null
          ? "Off: every 5 XP pays a coin. 70 a week ≈ Rs 300 a month at most per student."
          : `On: at most ${props.limit} coins a week per student; XP over it pays nothing.`}
      </small>
      <button
        type="button"
        class="btn ghost wide"
        disabled={busy || !changed || (on && !(Number(n) > 0))}
        onClick={() => {
          setBusy(true);
          void act(() => mutate(api.coins.setLimit, { n: want }))
            .then((r) => r && toast(want === null ? "No limit on the pay." : `The pay stops at ${want} coins a week.`))
            .finally(() => setBusy(false));
        }}
      >
        Save the limit
      </button>
    </section>
  );
}

export function ShopSettings() {
  const s = useQuery<ShopAdmin>(api.coins.items, {});
  const [open, setOpen] = useState<ShopAdminItem | "new" | null>(null);
  if (!s) return <p class="muted settings-body">Loading…</p>;
  return (
    <div class="settings-body sh">
      <section class="phq-sum">
        <b>The Shop in the family app</b>
        <small class="muted">
          Students spend coins, never XP (XP stays their rank and league). Every Monday last week's XP pays coins: 5 XP = 1
          coin. A Level done at home pays once it is checked in class; Us XP never pays. What they buy shows as a gold card
          on their phone: hand it over in Race → Gifts to give.
        </small>
      </section>
      <Numbers s={s} />
      <button type="button" class="btn primary wide" onClick={() => setOpen("new")}>
        + Add a thing
      </button>
      {SHELVES.map((sh) => {
        const list = s.items.filter((x) => x.sh === sh.id);
        return (
          <section key={sh.id} class="rc-box">
            <b>{sh.name}</b>
            {list.length ? (
              <ul class="sh-list">
                {list.map((x) => (
                  <Row key={x.id} x={x} onOpen={() => setOpen(x)} />
                ))}
              </ul>
            ) : (
              <small class="muted">Nothing yet: {sh.hint}.</small>
            )}
          </section>
        );
      })}
      <LimitCard key={String(s.limit)} limit={s.limit} />
      {open && <ItemSheet x={open === "new" ? null : open} onClose={() => setOpen(null)} />}
    </div>
  );
}
