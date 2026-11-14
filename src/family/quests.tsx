// Home's day (14 Nov 2026, his "build completely" on the idea picture 09): a reason to come back tomorrow that is always
// learning. One of the parts right after the first screen (parts.ts: never import it straight); Home draws its older
// goal card until they are here. Its style is in profile.css (.f-dq*, .f-om*, .f-shd*, .f-coffer*, .f-bd).
// - Today's quests: the same three for everyone today (convex/lib/quests.ts), each with its bar; the three done = the
//   chest shakes, a tap opens it (a few coins, never XP), the owl with its body cheers. The card keeps everything the
//   goal card had: the Level he is on and START, his flame's line.
// - One more?: for 10 minutes after a Level (the reveal notes it), a nudge to do the next one now, never all evening.
// - The flame shield: a day without a Level and his flame stays; bought with coins, one at a time. After a night it
//   kept his flame, Home says so once.
// - The owl in the greeting has its body: it waves, it cheers when his flame is lit, it taps its foot with a clock
//   after 6 PM when his flame is not lit yet; a tap = a pose, five quick taps = dizzy.

import { useEffect, useState } from "preact/hooks";
import type { FamilyMe } from "../../convex/family";
import { slDayNo } from "../../convex/lib/day";
import type { Quest, QuestKind } from "../../convex/lib/quests";
import { keep, mutation, words } from "./net";
import { Confetti, nextPlay } from "./next";
import { Buddy, useBuddyTap, type Pose } from "./owlBody";
import { buzz, sound } from "./sound";
import { Coin, Flame, flameAtRisk, Gem, Icon, showSheet, toast } from "./ui";

/** How long "one more?" stays after a Level. */
export const ONE_MORE_MS = 10 * 60_000;
/** What the reveal notes when a Level is done on the phone (play.tsx Result): when, and which. */
export type OneMoreMark = { at: number; u: string; n: number };

const QUEST_WORDS: Record<QuestKind, (of: number) => string> = {
  lv: () => "ஒரு Level செய்",
  two: (of) => `${of} Levels செய்`,
  run: (of) => `${of} சரி தொடர்ச்சியாக`,
  right: (of) => `${of} சரியான விடைகள்`,
  xp: (of) => `${of} XP வெல்`,
};

function QuestIcon(props: { k: QuestKind }) {
  if (props.k === "xp") return <Gem size={18} />;
  return <Icon name={props.k === "right" ? "check" : props.k === "run" ? "star" : "play"} size={17} class={props.k === "run" ? "fill" : ""} />;
}

