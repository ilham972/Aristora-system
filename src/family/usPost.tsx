// Posts and doubts on Us (7 Nov 2026, his voice note: "teachers will put the posters ... the screenshot of the question
// and ask them to do the question ... students also can post by attaching the photo to ask their doubts and they also
// can decide who can see this"). One of the parts after the first screen (parts.ts), for the students' Us and the
// teachers' (staff.tsx: the same screens with her sign-in; net.ts sends her calls to the teachers' functions):
// - Pics: a line's photos (the small copies: ~40 KB each in the feed); a tap shows the big one full screen, a tap there
//   zooms (the page itself never zooms).
// - Composer: words and photos (the camera or the gallery, cropped first: crop.tsx), then Send. Each photo goes as two
//   copies: 1280 px for a tap, 560 px for the lines.
// - ThreadScreen: a post or a doubt opened. A question, his rule: before he sends his own answer only locked cards (that
//   classmates answered, nothing else); after, the answers a teacher marked right, with the names. A doubt: its
//   replies (a senior's nameless until a teacher marks it right), ⚑ Report. A teacher sees every name, and ✓ ✗ ✎ ✕.
// - DoubtSheet: his doubt, and who sees it (teachers, seniors, both): his choice.
// The words a student reads are Tamil; buttons English.

import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { UsItem, UsPic, UsReply, UsThread } from "../../convex/lib/us";
import { CropSheet } from "./crop";
import { keep, mutation, NetError, query, uploadPhoto } from "./net";
import { jpegOf } from "./photos";
import { buzz, sound } from "./sound";
import { Icon, problemWords, Sheet, showSheet, toast, Waiting } from "./ui";

/** The lines' copy of a photo: its long side. */
const SMALL = 560;
/** Who a doubt is for, in his words. */
export const AUD: Record<string, string> = { t: "ஆசிரியர்கள்", s: "மூத்த மாணவர்கள்", ts: "ஆசிரியர்கள் + மூத்தவர்கள்" };

/** A photo picked: the big copy (cropped), the small one, the big one's size, an address to show it here. */
type Picked = { b: Blob; s: Blob; w: number; h: number; u: string };
export type Sent = { s: string; b: string; w: number; h: number };

async function pickedOf(big: Blob): Promise<Picked> {
  const u = URL.createObjectURL(big);
  const img = new Image();
  img.src = u;
  await img.decode();
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const k = Math.min(1, SMALL / Math.max(w, h, 1));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const g = c.getContext("2d");
  if (!g) throw new Error("no canvas");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return { b: big, s: await jpegOf(c), w, h, u };
}

