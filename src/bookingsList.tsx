// Settings → Bookings (26 Nov 2026, the founder: "instead of Google Form ... in our Aristora system app ... create
// another page for bookings ... this is just for temporary"): what students book on aristora.org/ol-prediction-2026
// (the O/L Prediction Paper 2026, until 30 November). The owner only: each booking (call or WhatsApp the number in one
// tap, tick it confirmed after his call), and who brought how many (his students' commission: confirmed ones).
// A new booking: the count on the Settings gear, and a chime with its name while the app is open.

import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { BookingRow } from "../convex/bookings";
import { NOBODY, prettyPhone, referrals } from "../convex/lib/bookings";
import { slClock, slDate, slDayNo } from "../convex/lib/day";
import { mutate, subscribe } from "./backend";
import { useQuery } from "./live";
import { ring } from "./sound";
import { toast } from "./store";

type NewInfo = { n: number; last: { name: string; ref: string; at: number } | null };

/**
 * New bookings since he last opened Settings → Bookings (the gear's count; 0 for anyone but the owner). One that
 * arrives while the app is open chimes and says who, and from whom.
 */
export function useBookingsNew(allowed: boolean): number {
  const [n, setN] = useState(0);
  const lastAt = useRef(0);
  useEffect(() => {
    if (!allowed) return;
    return subscribe(
      api.bookings.newCount,
      {},
      (v: NewInfo) => {
        setN(v.n);
        const l = v.last;
        if (!l) return;
        if (lastAt.current && l.at > lastAt.current) {
          ring("coming");
          toast(`📚 New booking: ${l.name}${l.ref && l.ref !== NOBODY ? ` · from ${l.ref}` : ""}`);
        }
        lastAt.current = Math.max(lastAt.current, l.at);
      },
      () => setN(0),
    );
  }, [allowed]);
  return allowed ? n : 0;
}

type Filter = "all" | "call" | "ok";

function whenWords(at: number, now: number): string {
  const days = slDayNo(now) - slDayNo(at);
  const day = days === 0 ? "Today" : days === 1 ? "Yesterday" : slDate(at);
  return `${day}, ${slClock(at)}`;
}

const wa = (phone: string) => `https://wa.me/94${phone.slice(1)}`;

export function BookingsList() {
  const data = useQuery<{ seenAt: number; items: BookingRow[] }>(api.bookings.list, {});
  // What was new when the page opened stays marked while it is open (the server's mark moves at once).
  const [before, setBefore] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!data) return;
    if (before === null) setBefore(data.seenAt);
    const newest = data.items[0]?.at ?? 0;
    if (newest > data.seenAt) void mutate(api.bookings.seen, { at: newest }).catch(() => {});
  }, [data]);
  if (!data) return <p class="muted settings-body">Loading…</p>;

  const now = Date.now();
  const all = data.items;
  const okN = all.filter((x) => x.ok).length;
  const shown = all.filter((x) => (filter === "call" ? !x.ok : filter === "ok" ? !!x.ok : true));
  const seen = before ?? data.seenAt;
  const refs = referrals(all.map((x) => ({ ref: x.ref, ok: x.ok ?? undefined })));

  const tick = async (x: BookingRow) => {
    setBusy(x.id);
    try {
      await mutate(api.bookings.confirm, { id: x.id, ok: !x.ok });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save. Try again.", "error");
    } finally {
      setBusy(null);
    }
  };
  const drop = async (x: BookingRow) => {
    if (!confirm(`Remove ${x.name}'s booking (${x.code})? This can't be undone.`)) return;
    try {
      await mutate(api.bookings.remove, { id: x.id });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't remove. Try again.", "error");
    }
  };

  return (
    <div class="settings-body fbk bkg">
      <section class="fbk-sum">
        <b>
          O/L Prediction Paper 2026: {all.length} {all.length === 1 ? "booking" : "bookings"}
          <span class="fbk-avg"> · {okN} confirmed</span>
        </b>
        <small class="muted">From aristora.org/ol-prediction-2026 (booking until 30 November). Call each one, then tick Confirmed.</small>
      </section>

      {all.length > 0 && (
        <section class="bkg-refs" aria-label="Who brought them">
          <b>Who brought them</b>
          <div class="bkg-chips">
            {refs.byRef.map((r) => (
              <span key={r.ref} class="bkg-chip">
                {r.ref} <em>{r.n}</em>
                {r.ok > 0 && <small> · {r.ok} ✓</small>}
              </span>
            ))}
            {refs.nobody > 0 && (
              <span class="bkg-chip none">
                Nobody <em>{refs.nobody}</em>
              </span>
            )}
          </div>
          <small class="muted">The commission counts the ✓ (confirmed) ones. Names spelled the same way count together.</small>
        </section>
      )}

      <div class="segc plain fbk-filter" role="group" aria-label="Show">
        {(
          [
            ["all", `All ${all.length}`],
            ["call", `To call ${all.length - okN}`],
            ["ok", `Confirmed ${okN}`],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" class={`segc-b${filter === id ? " on" : ""}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p class="muted">{all.length === 0 ? "No bookings yet. They show here the moment a student books on the website." : "None here."}</p>
      ) : (
        <ul class="plain-list fbk-list">
          {shown.map((x) => (
            <li key={x.id} class={`fbk-item bkg-item${x.at > seen ? " new" : ""}${x.ok ? " ok" : ""}`}>
              <span class="fbk-face" aria-hidden="true">
                {x.ok ? "✅" : "📚"}
              </span>
              <div class="fbk-w">
                <div class="fbk-top">
                  <b>{x.name}</b>
                  <span class="fbk-topic">{x.code}</span>
                  {x.at > seen && <span class="fbk-new">New</span>}
                </div>
                <p class="bkg-line">
                  <a href={`tel:${x.phone}`}>{prettyPhone(x.phone)}</a>
                  <span class="muted"> · {x.ref === NOBODY ? "nobody told them" : `from ${x.ref}`}</span>
                </p>
                <small class="muted">{whenWords(x.at, now)}</small>
                <div class="bkg-acts">
                  <a class="btn small" href={`tel:${x.phone}`}>
                    Call
                  </a>
                  <a class="btn small" href={wa(x.phone)} target="_blank" rel="noopener">
                    WhatsApp
                  </a>
                  <button type="button" class={`btn small${x.ok ? " primary" : ""}`} aria-pressed={!!x.ok} disabled={busy === x.id} onClick={() => void tick(x)}>
                    {x.ok ? "✓ Confirmed" : "Confirm"}
                  </button>
                  <button type="button" class="btn small ghost bkg-x" onClick={() => void drop(x)} aria-label={`Remove ${x.name}'s booking`}>
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
