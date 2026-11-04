// Settings → Students → Family: the family app for one student (app.aristora.org).
// - His index number and 4-digit code (1 Nov 2026): he types them at app.aristora.org, on his phone and his parent's.
//   The code is made on this phone the first time the sheet opens; New code replaces it (and clears a lock).
// - Send on WhatsApp: the address, his index and code, and a one-tap link (one use, 7 days).
// - The family phones signed in, and Sign out (a lost phone, a link sent to the wrong number).
// - Open every Stage (a unit: the family app's Stage; a term is its World): off = Stages open in order (his unit now,
//   books given, and the next when one is done).
// - O/L map (Grade 10 and 11, 4 Nov 2026): his phone shows the O/L syllabus by paper part instead of his grade's terms
//   (the same tick as Settings → Students → O/L map).

import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { secretHash } from "../convex/lib/auth";
import { weakCode } from "../convex/lib/family";
import { slDate } from "../convex/lib/day";
import { mutate, randomKey } from "./backend";
import type { View } from "./derive";
import { useQuery } from "./live";
import { act, currentRole, may, toast } from "./store";
import { Sheet } from "./ui";

/**
 * Where families open the app: app.aristora.org/f/ (from the class system's own address), else /f/ here (tests). The
 * family app lives under /f/ on both addresses; app.aristora.org/ only redirects there (vercel.json).
 */
export function familyUrl(code: string): string {
  const base = location.hostname === "system.aristora.org" ? "https://app.aristora.org/f/" : `${location.origin}/f/index.html`;
  return `${base}#join=${code}`;
}

/** The family app's address, as a family types it. */
export function familyHome(): string {
  return location.hostname === "system.aristora.org" ? "app.aristora.org" : `${location.host}/f/`;
}

/** A 4-digit code from the phone's secure random numbers (never an easy one like 1111 or 1234). */
export function newFamilyCode(): string {
  const b = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(b);
    const c = String(b[0] % 10000).padStart(4, "0");
    if (!weakCode(c)) return c;
  }
}

type Phones = {
  phones: { label: string; since: number; lastSeenAt: number }[];
  linkUntil: number | null;
  openAll: boolean;
  olMap: boolean;
  index: number | null;
  code: string | null;
  locked: boolean;
};

