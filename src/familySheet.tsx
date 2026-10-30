// Settings → Students → Family: the family app for one student (app.aristora.org).
// - Send a family link on WhatsApp: his family opens it on their phone once (7 days); that phone sees only him.
// - The family phones signed in, and Sign out (a lost phone, a link sent to the wrong number).
// - Open every World: off = Worlds open in order (his unit now, books given, and the next when one is done).

import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { secretHash } from "../convex/lib/auth";
import { slDate } from "../convex/lib/day";
import { mutate, randomKey } from "./backend";
import type { View } from "./derive";
import { useQuery } from "./live";
import { act, currentRole, toast } from "./store";
import { Sheet } from "./ui";

/** Where families open the app: app.aristora.org (from the class system's own address), else /f/ here (tests). */
export function familyUrl(code: string): string {
  const base = location.hostname === "system.aristora.org" ? "https://app.aristora.org/" : `${location.origin}/f/index.html`;
  return `${base}#join=${code}`;
}

type Phones = { phones: { label: string; since: number; lastSeenAt: number }[]; linkUntil: number | null; openAll: boolean };

export function FamilySheet(props: { v: View; onClose: () => void }) {
  const s = props.v.s;
  const info = useQuery<Phones>(api.families.phones, { studentId: s._id });
  const [link, setLink] = useState<{ url: string; until: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const first = s.name.split(" ")[0];

  const make = async () => {
    setBusy(true);
    const code = randomKey(24);
    const r = await act(() => mutate(api.families.makeLink, { studentId: s._id, codeHash: secretHash("family-link", code), by: currentRole() }));
    setBusy(false);
    if (r) setLink({ url: familyUrl(code), until: r.expiresAt });
  };
  const text = link
    ? `ARISTORA: ${s.name}'s app. Open this link on the phone he will use (it works once, until ${slDate(link.until)}):\n${link.url}\n\n${s.name} இன் ARISTORA app. இந்த link ஐ அவன் பயன்படுத்தும் phone இல் திறக்கவும் (ஒரு முறை மட்டும்).`
    : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link!.url);
      toast("Link copied.");
    } catch {
      toast("Couldn't copy. Press and hold the link to copy it.", "error");
    }
  };

  return (
    <Sheet
      title={`${s.name}: family app`}
      sub={`At home, ${first} types each level's answers on the phone and it marks them. You see them on Correction (⌂).`}
      onClose={props.onClose}
      cls="fam-sheet"
    >
      {link ? (
        <>
          <a class="btn whatsapp wide big" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
            Send on WhatsApp
          </a>
          <button type="button" class="btn ghost wide" onClick={() => void copy()}>
            Copy the link
          </button>
          <input class="full link-text" readOnly value={link.url} aria-label="Family link" onFocus={(e) => (e.target as HTMLInputElement).select()} />
          <p class="muted small">It works once, until {slDate(link.until)}. For a second phone, send another link.</p>
        </>
      ) : (
        <button type="button" class="btn primary wide big" disabled={busy} onClick={() => void make()}>
          Make a family link
        </button>
      )}

      <h3 class="block-title">Family phones</h3>
      {!info ? (
        <p class="muted">Loading…</p>
      ) : info.phones.length === 0 ? (
        <p class="muted">None yet.{info.linkUntil && !link ? ` A link is waiting until ${slDate(info.linkUntil)}.` : ""}</p>
      ) : (
        <>
          <ul class="plain-list fam-phones">
            {info.phones.map((p, i) => (
              <li key={i}>
                <span>{p.label}</span>
                <small class="muted">since {slDate(p.since)}</small>
              </li>
            ))}
          </ul>
          <button
            type="button"
            class="link-btn danger"
            onClick={async () => {
              const n = await act(() => mutate(api.families.signOutAll, { studentId: s._id, by: currentRole() }));
              if (n !== undefined) toast(`${s.name}'s family phones are signed out.`);
            }}
          >
            Sign out the family phones
          </button>
        </>
      )}

      <h3 class="block-title">Worlds</h3>
      <label class="fam-open">
        <input
          type="checkbox"
          checked={!!info?.openAll}
          disabled={!info}
          onChange={(e) =>
            void act(() => mutate(api.families.setOpenAll, { studentId: s._id, on: (e.target as HTMLInputElement).checked, by: currentRole() }))
          }
        />
        <span>
          <b>Open every World</b>
          <small class="muted">Off: his unit now, the books given, and the next World once he finishes one.</small>
        </span>
      </label>
    </Sheet>
  );
}

type PhoneList = {
  share: { questions: number; of: number; marks: number; max: number } | null;
  qs: { q: number; max: number; phone: boolean; parts: { p: string; m: number; words: string; phone: boolean }[] }[];
} | null;

/**
 * Settings → Books → a workbook: how much of it the phone marks at home, and exactly what it accepts for each question
 * (read from the answer key; names, reasons and drawings stay with the corrector). Check it once per unit.
 */
export function PhoneAnswers(props: { unitId: string }) {
  const [open, setOpen] = useState(false);
  const list = useQuery<PhoneList>(api.families.answers, { unitId: props.unitId as never });
  if (!list?.share) return null;
  const { share } = list;
  return (
    <div class="phone-ans">
      <p class="small key-note ok">
        At home the phone marks {share.questions} of {share.of} questions ({share.marks} of {share.max} marks). The rest: the corrector.
      </p>
      <button type="button" class="link-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide what the phone accepts" : "See what the phone accepts"}
      </button>
      {open && (
        <ul class="phone-ans-list">
          {list.qs.map((q) => (
            <li key={q.q} class={q.phone ? "" : "teach"}>
              <b>Q{q.q}</b>
              <span>
                {q.parts.map((p, i) => (
                  <span key={i} class={p.phone ? "pa-ok" : "pa-t"}>
                    {p.p ? `(${p.p}) ` : ""}
                    {p.phone ? p.words : "corrector"}
                    {q.parts.length > 1 ? ` [${p.m}]` : ""}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