/** A photo full screen (the big copy); a tap zooms in and out; several: dots to the next. */
function Big(props: { ph: UsPic[]; i: number; onClose: () => void }) {
  const [i, setI] = useState(props.i);
  const [z, setZ] = useState(false);
  const p = props.ph[i] ?? props.ph[0];
  return (
    <div class="f-lb" role="dialog" aria-modal="true" aria-label="Photo">
      <div class={`f-lb-in${z ? " z" : ""}`} onClick={() => setZ(!z)}>
        <img src={p.b} alt="" width={p.w} height={p.h} />
      </div>
      <button type="button" class="f-round f-lb-x" aria-label="Close" onClick={props.onClose}>
        <Icon name="close" size={22} />
      </button>
      {props.ph.length > 1 && (
        <div class="f-lb-n">
          {props.ph.map((_, j) => (
            <button
              key={j}
              type="button"
              class={j === i ? "on" : ""}
              aria-label={`Photo ${j + 1}`}
              onClick={() => {
                setI(j);
                setZ(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** A line's photos (small copies; one alone keeps its shape up to a height); a tap: the big one. */
export function Pics(props: { ph: UsPic[] }) {
  const one = props.ph.length === 1;
  return (
    <div class={`f-pics n${Math.min(props.ph.length, 3)}`}>
      {props.ph.map((p, i) => (
        <button
          key={p.s}
          type="button"
          class="f-pic"
          aria-label={`Photo ${i + 1}`}
          style={one ? { aspectRatio: `${p.w} / ${p.h}` } : undefined}
          onClick={(e) => {
            e.stopPropagation();
            buzz();
            showSheet((close) => <Big ph={props.ph} i={i} onClose={close} />);
          }}
        >
          <img src={p.s} alt="" loading="lazy" decoding="async" />
        </button>
      ))}
    </div>
  );
}

/** Words and photos, then Send: an answer, a doubt, a reply. `onSend` gets the words and the photos (uploaded). */
export function Composer(props: {
  ph: string;
  go: string;
  say?: string;
  crop?: string;
  max?: number;
  /** The words to start with (a teacher's starter). */
  init?: string;
  onSend: (text: string, ph: Sent[]) => Promise<unknown>;
}) {
  const max = props.max ?? 2;
  const [t, setT] = useState(props.init ?? "");
  const [list, setList] = useState<Picked[]>([]);
  const [file, setFile] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const empty = !t.trim() && !list.length;
  const cropped = async (b: Blob) => {
    setFile(null);
    try {
      const p = await pickedOf(b);
      buzz(6);
      sound("pop");
      setList((x) => [...x, p].slice(0, max));
    } catch {
      toast("இந்தப் படத்தைத் திறக்க முடியவில்லை. மீண்டும் எடு.", true);
    }
  };
  const send = async () => {
    if (busy || empty) return;
    setBusy(true);
    try {
      const ph: Sent[] = [];
      for (const p of list) ph.push({ s: await uploadPhoto(p.s), b: await uploadPhoto(p.b), w: p.w, h: p.h });
      await props.onSend(t.trim(), ph);
      sound("send");
      list.forEach((p) => URL.revokeObjectURL(p.u));
      setT("");
      setList([]);
    } catch (e) {
      toast(e instanceof NetError && e.offline ? "இணையம் இல்லை. பிறகு அனுப்பு." : problemWords(e), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="f-uc">
      <textarea class="f-replybox" rows={3} maxLength={300} placeholder={props.ph} aria-label={props.ph} value={t} onInput={(e) => setT((e.target as HTMLTextAreaElement).value)} />
      <div class="f-take-row">
        {list.map((p, i) => (
          <span key={p.u} class="f-thumb">
            <img src={p.u} alt={`படம் ${i + 1}`} />
            <button
              type="button"
              class="f-thumb-x"
              aria-label={`Remove photo ${i + 1}`}
              onClick={() => {
                URL.revokeObjectURL(p.u);
                setList(list.filter((_, j) => j !== i));
              }}
            >
              <Icon name="close" size={12} />
            </button>
          </span>
        ))}
        {list.length < max && (
          <button type="button" class="f-cam" aria-label="Add a photo" onClick={() => input.current?.click()}>
            <Icon name="camera" size={22} />
            <small>{list.length ? "இன்னொன்று" : "படம்"}</small>
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          class="f-file"
          onChange={(e) => {
            const el = e.target as HTMLInputElement;
            const f = el.files?.[0];
            el.value = "";
            if (f) setFile(f);
          }}
        />
        <button type="button" class="f-btn go f-uc-go" disabled={busy || empty} onClick={() => void send()}>
          {busy ? "…" : props.go}
        </button>
      </div>
      {props.say && <p class="f-uc-say">{props.say}</p>}
      {file && <CropSheet file={file} say={props.crop ?? "மஞ்சள் புள்ளிகளை இழு: தேவையான பகுதி மட்டும் பெட்டிக்குள்."} onClose={() => setFile(null)} onDone={(b) => void cropped(b)} />}
    </div>
  );
}

/** The grades a post is for, in a few letters. */
export const gradesWords = (gs?: number[]) => (gs ? `Grade ${gs.join(", ")}` : "எல்லோருக்கும்");

/** Who wrote a reply, as the one looking may know (lib/us.ts replyOf sends a name only when he may see it). */
function whoOf(r: UsReply, staff: boolean): string {
  if (r.tch) return `${r.n} ஆசிரியர்`;
  if (r.mine) return "நீ";
  if (r.ask && !staff) return "கேட்டவர்";
  return r.n ?? "மாணவர்";
}

function Reply(props: { r: UsReply; staff: boolean; onMate: (id: string) => void; children?: ComponentChildren }) {
  const r = props.r;
  return (
    <li class={`f-ur${r.ok === true ? " ok" : r.ok === false ? " no" : ""}${r.tch ? " tch" : ""}${r.mine ? " mine" : ""}`}>
      <p class="f-ur-h">
        <b
          class={r.sid ? "tap" : ""}
          onClick={
            r.sid
              ? () => {
                  buzz();
                  props.onMate(r.sid!);
                }
              : undefined
          }
        >
          {whoOf(r, props.staff)}
        </b>
        {r.g !== undefined && !r.tch && <i class="f-gchip">{r.g}</i>}
        {props.staff && r.ask && <i class="f-ur-tag">asked</i>}
        <span class="f-sp" />
        {r.ok === true ? <span class="f-ur-ok">✓ {r.okBy} ஆசிரியர்</span> : r.ok === false ? <span class="f-ur-no">✗ சரியில்லை</span> : null}
      </p>
      {r.t && <p class="f-ur-t">{r.t}</p>}
      {r.ph && <Pics ph={r.ph} />}
      {r.note && <p class="f-ur-note">💬 {r.note}</p>}
      {props.children}
    </li>
  );
}

/** The answers he may not see yet, as locked cards (his words: "hide the image and tell them this is hidden"). */
function Locks(props: { n: number; sent: boolean }) {
  return (
    <section class="f-locks" aria-label={`${props.n} hidden`}>
      <p>
        {props.sent
          ? `இன்னும் ${props.n} விடைகள் மறைவில். ஆசிரியர் சரி என்றவை மட்டும் இங்கே தெரியும்.`
          : `${props.n} பேர் விடை அனுப்பினார்கள். நீ அனுப்பிய பின், ஆசிரியர் சரி என்ற விடைகள் தெரியும்.`}
      </p>
      <div class="f-locks-g" aria-hidden="true">
        {Array.from({ length: Math.min(props.n, 12) }, (_, i) => (
          <i key={i}>
            <Icon name="lock" size={18} />
          </i>
        ))}
        {props.n > 12 && <b>+{props.n - 12}</b>}
      </div>
    </section>
  );
}

/** ✎ A teacher's words to him with her mark (only he sees them). */
function NoteSheet(props: { r: UsReply; q: boolean; onClose: () => void; onMark: (ok: boolean, note: string) => Promise<unknown> }) {
  const [t, setT] = useState(props.r.note ?? "");
  const go = (ok: boolean) => void props.onMark(ok, t).then(props.onClose);
  return (
    <Sheet title="✎ Your words to him" sub="அவருக்கு மட்டும் தெரியும்: ஒரு குறிப்பு, ஒரு hint, ஒரு வாழ்த்து." onClose={props.onClose}>
      <textarea class="f-replybox" rows={3} maxLength={200} value={t} aria-label="Your words" onInput={(e) => setT((e.target as HTMLTextAreaElement).value)} />
      <div class="f-ur-two">
        <button type="button" class="f-btn go" onClick={() => go(true)}>
          ✓ Right
        </button>
        {props.q && (
          <button type="button" class="f-btn white" onClick={() => go(false)}>
            ✗ Not right
          </button>
        )}
      </div>
    </Sheet>
  );
}

/**
 * A post or a doubt opened (a tap on its line, or on a phone alert: #us=id). `staff` = a teacher (her calls go to the
 * teachers' functions: net.ts); the server decides what each one sees.
 */
export function ThreadScreen(props: { id: string; staff?: boolean; onBack: () => void; onMate: (id: string) => void }) {
  const [d, setD] = useState<UsThread | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const [told, setTold] = useState<string[]>([]);
  const st = !!props.staff;
  const load = () =>
    query("us:thread", { id: props.id }).then(
      (x) => {
        setD(x as UsThread);
        setErr(null);
      },
      (e) => setErr(problemWords(e)),
    );
  useEffect(() => {
    void load();
  }, [props.id]);
  // After any change the Us tab reads its lines again when it opens.
  const after = () => {
    keep("usAt", 0);
    return load();
  };
  const act = (path: string, args: Record<string, unknown>, said?: string) =>
    mutation(path, { id: props.id, ...args }).then(
      () => {
        buzz();
        if (said) toast(said);
        return after();
      },
      (e) => toast(problemWords(e), true),
    );
  const twice = (key: string, go: () => unknown) => {
    if (sure !== key) return setSure(key);
    setSure(null);
    void go();
  };
  const report = (rid?: string) => {
    setTold([...told, rid ?? props.id]);
    void act("us:report", rid ? { rid } : {}, "⚑ நன்றி. ஆசிரியர்கள் பார்ப்பார்கள்.");
  };
  const m: UsItem | undefined = d?.m;
  const q = !!m?.qn;
  const ask = m?.k === "ask";
  const mine = d?.list.find((r) => r.mine && !r.tch);
  const teach = (r: UsReply): ComponentChildren =>
    st && (
      <div class="f-ur-acts">
        {!r.tch && !r.ask && (
          <button type="button" class={`f-ur-b ok${r.ok === true ? " on" : ""}`} aria-label="Right" aria-pressed={r.ok === true} onClick={() => void act("us:mark", { id: r.id, ok: r.ok === true ? null : true })}>
            ✓
          </button>
        )}
        {q && (
          <button type="button" class={`f-ur-b no${r.ok === false ? " on" : ""}`} aria-label="Not right" aria-pressed={r.ok === false} onClick={() => void act("us:mark", { id: r.id, ok: r.ok === false ? null : false })}>
            ✗
          </button>
        )}
        {!r.tch && !r.ask && (
          <button
            type="button"
            class="f-ur-b"
            aria-label="Your words"
            onClick={() => showSheet((close) => <NoteSheet r={r} q={q} onClose={close} onMark={(ok, note) => act("us:mark", { id: r.id, ok, note })} />)}
          >
            ✎
          </button>
        )}
        <span class="f-sp" />
        {r.rp ? (
          <button type="button" class="f-ur-b flag" onClick={() => void act("us:unflag", { rid: r.id }, "Kept.")}>
            ⚑ {r.rp} · Keep
          </button>
        ) : null}
        <button type="button" class="f-ur-b" aria-label="Remove" onClick={() => twice(r.id, () => act("us:drop", { rid: r.id }, "Removed."))}>
          {sure === r.id ? "Remove?" : <Icon name="bin" size={18} />}
        </button>
      </div>
    );

  return (
    <div class="f-ut">
      <header class="f-hero us">
        <div class="f-toprow">
          <button type="button" class="f-round on-brand" aria-label="Back" onClick={props.onBack}>
            <Icon name="back" size={20} />
          </button>
          <b class="f-ut-h">{!m ? "" : ask ? "🙋 Doubt" : q ? "❓ Question" : "📣 Post"}</b>
          <span class="f-sp" />
        </div>
      </header>
      {!d && !err && <Waiting />}
      {err && !d && <p class="f-lead f-center-t">{err}</p>}
      {d && m && (
        <>
          <article class="f-card f-ut-m rise">
            <p class="f-us-by">
              {ask
                ? m.mine
                  ? `🙋 உன் சந்தேகம் · ${AUD[m.aud ?? "t"]}`
                  : m.n
                    ? `🙋 ${m.n} · Grade ${m.g ?? "?"} · ${AUD[m.aud ?? "t"]}`
                    : `🙋 Grade ${m.g ?? "?"} மாணவர் ஒருவர் கேட்கிறார்`
                : `${m.by} ஆசிரியர் · ${gradesWords(m.gs)}`}
            </p>
            {m.t && <p class="f-us-post">{m.t}</p>}
            {m.ph && <Pics ph={m.ph} />}
            {st && ask && (
              <div class="f-ur-acts">
                <span class="f-sp" />
                {m.rp ? (
                  <button type="button" class="f-ur-b flag" onClick={() => void act("us:unflag", {}, "Kept.")}>
                    ⚑ {m.rp} · Keep
                  </button>
                ) : null}
                <button type="button" class="f-ur-b" aria-label="Remove the doubt" onClick={() => twice("m", () => act("us:drop", {}, "Removed.").then(props.onBack))}>
                  {sure === "m" ? "Remove the doubt?" : <Icon name="bin" size={18} />}
                </button>
              </div>
            )}
            {!st && d.can.report && !told.includes(props.id) && (
              <button type="button" class="f-ur-rep" onClick={() => report()}>
                ⚑ Report
              </button>
            )}
          </article>
          {q && !st && d.can.answer && (
            <section class="f-card f-ut-c rise" aria-label="Your answer">
              <h2 class="f-h2">✍️ உன் விடை</h2>
              <Composer
                ph="உன் விடையை இங்கே எழுது (அல்லது படம் எடு)"
                go="Send"
                say="🔒 ஒருமுறை மட்டும்: அனுப்பிய பின் மாற்ற முடியாது. உன் விடை ஆசிரியருக்கு மட்டும்; சரி என்றால், விடை அனுப்பிய எல்லோருக்கும் உன் பெயருடன் தெரியும்."
                crop="மஞ்சள் புள்ளிகளை இழு: உன் விடை மட்டும் பெட்டிக்குள் இருக்கட்டும்."
                onSend={(text, ph) => mutation("us:answer", { id: props.id, text, ph }).then(() => toast("✍️ அனுப்பியாயிற்று! ஆசிரியர் பார்ப்பார்.")).then(after)}
              />
            </section>
          )}
          {q && st && (
            <p class="f-ut-sum">
              {m.an ?? 0} answers · ✓ {m.okN ?? 0} · waiting {m.wN ?? 0}
            </p>
          )}
          {d.list.length > 0 && (
            <ol class="f-urs">
              {q && !st && mine && <li class="f-ur-head">உன் விடை</li>}
              {q && !st && mine && <Reply r={mine} staff={false} onMate={props.onMate} />}
              {q && !st && mine && mine.ok === undefined && <li class="f-ur-wait">⏳ ஆசிரியர் பார்த்ததும் இங்கே தெரியும்.</li>}
              {q && !st && d.list.some((r) => !r.mine) && <li class="f-ur-head">✓ சரியான விடைகள்</li>}
              {d.list
                .filter((r) => st || !q || !r.mine)
                .map((r) => (
                  <Reply key={r.id} r={r} staff={st} onMate={props.onMate}>
                    {teach(r)}
                    {!st && ask && !r.mine && !r.tch && !told.includes(r.id) && (
                      <button type="button" class="f-ur-rep" onClick={() => report(r.id)}>
                        ⚑ Report
                      </button>
                    )}
                  </Reply>
                ))}
            </ol>
          )}
          {q && !st && d.hidden > 0 && <Locks n={d.hidden} sent={!!mine} />}
          {ask && d.list.length === 0 && <p class="f-ut-none">இன்னும் பதில் இல்லை. {m.mine ? "பதில் வந்ததும் சொல்வோம்." : "முதல் பதில் நீயா?"}</p>}
          {ask && d.can.reply && (
            <section class="f-card f-ut-c rise" aria-label="Reply">
              <h2 class="f-h2">{st ? "💬 Your reply" : m.mine ? "💬 இன்னும் சொல்" : "💬 உதவு"}</h2>
              <Composer
                ph={m.mine ? "நன்றி, அல்லது இன்னொரு கேள்வி…" : "உன் விளக்கம்…"}
                go={st ? "Reply" : "Send"}
                say={st ? undefined : m.mine ? undefined : "🔒 உன் பெயர் ஆசிரியர்களுக்கு மட்டும். ஆசிரியர் சரி என்றால் எல்லோருக்கும் தெரியும்."}
                onSend={(text, ph) => mutation("us:reply", { id: props.id, text, ph }).then(after)}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** 🙋 His doubt: words and photos, and who sees it (teachers, seniors, both: his choice; Grade 11 and no grade: teachers). */
export function DoubtSheet(props: { grade: number | null; onClose: () => void; onDone: () => void }) {
  const top = props.grade === null || props.grade >= 11;
  const [aud, setAud] = useState<"t" | "s" | "ts">(top ? "t" : "ts");
  const opts: ["t" | "s" | "ts", string][] = [
    ["t", "Teachers"],
    ["s", "Seniors"],
    ["ts", "Both"],
  ];
  return (
    <Sheet title="🙋 Ask a doubt" sub="கேள்வியின் படம், உன் working, புரியாத இடம்: எழுது, படம் எடு." onClose={props.onClose} class="f-doubt">
      {!top && (
        <>
          <p class="f-doubt-l">யார் பார்க்கலாம்?</p>
          <div class="f-seg3" role="group" aria-label="Who sees it">
            {opts.map(([k, l]) => (
              <button
                key={k}
                type="button"
                class={aud === k ? "on" : ""}
                aria-pressed={aud === k}
                onClick={() => {
                  buzz();
                  setAud(k);
                }}
              >
                {l}
              </button>
            ))}
          </div>
          {aud !== "t" && <p class="f-doubt-l s">மூத்த மாணவர்கள் = Grade {props.grade! + 1}–11.</p>}
        </>
      )}
      <Composer
        ph="உன் சந்தேகம்…"
        go="Send"
        say="🔒 உன் பெயர் ஆசிரியர்களுக்கு மட்டும் தெரியும். ஆசிரியர்கள் எல்லாவற்றையும் பார்ப்பார்கள்."
        crop="மஞ்சள் புள்ளிகளை இழு: கேள்வி அல்லது உன் working மட்டும் பெட்டிக்குள்."
        onSend={(text, ph) =>
          mutation("us:doubt", { text, ph, aud }).then(() => {
            toast("🙋 அனுப்பியாயிற்று! பதில் வந்ததும் சொல்வோம்.");
            keep("usAt", 0);
            props.onDone();
            props.onClose();
          })
        }
      />
    </Sheet>
  );
}
