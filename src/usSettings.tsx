// Settings → Community (7 Nov 2026), the owner's: Us on the students' phones (closed until he opens it), his welcome at
// the top of the tab, the owl's kinds, comments' XP (8 Nov 2026); and why Us exists and how it should feel (open the
// first time). Everything a
// teacher does in Us (👏, shout-outs, posts, pin, remove) is in the class app's own Us tab since the same evening (his
// voice note: "you build community in the setting, but this is for teachers ... the same UI UX"): src/usFrame.tsx.

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { PushWho } from "../convex/pushSubs";
import type { UsBoard } from "../convex/us";
import { OWL_KINDS, WELCOME_MAX, type UsKind } from "../convex/lib/us";
import { mutate } from "./backend";
import { useQuery } from "./live";
import { act, toast } from "./store";

const KIND_EN: Record<UsKind, string> = {
  bday: "Birthdays (00:10 on the day)",
  stage: "A whole Stage finished (at home or in class)",
  home1: "A first level from home (“welcome to learning at home”)",
  back: "Back in class after 2 weeks or more",
  flame: "Days in a row: 7, 14, 30, 50, 100",
  up: "The week's most improved (Sunday night)",
  champs: "Each grade's weekly coins winner (Monday)",
  count: "How many learned yesterday (every morning)",
  post: "Posts",
  shout: "Shout-outs",
  ask: "Students' doubts",
  learn: "Students' 💡 posts",
  rank: "A new rank (gone since 11 Nov)",
  lgup: "Who moved up a league (gone since 11 Nov)",
  upm: "The month's most improved (the 1st)",
  gift: "A gift you gave by hand (with your reason)",
  goat: "A new GOAT (ARISTORA's all-time #1, every grade)",
};

function seenWhy(): boolean {
  try {
    return localStorage.getItem("aristora.usWhy") === "1";
  } catch {
    return false;
  }
}

function WhyCard(props: { owner: boolean }) {
  const [open] = useState(() => !seenWhy());
  useEffect(() => {
    try {
      localStorage.setItem("aristora.usWhy", "1");
    } catch {
      /* private mode */
    }
  }, []);
  return (
    <details class="us-why" open={open}>
      <summary>
        <b>Why Us, and how it should feel</b>
      </summary>
      <p>
        Students learn alone at home. <b>Us</b> is the tab on their phones where every student sees the whole ARISTORA
        learning with him, and is seen: a birthday, a first level from home, a Stage finished, back after a break, days
        in a row. The owl writes most lines by itself, from what students do in class and at home.
      </p>
      <p>
        <b>How it should feel:</b> every student seen, nobody shamed. We praise effort, not only marks. Us never shows
        marks and never shows who didn't learn. One tap is enough (🎂 wish, 👋 welcome, 👏 cheer, 🙏 thank you), and every
        line opens into its talk: students write under it, reply to each other and give 👏, with their names, like in the
        hall. They also ask doubts and post 💡 what they learned (everyone sees it once a teacher ticks it).
      </p>
      <p>
        <b>What you do, two minutes a day:</b>
      </p>
      <p>
        <b>Where:</b> the <b>Us</b> tab at the bottom of this app, every teacher's: the students' screens as they see them.
      </p>
      <ol>
        <li>Tap 👏 on today's lines, first the birthdays, the first levels from home and the welcome-backs. Your name shows on the phones and the student gets an alert.</li>
        <li>Give 2 or 3 shout-outs a day, for what the app can't see: never gives up, helped a friend, clear working. Start with students who never had one.</li>
        <li>With the Community tick: one short post a day, a tip, a reminder or a well done to a grade. Never name a student who did badly.</li>
        <li>⚑ To do: tick the right answers, reply to doubts, show the good 💡 posts (✓), and correct a wrong explanation with ✎ (everyone reads your correction, with your name). Remove anything unkind.</li>
      </ol>
      {props.owner && (
        <p class="muted">
          You: open Us on the phones below when you are ready (read your welcome first), and tick the teachers who may post in Settings → People → Community.
        </p>
      )}
    </details>
  );
}

/**
 * Online explanations (12 Nov 2026): how many wrong questions a student may send a day. His answer: no limit (the photo
 * he must take first is the brake); this is the switch for the night the teachers have too many.
 */
function HelpLimit() {
  const saved = useQuery<number>(api.help.limit, {});
  const [n, setN] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = n ?? (saved ? String(saved) : "");
  const next = Number(shown || 0);
  const ok = Number.isInteger(next) && next >= 0 && next <= 50;
  return (
    <div class="us-open">
      <span>
        <b>Online explanations a day</b>
        <small class="muted">
          {saved ? `Each student may send ${saved} wrong ${saved === 1 ? "question" : "questions"} a day (Explain online, after Check).` : "No limit: a student may send every wrong question (each needs a photo of his working)."} Empty or 0 = no limit.
        </small>
      </span>
      <input class="us-num" type="number" inputMode="numeric" min={0} max={50} placeholder="no limit" aria-label="Online explanations a student may send a day" value={shown} onInput={(e) => setN((e.target as HTMLInputElement).value)} />
      <button
        type="button"
        class="btn ghost"
        disabled={busy || saved === undefined || !ok || next === (saved ?? 0)}
        onClick={() => {
          setBusy(true);
          void act(async () => {
            await mutate(api.help.setLimit, { n: next });
            setN(null);
            toast(next ? `At most ${next} a day for each student.` : "No limit a day.");
          }).finally(() => setBusy(false));
        }}
      >
        Save
      </button>
    </div>
  );
}

