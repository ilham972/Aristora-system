// Settings → Community (7 Nov 2026), the owner's: Us on the students' phones (closed until he opens it), his welcome at
// the top of the tab, the owl's kinds; and why Us exists and how it should feel (open the first time). Everything a
// teacher does in Us (👏, shout-outs, posts, pin, remove) is in the class app's own Us tab since the same evening (his
// voice note: "you build community in the setting, but this is for teachers ... the same UI UX"): src/usFrame.tsx.

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
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
  champs: "Last week's champions (Monday)",
  count: "How many learned yesterday (every morning)",
  post: "Posts",
  shout: "Shout-outs",
  ask: "Students' doubts",
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
        marks and never shows who didn't learn. Students never type: they tap one button, 🎂 wish, 👋 welcome, 👏 cheer,
        🙏 thank you.
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
      </ol>
      {props.owner && (
        <p class="muted">
          You: open Us on the phones below when you are ready (read your welcome first), and tick the teachers who may post in Settings → People → Community.
        </p>
      )}
    </details>
  );
}

function OwnerCard(props: { b: UsBoard }) {
  const cfg = props.b.cfg;
  const [w, setW] = useState(cfg.welcome);
  const [busy, setBusy] = useState(false);
  const run = (args: { open?: boolean; welcome?: string; off?: UsKind[] }, said: string) => {
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

export function UsSettings() {
  const b = useQuery<UsBoard>(api.us.board, {});
  return (
    <div class="settings-body us">
      <WhyCard owner={!!b?.owner} />
      {!b ? <p class="muted">Loading…</p> : <OwnerCard b={b} />}
    </div>
  );
}