/** Midnight in Sri Lanka, from now: "7 h 48 min" (the quests end then). */
export function untilMidnight(now: number): string {
  const sl = 330 * 60_000;
  const left = 86_400_000 - ((now + sl) % 86_400_000);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** The flame shield (ARISTORA's own drawing): a purple shield with a gold rim keeping a flame. */
export function ShieldIcon(props: { size?: number }) {
  const n = props.size ?? 26;
  return (
    <svg class="f-shield" viewBox="0 0 24 24" width={n} height={n} aria-hidden="true">
      <path class="f-shield-b" d="M12 2.4 4.4 5.3v5.8c0 4.7 3.1 8.6 7.6 10.5 4.5-1.9 7.6-5.8 7.6-10.5V5.3z" />
      <path class="f-flame-o" d="M12 6.8c.6 2 3.4 3.2 3.4 6.3a3.4 3.4 0 0 1-6.8 0c0-1.6.8-2.5 1.6-3.3.2 1.3 1 1.8 1.5 1.8-.5-1.8-.2-3.4.3-4.8z" />
      <path class="f-flame-i" d="M12 12.2c.3.9 1.4 1.4 1.4 2.6a1.4 1.4 0 0 1-2.8 0c0-.7.4-1.1.8-1.5.1.4.4.6.6.6-.2-.6-.1-1.2 0-1.7z" />
    </svg>
  );
}

/** The chest (ARISTORA's own drawing): purple and gold; its lid opens. */
export function Coffer(props: { class?: string }) {
  return (
    <svg class={`f-coffer ${props.class ?? ""}`} viewBox="0 0 64 60" aria-hidden="true">
      <ellipse class="f-coffer-sh" cx="32" cy="55" rx="24" ry="4" />
      <g class="f-coffer-box">
        <rect class="f-coffer-b" x="7" y="26" width="50" height="26" rx="5" />
        <rect class="f-coffer-g" x="7" y="33" width="50" height="5" />
        <rect class="f-coffer-k" x="28" y="29" width="8" height="12" rx="2" />
      </g>
      <g class="f-coffer-lid">
        <path class="f-coffer-l" d="M7 28V20a12 12 0 0 1 12-12h26a12 12 0 0 1 12 12v8z" />
        <rect class="f-coffer-g" x="7" y="22" width="50" height="5" />
      </g>
    </svg>
  );
}

/** The chest opening over everything (the app's own sheet: the phone's Back closes it too). */
export function openChest(c: number, title: string): void {
  if (!showSheet((close) => <ChestOpen c={c} title={title} onClose={close} />)) toast(`+${c} coins!`);
}

/** The chest opening: coins burst out, the owl with its trophy, the coins it gave. Tap to close. */
export function ChestOpen(props: { c: number; title: string; onClose: () => void }) {
  useEffect(() => {
    sound("unlock");
    buzz([20, 40, 30]);
    const t = window.setTimeout(() => sound("perfect"), 520);
    const close = window.setTimeout(props.onClose, 6000);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(close);
    };
  }, []);
  return (
    <div class="f-dq-open" role="dialog" aria-label={`${props.c} coins`} onClick={props.onClose}>
      <div class="f-dq-sheet">
        <div class="f-dq-stage">
          <Confetti n={18} />
          <Coffer class="open" />
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} class="f-dq-fly" style={{ "--a": `${-63 + i * 18}deg`, "--t": `${180 + i * 40}ms` }}>
              <Coin size={22} />
            </span>
          ))}
          <Buddy pose="champ" class="f-dq-owl" />
        </div>
        <p class="f-kicker">{props.title}</p>
        <b class="f-dq-got">
          +{props.c} <Coin size={28} />
        </b>
        <p class="f-dq-say">Coins உன் Shop க்கு. நாளை மீண்டும் வா!</p>
        <button type="button" class="f-btn gold big">
          Continue
        </button>
      </div>
    </div>
  );
}

function QuestRow(props: { q: Quest }) {
  const { q } = props;
  const done = q.n >= q.of;
  return (
    <li class={`f-dq-q${done ? " done" : ""}`}>
      <span class="f-dq-ic">{done ? <Icon name="check" size={17} /> : <QuestIcon k={q.k} />}</span>
      <span class="f-dq-w">
        <b>{QUEST_WORDS[q.k](q.of)}</b>
        <i class="f-dq-bar">
          <i style={{ "--p": String(Math.min(1, q.n / q.of)) }} />
        </i>
      </span>
      <small class="f-dq-n">
        {Math.min(q.n, q.of)}/{q.of}
      </small>
    </li>
  );
}

/**
 * Today's quests with the chest, and the goal card's row (the Level he is on, START, his flame's line). `more`: "one
 * more?" is up with its own START (this one's row hides).
 */