function OwnerCard(props: { b: UsBoard }) {
  const cfg = props.b.cfg;
  const [w, setW] = useState(cfg.welcome);
  const [busy, setBusy] = useState(false);
  const run = (args: { open?: boolean; welcome?: string; off?: UsKind[]; cxp?: boolean }, said: string) => {
    setBusy(true);
    void act(async () => {
      await mutate(api.us.setCfg, args);
      toast(said);
    }).finally(() => setBusy(false));
  };
  return (
    <section class="us-card">
      <div class="us-open">
        <span>
          <b>Us on the students' phones</b>
          <small class="muted">{cfg.open ? "Open: every student's phone has the Us tab." : "Closed: the owl already writes the lines; students see the tab once you open it."}</small>
        </span>
        <button type="button" class={`btn ${cfg.open ? "ghost" : "primary"}`} disabled={busy} onClick={() => run({ open: !cfg.open }, cfg.open ? "Us closed on the phones." : "Us is open on every phone.")}>
          {cfg.open ? "Close" : "Open"}
        </button>
      </div>
      <label class="us-field">
        <b>Your welcome</b>
        <small class="muted">At the top of the tab, in your words (Tamil, English or both).</small>
        <textarea rows={5} maxLength={WELCOME_MAX} value={w} onInput={(e) => setW((e.target as HTMLTextAreaElement).value)} />
      </label>
      <button type="button" class="btn ghost wide" disabled={busy || w.trim() === cfg.welcome} onClick={() => run({ welcome: w }, "Welcome saved.")}>
        Save the welcome
      </button>
      <div class="us-open">
        <span>
          <b>Comments give XP</b>
          <small class="muted">
            {cfg.cxp
              ? "On: +1 XP for a comment in the student's own words (two words at least, not a one-tap word, not the same words again), 20 a day at most. A comment you remove takes its XP back."
              : "Off: comments give no XP. What a teacher ticks still does (+5 an answer, +10 help on a doubt, +5 a 💡 post)."}
          </small>
        </span>
        <button type="button" class={`btn ${cfg.cxp ? "ghost" : "primary"}`} disabled={busy} onClick={() => run({ cxp: !cfg.cxp }, cfg.cxp ? "Comments give no XP now." : "Comments give XP again.")}>
          {cfg.cxp ? "Turn off" : "Turn on"}
        </button>
      </div>
      <HelpLimit />
      <b class="us-sub">What the owl writes by itself</b>
      <div class="us-kinds">
        {OWL_KINDS.map((k) => {
          const on = !cfg.off.includes(k);
          return (
            <label key={k} class="phq-req">
              <input
                type="checkbox"
                checked={on}
                disabled={busy}
                onChange={() => run({ off: on ? [...cfg.off, k] : cfg.off.filter((x) => x !== k) }, on ? "Turned off." : "Turned on.")}
              />
              <span>{KIND_EN[k]}</span>
            </label>
          );
        })}
      </div>
    </section>
  );
}

/** Names by grade, the grade as a number only: "8 Hana, Raj · 9 Nila". */
function byGrade(rows: PushWho[]) {
  const gs = [...new Set(rows.map((r) => r.g))];
  return gs.map((g) => (
    <span key={String(g)} class="us-who-g">
      <b>{g ?? "?"}</b> {rows.filter((r) => r.g === g).map((r) => r.n).join(", ")}
    </span>
  ));
}

/**
 * Phone alerts: who is reached (12 Nov 2026, the founder: "the notification sometimes not reaching the students"). An
 * alert goes only to a phone whose student turned alerts on, and until now nothing said who never did. The count, then
 * the names to fix in class: alerts off, failing, no phone signed in.
 */
function AlertsCard() {
  const who = useQuery<PushWho[]>(api.pushSubs.who, {});
  if (!who) return null;
  const of = (st: PushWho["st"]) => who.filter((r) => r.st === st);
  const on = of("on");
  const part = (label: string, rows: PushWho[], cls: string) =>
    rows.length ? (
      <p class={`us-who ${cls}`}>
        <b>
          {label} · {rows.length}
        </b>
        {byGrade(rows)}
      </p>
    ) : null;
  return (
    <section class="us-card" aria-label="Phone alerts">
      <b>
        Phone alerts: {on.length} of {who.length} students are reached
      </b>
      <small class="muted">
        A student hears nothing until alerts are on in his app. In class: open his app → the gold “அறிவிப்புகளை இயக்கு” button → Allow → the bell → “Test அனுப்பு” → lock the phone: it must ring within 10 seconds. The volume and the sound are set on the phone (the bell's page says how).
      </small>
      {part("Alerts off (app on a phone)", of("off"), "red")}
      {part("On, but the last alert failed", of("bad"), "amber")}
      {part("No phone signed in", of("none"), "")}
    </section>
  );
}

export function UsSettings() {
  const b = useQuery<UsBoard>(api.us.board, {});
  return (
    <div class="settings-body us">
      <WhyCard owner={!!b?.owner} />
      <AlertsCard />
      {!b ? <p class="muted">Loading…</p> : <OwnerCard b={b} />}
    </div>
  );
}