export function FamilySheet(props: { v: View; onClose: () => void }) {
  const s = props.v.s;
  const info = useQuery<Phones>(api.families.phones, { studentId: s._id });
  const [link, setLink] = useState<{ url: string; until: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const first = s.name.split(" ")[0];
  const none = !!s.demo || !!s.test;

  // His code: made here (secure random) the first time anyone opens his sheet.
  const making = useRef(false);
  const setCode = async () => {
    making.current = true;
    const r = await act(() => mutate(api.families.setCode, { studentId: s._id, code: newFamilyCode(), by: currentRole() }));
    making.current = false;
    return r;
  };
  useEffect(() => {
    if (info && info.code === null && !making.current && !none) void setCode();
  }, [info?.code, info === undefined]);

  const make = async () => {
    setBusy(true);
    const code = randomKey(24);
    const r = await act(() => mutate(api.families.makeLink, { studentId: s._id, codeHash: secretHash("family-link", code), by: currentRole() }));
    setBusy(false);
    if (r) setLink({ url: familyUrl(code), until: r.expiresAt });
  };
  const keys = info?.index && info.code ? `Index ${info.index}, Code ${info.code}` : "";
  const text = link
    ? `ARISTORA: ${s.name}'s app.\nOpen ${familyHome()} and type ${keys}.\nOr tap this link once (until ${slDate(link.until)}):\n${link.url}\n\n${s.name} இன் ARISTORA app: ${familyHome()} → ${keys}.`
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
      {none ? (
        <p class="muted">Demo and test students have no family app.</p>
      ) : (
        <div class="fam-idcode" aria-live="polite">
          <span>
            <small>Index</small>
            <b>{info?.index ?? "…"}</b>
          </span>
          <span>
            <small>Code</small>
            <b>{info?.code ?? "…"}</b>
          </span>
          <button
            type="button"
            class="link-btn"
            disabled={!info?.code}
            onClick={async () => {
              if (await setCode()) toast(`${s.name}: a new code. The old one stops working (phones already in stay in).`);
            }}
          >
            New code
          </button>
        </div>
      )}
      {!none && (
        <p class="muted small fam-how">
          {first} opens <b>{familyHome()}</b> and types these, on his phone and his parent's. Forgot? Read them out again.
          {info?.locked ? " Locked now (5 wrong codes): New code opens it." : ""}
        </p>
      )}
      {none ? null : link ? (
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
        <button type="button" class="btn primary wide big" disabled={busy || !info?.code} onClick={() => void make()}>
          Send it on WhatsApp
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

      <h3 class="block-title">Stages (units)</h3>
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
          <b>Open every Stage</b>
          <small class="muted">Off: his unit now, the books given, and the next Stage once he finishes one.</small>
        </span>
      </label>
      {(s.grade === 10 || s.grade === 11) && !none && (
        <label class="fam-open">
          <input
            type="checkbox"
            checked={!!info?.olMap}
            disabled={!info}
            onChange={(e) =>
              void act(() => mutate(api.families.setOlMap, { studentIds: [s._id], on: (e.target as HTMLInputElement).checked, by: currentRole() }))
            }
          />
          <span>
            <b>O/L map</b>
            <small class="muted">His phone shows the O/L syllabus (Paper 1A, 1B, 2A, 2B) instead of Grade {s.grade}'s terms.</small>
          </span>
        </label>
      )}
    </Sheet>
  );
}

type PhonePart = { p: string; m: number; words: string; phone: boolean; fixed: boolean };
type PhoneList = {
  share: { questions: number; of: number; marks: number; max: number } | null;
  qs: { q: number; max: number; phone: boolean; parts: PhonePart[] }[];
} | null;

/**
 * Settings → Books → a workbook: how much of it the phone marks at home, and exactly what it accepts for each question
 * (read from the answer key; names, reasons and drawings stay with the corrector). Check it once per unit.
 * 4 Nov 2026 (his ask: "why this problem continues again and again, do you have proper solution"): a part the phone
 * can't read shows the key's own words; tap it and type the answer as the phone should read it (owner and Books).
 */
export function PhoneAnswers(props: { unitId: string }) {
  const [open, setOpen] = useState(false);
  const [onlyTeacher, setOnlyTeacher] = useState(false);
  const [edit, setEdit] = useState<{ q: number; p: string; a: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useQuery<PhoneList>(api.families.answers, { unitId: props.unitId as never });
  if (!list?.share) return null;
  const { share } = list;
  const canFix = may("owner") || may("books");
  const corrector = list.qs.reduce((n, q) => n + q.parts.filter((x) => !x.phone).length, 0);
  const save = async (a: string) => {
    if (!edit) return;
    setBusy(true);
    const ok = await act(() => mutate(api.families.setPhoneAnswer, { unitId: props.unitId as never, q: edit.q, p: edit.p, a, by: currentRole() }));
    setBusy(false);
    if (ok) {
      toast(a ? `Q${edit.q}: saved. Phones read it from the next level opened.` : `Q${edit.q}: back to the key.`);
      setEdit(null);
    }
  };
  return (
    <div class="phone-ans">
      <p class="small key-note ok">
        At home the phone marks {share.questions} of {share.of} questions ({share.marks} of {share.max} marks). The rest: the corrector.
      </p>
      <button type="button" class="link-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide what the phone accepts" : "See what the phone accepts"}
      </button>
      {open && (
        <>
          {corrector > 0 && (
            <label class="pa-only small">
              <input type="checkbox" checked={onlyTeacher} onChange={() => setOnlyTeacher(!onlyTeacher)} />
              <span>
                Only the {corrector} the corrector marks{canFix ? ": tap one whose answer is a number, and type it" : ""}
              </span>
            </label>
          )}
          <ul class="phone-ans-list">
            {list.qs
              .filter((q) => !onlyTeacher || !q.phone)
              .map((q) => (
                <li key={q.q} class={q.phone ? "" : "teach"}>
                  <b>Q{q.q}</b>
                  <span class="pa-parts">
                    {q.parts.map((x, i) => {
                      const words = (
                        <>
                          {x.p ? `(${x.p}) ` : ""}
                          {x.phone ? x.words : `corrector${x.words ? `: ${x.words}` : ""}`}
                          {q.parts.length > 1 ? ` [${x.m}]` : ""}
                          {x.fixed ? " ✎" : ""}
                        </>
                      );
                      return canFix ? (
                        <button
                          key={i}
                          type="button"
                          class={`pa-fixbtn ${x.phone ? "pa-ok" : "pa-t"}`}
                          aria-label={`Q${q.q}${x.p ? ` (${x.p})` : ""}: type how the phone reads it`}
                          onClick={() => setEdit({ q: q.q, p: x.p, a: x.fixed && x.phone ? x.words.replace(/ \(any order\)$/, "") : "" })}
                        >
                          {words}
                        </button>
                      ) : (
                        <span key={i} class={x.phone ? "pa-ok" : "pa-t"}>
                          {words}
                        </span>
                      );
                    })}
                    {edit?.q === q.q && (
                      <span class="pa-form">
                        <input
                          type="text"
                          inputMode="text"
                          value={edit.a}
                          placeholder="36000"
                          aria-label={`Q${q.q}: the answer as the phone reads it`}
                          onInput={(e) => setEdit({ ...edit, a: (e.target as HTMLInputElement).value })}
                        />
                        <small class="muted">Only the answer: 36000 · 2 1/3 · 25% · 2 : 3 · x = 5, y = 7 · 2n + 1</small>
                        <span class="pa-btns">
                          <button type="button" class="btn primary small" disabled={busy || !edit.a.trim()} onClick={() => void save(edit.a)}>
                            Save
                          </button>
                          <button type="button" class="btn ghost small" disabled={busy} onClick={() => void save("teacher")}>
                            Corrector marks it
                          </button>
                          <button type="button" class="btn ghost small" disabled={busy} onClick={() => void save("")}>
                            Back to the key
                          </button>
                          <button type="button" class="btn ghost small" onClick={() => setEdit(null)}>
                            Cancel
                          </button>
                        </span>
                      </span>
                    )}
                  </span>
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