function QuestCard(props: { me: FamilyMe; more: boolean; onPlay: () => void; onLearn: () => void; onChange: () => void }) {
  const { me } = props;
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const quests = me.quests;
  const next = nextPlay(me);
  const s = me.streak;
  const all = !!quests && quests.q.every((q) => q.n >= q.of);
  const left = quests ? quests.q.filter((q) => q.n < q.of).length : 0;
  const chest = !quests || quests.c <= 0 ? null : quests.open ? "opened" : all ? "ready" : "shut";
  const tapChest = () => {
    buzz();
    if (chest === "opened") return toast("இன்றைய பெட்டியைத் திறந்தாய். நாளை புதிய சவால்கள்!");
    if (chest !== "ready") {
      sound("wrong");
      return toast(`இன்னும் ${left} சவால்${left > 1 ? "கள்" : ""}: முடித்தால் பெட்டி திறக்கும்!`);
    }
    if (busy) return;
    setBusy(true);
    mutation("coins:chest")
      .then((r) => {
        openChest((r as { c: number }).c, "Today's quests");
        props.onChange();
      })
      .catch((e) => toast(words(e)))
      .finally(() => setBusy(false));
  };
  return (
    <section class={`f-dq f-card rise${s.today ? " lit" : ""}`} aria-label="Today's quests">
      {quests && quests.q.length > 0 && (
        <>
          <div class="f-dq-h">
            <p class="f-kicker">Today's quests</p>
            <small>⏳ {untilMidnight(now)}</small>
          </div>
          <ul class="f-dq-l">
            {quests.q.map((q) => (
              <QuestRow key={q.k} q={q} />
            ))}
          </ul>
          {chest && (
            <button type="button" class={`f-dq-chest ${chest}`} onClick={tapChest} aria-label={chest === "ready" ? "Open the chest" : "The chest"}>
              <Coffer class={chest === "opened" ? "open" : ""} />
              <span>
                <b>{chest === "ready" ? "பெட்டியைத் திற!" : chest === "opened" ? "இன்றைய பெட்டி திறந்தது" : "மூன்றும் முடித்தால் பெட்டி!"}</b>
                <small>{chest === "opened" ? "நாளை புதிய சவால்கள்" : chest === "ready" ? "Tap" : `இன்னும் ${left}`}</small>
              </span>
            </button>
          )}
        </>
      )}
      {!props.more && (
        <div class="f-dq-go">
          <div class="f-goal-w">
            {next ? (
              <b class="f-goal-t">
                Level {next.d} <small>· Stage {next.world.no}</small>
              </b>
            ) : (
              <b class="f-goal-t">இப்போது phone இல் Level இல்லை</b>
            )}
            {next && <small class="f-goal-s">{next.world.ta}</small>}
            <p class="f-goal-f">
              <Flame lit={s.today} size={17} />
              {s.today ? "இன்றைய தீ மூண்டது! இன்னொரு Level?" : s.days > 0 ? `இன்று ஒரு Level செய்தால் ${s.days + 1} நாள் தொடர்!` : "இன்று ஒரு Level செய்து தீயை மூட்டு!"}
            </p>
          </div>
          {next ? (
            <button type="button" class={`f-btn gold f-goal-b${s.today ? "" : " shine"}`} onClick={props.onPlay}>
              START
            </button>
          ) : (
            <button type="button" class="f-btn ghost f-goal-b" onClick={props.onLearn}>
              Learn
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** The time left of "one more?" (null when it is over, or no Level to play). */
function useOneMore(me: FamilyMe): number | null {
  const [now, setNow] = useState(() => Date.now());
  const mark = keep<OneMoreMark>("onemore");
  const left = mark && nextPlay(me) ? ONE_MORE_MS - (now - mark.at) : 0;
  useEffect(() => {
    if (left <= 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [left > 0]);
  return left > 0 ? left : null;
}

function OneMore(props: { me: FamilyMe; left: number; onPlay: () => void }) {
  const next = nextPlay(props.me)!;
  const q = props.me.quests;
  const todo = q ? q.q.filter((x) => x.n < x.of).length : 0;
  const s = Math.ceil(props.left / 1000);
  return (
    <section class="f-om f-card rise" aria-label="One more?">
      <div class="f-om-w">
        <p class="f-kicker">
          One more? <span class="f-om-t">{`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`}</span>
        </p>
        <b class="f-goal-t">
          Level {next.d} <small>· Stage {next.world.no}</small>
        </b>
        <small class="f-om-s">{q && q.c > 0 && todo > 0 && !q.open ? `இன்னும் ${todo} சவால்: பெட்டி அருகில்!` : "சூடாக இருக்கும்போதே இன்னொன்று!"}</small>
      </div>
      <button type="button" class="f-btn gold f-goal-b shine" onClick={props.onPlay}>
        Level {next.d} <Icon name="play" size={15} class="fill" />
      </button>
    </section>
  );
}

/**
 * The flame shield: on Home to buy (his flame of 2 days or more, none held), or the morning after it kept his flame;
 * in the Shop (`shop`) always, with the one he holds.
 */
export function ShieldCard(props: { me: FamilyMe; onChange: () => void; shop?: boolean }) {
  const { me } = props;
  const sh = me.shield;
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState(false);
  const today = slDayNo(Date.now());
  if (!sh) return null;
  if (props.shop && sh.has) {
    return (
      <section class="f-shd f-card rise" aria-label="Flame shield">
        <span class="f-shd-ic" aria-hidden="true">
          <ShieldIcon />
        </span>
        <span class="f-shd-w">
          <b>Flame shield ✓</b>
          <small>உன் தீக்கு shield உள்ளது: ஒரு நாள் தவறினால் அது காக்கும்.</small>
        </span>
      </section>
    );
  }
  if (!props.shop && sh.kept !== null && sh.kept >= today - 1 && !seen && !keep(`shieldSeen.${sh.kept}`)) {
    return (
      <section class="f-shd f-card rise saved" role="status">
        <span class="f-shd-ic" aria-hidden="true">
          <ShieldIcon />
        </span>
        <span class="f-shd-w">
          <b>நேற்று உன் shield உன் தீயைக் காத்தது!</b>
          <small>
            <Flame size={14} /> {me.streak.days} நாள் தொடர். இன்று ஒரு Level செய்!
          </small>
        </span>
        <button
          type="button"
          class="f-btn ghost sm"
          onClick={() => {
            keep(`shieldSeen.${sh.kept}`, 1);
            setSeen(true);
          }}
        >
          OK
        </button>
      </section>
    );
  }
  if (sh.has || sh.p <= 0 || (!props.shop && me.streak.days < 2)) return null;
  const coins = me.coins?.n ?? 0;
  const short = sh.p - coins;
  const buy = () => {
    buzz();
    if (short > 0) {
      sound("wrong");
      return toast(`இன்னும் ${short} coins வேண்டும். Level செய்தால் Monday coins!`);
    }
    if (!sure) {
      sound("tap");
      return setSure(true);
    }
    if (busy) return;
    setBusy(true);
    mutation("coins:buyShield", { p: sh.p })
      .then(() => {
        sound("unlock");
        toast("Shield உன்னிடம்! ஒரு நாள் தவறினாலும் தீ அணையாது.");
        props.onChange();
      })
      .catch((e) => toast(words(e)))
      .finally(() => {
        setBusy(false);
        setSure(false);
      });
  };
  return (
    <section class="f-shd f-card rise" aria-label="Flame shield">
      <span class="f-shd-ic" aria-hidden="true">
        <ShieldIcon />
      </span>
      <span class="f-shd-w">
        <b>Flame shield</b>
        <small>{me.streak.days > 0 ? `ஒரு நாள் தவறினாலும் உன் ${me.streak.days} நாள் தீ அணையாது.` : "ஒரு நாள் தவறினாலும் உன் தீ அணையாது."}</small>
      </span>
      <button type="button" class={`f-btn ${short > 0 ? "ghost" : sure ? "gold" : "white"} sm f-shd-b`} disabled={busy} onClick={buy}>
        {sure ? "வாங்கு?" : <><Coin size={16} /> {sh.p}</>}
      </button>
    </section>
  );
}

/**
 * Home's middle (in place of the goal card once the parts are here): "one more?" when it is up, today's quests and the
 * chest with the goal card's row, the flame shield.
 */
export function HomePlus(props: { me: FamilyMe | null; onPlay: () => void; onLearn: () => void; onChange: () => void }) {
  const me = props.me;
  if (!me) return null;
  return <HomeDay me={me} onPlay={props.onPlay} onLearn={props.onLearn} onChange={props.onChange} />;
}

function HomeDay(props: { me: FamilyMe; onPlay: () => void; onLearn: () => void; onChange: () => void }) {
  const left = useOneMore(props.me);
  return (
    <>
      {left !== null && <OneMore me={props.me} left={left} onPlay={props.onPlay} />}
      <QuestCard me={props.me} more={left !== null} onPlay={props.onPlay} onLearn={props.onLearn} onChange={props.onChange} />
      <ShieldCard me={props.me} onChange={props.onChange} />
    </>
  );
}

// ---- The owl with its body in Home's greeting ----

/** The greeting's owl: its pose from his day, a tap = another pose (five quick taps: dizzy). */
export function GreetOwl(props: { me: FamilyMe | null }) {
  const me = props.me;
  const base: Pose = !me ? "hello" : me.quests?.open ? "champ" : flameAtRisk(me.streak) ? "tick" : me.streak.today ? "yes" : "hello";
  const [pose, key, tap] = useBuddyTap(base);
  return (
    <span
      class="f-owlbadge tap greet f-bd"
      role="button"
      aria-label="The owl"
      onClick={(e) => {
        e.stopPropagation();
        tap();
      }}
    >
      <Buddy pose={pose} key={key} />
    </span>
  );
}
