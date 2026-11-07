// Settings → Community (7 Nov 2026, his voice notes: "teachers also don't know how to use this, how this is want to feel
// for both teachers and students, how they have to direct it ... why we build this"; then "Aristora family app don't
// have teachers ... you know better than me"). Teachers keep their own sign-in: the students' Us tab comes here.
// - Why Us, how it should feel and what a teacher does in two minutes a day (open the first time, a tap later).
// - The owner: Us on the phones (closed until he opens it), his welcome at the top of the tab, the owl's kinds.
// - Any teacher: a shout-out (a student, a reason from the list: no free words, so no tick needed) and 👏 on any line
//   (her name shows on the phones; the student's phone gets an alert).
// - The owner and the Community tick: a post to everyone or one grade (with starters), pin, remove.
// - What the students see, every grade's lines (the owl's kinds the owner turned off are not there).

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { UsBoard, UsBoardItem } from "../convex/us";
import { OWL_KINDS, POST_MAX, SHOUT_WHY, WELCOME_MAX, type UsKind } from "../convex/lib/us";
import { mutate } from "./backend";
import type { View } from "./derive";
import { useQuery } from "./live";
import { act, toast } from "./store";
import { GRADES, GradeRow, useGrade } from "./ui";

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
};

/** Starters for a post (the teacher finishes the sentence). */
const STARTERS: [string, string][] = [
  ["Tip", "💡 இன்றைய குறிப்பு: "],
  ["Well done", "👏 வாழ்த்துக்கள்! "],
  ["Reminder", "⏰ நினைவூட்டல்: "],
  ["Challenge", "🎯 இந்த வார சவால்: "],
];

/** A line in English, as the teachers' page shows it. */
function lineWords(m: UsBoardItem): string {
  const who = m.n ? `${m.n}${m.g !== undefined ? ` (${m.g})` : ""}` : "";
  const ppl = (m.ppl ?? []).map((p) => `${m.k === "champs" ? (p.a ? "🏆 " : "👑 ") : ""}${p.n}${p.g !== undefined ? ` (${p.g})` : ""}`).join(", ");
  switch (m.k) {
    case "bday":
      return `🎂 ${who}'s birthday`;
    case "home1":
      return `🏠 ${who}: first level from home`;
    case "back":
      return `👋 ${who} is back in class`;
    case "stage":
      return `🏁 ${who} finished ${m.x !== undefined ? `Stage ${m.x} · ` : ""}${m.t ?? ""}`;
    case "flame":
      return `🔥 ${who}: ${m.x} days in a row`;
    case "up":
      return `🚀 Most improved this week: ${ppl}`;
    case "champs":
      return `👑 Last week's champions: ${ppl}`;
    case "count":
      return `🔥 ${m.x} students learned yesterday`;
    case "shout":
      return `🌟 ${m.by} → ${who}: ${SHOUT_WHY[m.t ?? ""]?.en ?? ""}`;
    case "post":
      return `📣 ${m.by}${m.to !== undefined ? ` to Grade ${m.to}` : ""}: ${m.t ?? ""}`;
  }
}

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

function ShoutCard(props: { views: View[]; shouted: string[] }) {
  const [grade, setGrade] = useGrade("aristora.usGrade", () => 8);
  const [who, setWho] = useState<Id<"students"> | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const kids = props.views
    .map((v) => v.s)
    .filter((s) => !s.archived && !s.demo && !s.test && s.grade === grade)
    .sort((a, b) => Number(b.present) - Number(a.present) || a.name.localeCompare(b.name));
  const send = () => {
    if (!who || !why) return;
    setBusy(true);
    void act(async () => {
      await mutate(api.us.shout, { studentId: who, why });
      toast("Shout-out sent: it's on every phone, and his phone tells him.");
      setWho(null);
      setWhy(null);
    }).finally(() => setBusy(false));
  };
  return (
    <section class="us-card">
      <b>🌟 Give a shout-out</b>
      <small class="muted">For what the app can't see. Students in class today come first.</small>
      <GradeRow value={grade} onPick={(g) => (setGrade(g), setWho(null))} label="Grade" grades={GRADES} />
      <div class="chip-pick us-kids" role="group" aria-label="Student">
        {kids.length === 0 && <small class="muted">No students in this grade.</small>}
        {kids.map((s) => (
          <button key={s._id} type="button" class={who === s._id ? "on" : ""} aria-pressed={who === s._id} onClick={() => setWho(s._id)}>
            {s.name}
            {props.shouted.includes(s._id) ? " ✓" : ""}
          </button>
        ))}
      </div>
      <div class="chip-pick us-grid2" role="group" aria-label="Reason">
        {Object.entries(SHOUT_WHY).map(([k, x]) => (
          <button key={k} type="button" class={why === k ? "on" : ""} aria-pressed={why === k} onClick={() => setWhy(k)}>
            {x.en}
          </button>
        ))}
      </div>
      <button type="button" class="btn primary wide" disabled={busy || !who || !why} onClick={send}>
        Send the shout-out
      </button>
    </section>
  );
}

function PostCard() {
  const [to, setTo] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [pin, setPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = () => {
    setBusy(true);
    void act(async () => {
      await mutate(api.us.post, { text, ...(to !== null ? { to } : {}), ...(pin ? { pin: true } : {}) });
      toast(to === null ? "Posted to everyone." : `Posted to Grade ${to}.`);
      setText("");
      setPin(false);
    }).finally(() => setBusy(false));
  };
  return (
    <section class="us-card">
      <b>📣 Post to the students</b>
      <div class="chip-pick us-to" role="group" aria-label="To">
        <button type="button" class={to === null ? "on" : ""} aria-pressed={to === null} onClick={() => setTo(null)}>
          Everyone
        </button>
        {GRADES.map((g) => (
          <button key={g} type="button" class={to === g ? "on" : ""} aria-pressed={to === g} onClick={() => setTo(g)}>
            {g}
          </button>
        ))}
      </div>
      <div class="chip-pick us-grid2" role="group" aria-label="Start with">
        {STARTERS.map(([label, start]) => (
          <button key={label} type="button" onClick={() => setText(start + STARTERS.reduce((t, [, s]) => (t.startsWith(s) ? t.slice(s.length) : t), text))}>
            {label}
          </button>
        ))}
      </div>
      <label class="us-field">
        <textarea rows={4} maxLength={POST_MAX} value={text} placeholder="A tip, a reminder, a well done…" onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
        <small class="muted">
          {text.length}/{POST_MAX}
        </small>
      </label>
      <label class="phq-req">
        <input type="checkbox" checked={pin} onChange={() => setPin(!pin)} />
        <span>Keep it on top of the tab (pinned)</span>
      </label>
      <button type="button" class="btn primary wide" disabled={busy || !text.trim()} onClick={send}>
        Post
      </button>
    </section>
  );
}

function FeedCard(props: { b: UsBoard }) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = (id: string, go: () => Promise<unknown>) => {
    setBusy(id);
    void act(go).finally(() => setBusy(null));
  };
  const items = props.b.items;
  return (
    <section class="us-card">
      <b>What the students see</b>
      <small class="muted">
        {props.b.today > 0 ? `${props.b.today} learned today` : "Nobody learned yet today"}
        {props.b.yesterday > 0 ? ` · ${props.b.yesterday} yesterday` : ""}. Every grade's lines (a post to one grade shows only there).
      </small>
      {items.length === 0 && <p class="muted">No lines yet: the owl writes them as students learn.</p>}
      <ul class="us-list">
        {items.map((m) => {
          const clapable = m.k !== "count" && !m.tme;
          return (
            <li key={m.id} class={m.pin ? "pin" : ""}>
              <span class="us-w">
                {m.pin && "📌 "}
                {lineWords(m)}
                <small class="muted">
                  {new Date(m.at).toLocaleString("en-GB", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Colombo" })}
                  {m.c > 0 ? ` · 👏 ${m.c}` : ""}
                  {m.tc?.length ? ` · ${m.tc.join(", ")}` : ""}
                </small>
              </span>
              <span class="us-acts">
                {m.k !== "count" && (
                  <button
                    type="button"
                    class={`btn small ${m.tme ? "primary" : "ghost"}`}
                    disabled={!clapable || busy === m.id}
                    aria-label={m.tme ? "You cheered" : "Cheer"}
                    onClick={() => run(m.id, () => mutate(api.us.tclap, { id: m.id as Id<"usMoments"> }))}
                  >
                    👏
                  </button>
                )}
                {props.b.post && (
                  <button
                    type="button"
                    class="btn small ghost"
                    disabled={busy === m.id}
                    aria-label={m.pin ? "Unpin" : "Pin on top"}
                    onClick={() => run(m.id, () => mutate(api.us.pin, { id: m.id as Id<"usMoments">, on: !m.pin }))}
                  >
                    {m.pin ? "Unpin" : "📌"}
                  </button>
                )}
                {props.b.post && (
                  <button
                    type="button"
                    class="btn small ghost"
                    disabled={busy === m.id}
                    aria-label="Remove from every phone"
                    onClick={() => run(m.id, async () => {
                      await mutate(api.us.remove, { id: m.id as Id<"usMoments"> });
                      toast("Removed from every phone.");
                    })}
                  >
                    ✕
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function UsSettings(props: { views: View[] }) {
  const b = useQuery<UsBoard>(api.us.board, {});
  return (
    <div class="settings-body us">
      <WhyCard owner={!!b?.owner} />
      {!b ? (
        <p class="muted">Loading…</p>
      ) : (
        <>
          {b.owner && <OwnerCard b={b} />}
          <ShoutCard views={props.views} shouted={b.shouted} />
          {b.post && <PostCard />}
          <FeedCard b={b} />
        </>
      )}
    </div>
  );
}
