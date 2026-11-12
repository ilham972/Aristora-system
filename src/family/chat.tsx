// Groups and private chats in Us (8 Nov 2026). His voice note: "My students want to forget the WhatsApp when it comes to
// the community ... we need group which was in the community, like a Discord ... the app don't have private messaging
// options ... the girl students and boy students can't message each other ... teacher can message anyone". His answers:
// boys and girls together in groups (like the hall), teachers make groups, each grade its own (convex/chat.ts).
// - ChatList: his groups (his grade's first) or his private chats: the last words, when, how many new.
// - RoomScreen: a group or a private chat: the messages as in a line's talk (talk.tsx: reply with a quote, @tags,
//   reactions), by day, read every few seconds while it is open; the words box at the bottom.
// - PeopleScreen (the Members page, his step 8): everyone in ARISTORA, teachers first, and 💬 where his rule allows.
// - AllChats: the owner reads every private chat. GroupSheet: a teacher with the Community tick makes or changes a group.
// Its own file (chatParts.ts, later.ts useChatParts): never in the first load.

import { useEffect, useRef, useState } from "preact/hooks";
import type { ChatHead, ChatLine, ChatMsg, ChatPeople, ChatPerson, ChatRoom } from "../../convex/chat";
import { keep, mutation, query } from "./net";
import { picOf, usePics } from "./pics";
import { buzz, sound } from "./sound";
import { AskSheet, HelpList, HelpMenu, HelpTop, Voice, VoiceRec } from "./help";
import { agoShort, Bubble, jumpTo, ReactorsSheet, WriteBar, type Sent, type Taggable } from "./talk";
import { Avatar, Icon, Owl, problemWords, Sheet, showSheet, toast, Waiting } from "./ui";
import { Pics } from "./usPost";

/** An open chat reads again this often (only what is new); the lists less often. */
const ROOM_MS = 4000;
const LIST_MS = 15_000;
/** A message's letters (convex/lib/chat.ts CHAT_MAX). */
const CHAT_MAX = 500;
const GRADES = [6, 7, 8, 9, 10, 11];
/** A copy of convex/lib/chat.ts GROUP_EMOJIS. */
const GROUP_EMOJIS = ["📚", "🧮", "📐", "✏️", "🧠", "🎯", "🏆", "💡", "📣", "🌟", "🦉", "🔥"];
const SL = 330 * 60_000;
const dayNo = (t: number) => Math.floor((t + SL) / 86_400_000);

type Rooms = { groups: ChatLine[]; dms: ChatLine[]; edit?: boolean; owner?: boolean };

/** A chat's picture: a group's emoji (a grade's group: its number), or the other person's face. */
function RoomFace(props: { r: Pick<ChatLine, "emo" | "gg" | "name" | "pic" | "tch"> & { k: "g" | "d" | "h" }; big?: boolean }) {
  const r = props.r;
  // An online explanation's thread (12 Nov 2026).
  if (r.k === "h") return <span class="c-gface" aria-hidden="true">🎧</span>;
  if (r.k === "g")
    return (
      <span class={`c-gface${props.big ? " big" : ""}${r.gg !== undefined && !r.emo ? " grade" : ""}`} aria-hidden="true">
        {r.emo ?? (r.gg !== undefined ? r.gg : "👥")}
      </span>
    );
  return (
    <span class={`c-dface${r.tch ? " tch" : ""}`}>
      <Avatar name={r.name} size={props.big ? "m" : "m"} pic={picOf(r.pic)} />
    </span>
  );
}

function Row(props: { r: ChatLine; onOpen: () => void }) {
  const r = props.r;
  return (
    <li>
      <button type="button" class={`c-row${r.un ? " new" : ""}`} onClick={props.onOpen}>
        <RoomFace r={r} />
        <span class="c-row-w">
          <b>
            {r.name}
            {r.tch && <i class="f-msg-tag">ஆசிரியர்</i>}
            {r.g !== undefined && r.k === "d" && <i class="f-gchip">{r.g}</i>}
            {r.ro && <i class="c-ro">📣</i>}
          </b>
          <small>{r.lt ? `${r.mine ? "நீ" : (r.ln ?? "")}: ${r.lt}` : r.k === "g" ? "இன்னும் யாரும் எழுதவில்லை: முதலில் நீ! 👋" : "வணக்கம் சொல் 👋"}</small>
        </span>
        <span class="c-row-r">
          {r.la ? <small>{agoShort(r.la)}</small> : null}
          {r.un ? <i class="c-un">{r.un > 20 ? "20+" : r.un}</i> : r.blk ? <i class="c-blk">⛔</i> : null}
        </span>
      </button>
    </li>
  );
}

/** A student's (or a teacher's) groups or private chats, newest first; the lists read again while on screen. */
export function ChatList(props: { kind: "g" | "d"; staff: boolean; onRoom: (id: string) => void; onPeople: () => void; onAll?: () => void }) {
  const [d, setD] = useState<Rooms | null>(() => keep<Rooms>("chatRooms"));
  const load = () =>
    query("chat:rooms").then(
      (x) => {
        keep("chatRooms", x);
        setD(x as Rooms);
      },
      () => {},
    );
  useEffect(() => {
    void load();
    const t = window.setInterval(() => document.visibilityState === "visible" && void load(), LIST_MS);
    return () => window.clearInterval(t);
  }, []);
  const list = props.kind === "g" ? d?.groups : d?.dms;
  usePics((list ?? []).map((r) => r.pic));
  return (
    <section class="c-list" aria-label={props.kind === "g" ? "Groups" : "Chats"}>
      <div class="c-tools">
        {props.kind === "d" && (
          <button type="button" class="f-btn go c-new" onClick={props.onPeople}>
            <Icon name="plus" size={18} /> {props.staff ? "New chat" : "புதிய chat"}
          </button>
        )}
        {props.kind === "g" && props.staff && d?.edit && (
          <button type="button" class="f-btn go c-new" onClick={() => showSheet((close) => <GroupSheet onClose={close} onDone={(id) => (void load(), props.onRoom(id))} />)}>
            <Icon name="plus" size={18} /> New group
          </button>
        )}
        {props.kind === "g" && (
          <button type="button" class="f-btn white c-new" onClick={props.onPeople}>
            <Icon name="people" size={18} /> Members
          </button>
        )}
        {props.kind === "d" && props.staff && d?.owner && props.onAll && (
          <button type="button" class="f-btn white c-new" onClick={props.onAll}>
            <Icon name="eye" size={18} /> Every chat
          </button>
        )}
      </div>
      {props.kind === "d" && <HelpList staff={props.staff} onRoom={props.onRoom} />}
      {!d ? (
        <Waiting />
      ) : !list?.length ? (
        <div class="f-talk-none">
          <Owl mood="wave" class="tiny" still />
          <p>{props.kind === "d" ? (props.staff ? "No chats yet. Tap New chat to message a student or a teacher." : "இன்னும் chat இல்லை. புதிய chat: ஆசிரியர் அல்லது நண்பருக்கு எழுது! 💬") : "குழுக்கள் இன்னும் இல்லை."}</p>
        </div>
      ) : (
        <ul class="c-rows">
          {list.map((r) => (
            <Row key={r.id} r={r} onOpen={() => props.onRoom(r.id)} />
          ))}
        </ul>
      )}
      {props.kind === "d" && !props.staff && <p class="c-safe">🛡️ ARISTORA பாதுகாப்புக்காக chats ஐப் பார்க்கலாம். நல்ல வார்த்தைகள் மட்டும்; தொலைபேசி எண்கள், links வேண்டாம்.</p>}
    </section>
  );
}

/** The owner: every private chat (to read; only the two write in it). */
export function AllChats(props: { onBack: () => void; onRoom: (id: string) => void }) {
  const [list, setList] = useState<ChatLine[] | null>(null);
  useEffect(() => {
    query("chat:tall").then(
      (x) => setList(x as ChatLine[]),
      (e) => toast(problemWords(e), true),
    );
  }, []);
  return (
    <div class="c-scr">
      <header class="f-hero us">
        <div class="f-toprow">
          <button type="button" class="f-round on-brand" aria-label="Back" onClick={props.onBack}>
            <Icon name="back" size={20} />
          </button>
          <b class="f-ut-h">👁 Every private chat</b>
        </div>
      </header>
      <p class="c-safe">Only you see this list. The students are told ARISTORA can read chats.</p>
      {!list ? (
        <Waiting />
      ) : (
        <ul class="c-rows">
          {list.map((r) => (
            <Row key={r.id} r={r} onOpen={() => props.onRoom(r.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** "இன்று", "நேற்று", "8 Nov": a day's line between messages. */
function dayWords(t: number): string {
  const d = dayNo(Date.now()) - dayNo(t);
  if (d === 0) return "இன்று";
  if (d === 1) return "நேற்று";
  return new Date(t + SL).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** A group or a private chat, open. */
export function RoomScreen(props: { id: string; staff: boolean; me?: string; onBack: () => void; onMate: (id: string) => void }) {
  const [head, setHead] = useState<ChatHead | null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [re, setRe] = useState<{ id: string; n: string; t?: string } | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const [told, setTold] = useState<string[]>([]);
  const [blk, setBlk] = useState(false);
  const ref = useRef({ head: null as ChatHead | null, msgs: [] as ChatMsg[], read: 0, busy: false });
  ref.current.head = head;
  ref.current.msgs = msgs;
  const nearEnd = () => window.innerHeight + window.scrollY > document.body.scrollHeight - 160;
  const toEnd = (smooth = true) => window.setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: smooth ? "smooth" : "auto" }), 40);
  const markRead = (list: ChatMsg[]) => {
    const last = list[list.length - 1];
    const h = ref.current.head;
    if (!last || last.at <= ref.current.read || h?.look) return;
    ref.current.read = last.at;
    if (!last.mine) void mutation("chat:read", { id: props.id }).catch(() => {});
  };
  const load = async (first = false) => {
    const r = ref.current;
    if (r.busy) return;
    r.busy = true;
    try {
      const last = r.msgs[r.msgs.length - 1];
      const x = (await query("chat:room", { id: props.id, ...(last && r.head && !first ? { since: last.at, rv: r.head.rv } : {}) })) as ChatRoom;
      const end = nearEnd();
      // A short read (only what is new) doesn't count the group again: the count from before stays.
      // An explanation's question card comes on a full read only: the one from before stays too.
      setHead({ ...x.head, ...(x.head.members === undefined && r.head?.members ? { members: r.head.members } : {}), ...(x.head.help === undefined && r.head?.help ? { help: r.head.help } : {}) });
      setErr(null);
      if (x.full) {
        setMsgs(x.msgs);
        setMore(x.more);
        markRead(x.msgs);
        if (first) toEnd(false);
      } else if (x.msgs.length) {
        const have = new Set(r.msgs.map((m) => m.id));
        const add = x.msgs.filter((m) => !have.has(m.id));
        if (add.length) {
          const next = [...r.msgs, ...add];
          setMsgs(next);
          markRead(next);
          if (add.some((m) => !m.mine)) sound("tweet");
          if (end) toEnd();
        }
      }
    } catch (e) {
      setErr(problemWords(e));
    } finally {
      r.busy = false;
    }
  };
  useEffect(() => {
    void load(true);
    const t = window.setInterval(() => document.visibilityState === "visible" && void load(), ROOM_MS);
    return () => window.clearInterval(t);
  }, [props.id]);
  const earlier = async () => {
    const first = msgs[0];
    if (!first) return;
    try {
      const x = (await query("chat:room", { id: props.id, before: first.at })) as ChatRoom;
      setMsgs([...x.msgs, ...msgs]);
      setMore(x.more);
    } catch (e) {
      toast(problemWords(e), true);
    }
  };
  usePics([head?.pic, ...msgs.map((m) => m.pic)]);
  const byId = new Map(msgs.map((m) => [m.id, m]));
  const react = (m: ChatMsg, e: string | null) => {
    const rx = { ...(m.rx ?? {}) };
    if (m.my) rx[m.my] = Math.max(0, (rx[m.my] ?? 1) - 1);
    if (e) rx[e] = (rx[e] ?? 0) + 1;
    for (const k of Object.keys(rx)) if (!rx[k]) delete rx[k];
    setMsgs(msgs.map((x) => (x.id === m.id ? { ...x, rx, my: e ?? undefined } : x)));
    mutation("chat:react", { cid: m.id, e }).then(
      () => void load(),
      (err) => toast(problemWords(err), true),
    );
  };
  const send = async (text: string, ph: Sent[], mt: string[], au?: { f: string; d: number }) => {
    const r = (await mutation("chat:send", { id: props.id, ...(text ? { text } : {}), ...(ph.length ? { ph } : {}), ...(re ? { re: re.id } : {}), ...(mt.length ? { mt } : {}), ...(au ? { au } : {}) })) as { id: string; at: number };
    setRe(null);
    await load();
    toEnd();
    return r;
  };
  const drop = (m: ChatMsg) => {
    if (sure !== m.id) return setSure(m.id);
    setSure(null);
    mutation("chat:tdrop", { cid: m.id }).then(
      () => {
        toast("Removed.");
        setMsgs(msgs.filter((x) => x.id !== m.id));
      },
      (e) => toast(problemWords(e), true),
    );
  };
  // People he can tag: whoever wrote here lately first (never himself; students only: a tag tells a student), then the
  // group's other students, fetched the first time he types @ (the Members list: a grade's group = that grade).
  const [members, setMembers] = useState<Taggable[] | null>(null);
  const askMembers = () => {
    const h = ref.current.head;
    if (members || !h || h.k !== "g") return;
    setMembers([]);
    query("chat:people").then(
      (x) => {
        const inIt = (g?: number) => g !== undefined && (h.gg === g || !!h.gs?.includes(g));
        setMembers((x as ChatPeople).st.filter((p) => !p.me && inIt(p.g)).map((p) => ({ id: p.w.slice(2), n: p.n, ...(p.pic ? { pic: p.pic } : {}), ...(p.g !== undefined ? { g: p.g } : {}) })));
      },
      () => setMembers(null),
    );
  };
  const people: Taggable[] = [];
  for (const m of [...msgs].reverse()) {
    if (m.mine || m.tch || !m.w.startsWith("s:") || people.some((p) => p.id === m.w.slice(2))) continue;
    people.push({ id: m.w.slice(2), n: m.n, ...(m.pic ? { pic: m.pic } : {}), ...(m.g !== undefined ? { g: m.g } : {}) });
  }
  for (const p of members ?? []) if (!people.some((x) => x.id === p.id)) people.push(p);
  const sub = !head
    ? ""
    : head.look
      ? "👁 Reading as the owner"
      : head.k === "h"
        ? head.help
          ? `Stage ${head.help.no} · Level ${head.help.n}${props.staff ? ` · ${head.help.open} waiting` : ` · ${head.help.tname}`}`
          : ""
        : head.k === "g"
        ? `${head.members ? `${head.members} மாணவர்கள் + ஆசிரியர்கள்` : "மாணவர்கள் + ஆசிரியர்கள்"}${head.ro ? " · 📣 ஆசிரியர்கள் மட்டும் எழுதுவார்கள்" : ""}`
        : head.tch
          ? "ஆசிரியர்"
          : head.g !== undefined
            ? `Grade ${head.g}`
            : "";
  const sid = head?.w?.startsWith("s:") ? head.w.slice(2) : undefined;
  return (
    <div class="c-scr c-room">
      <header class="f-hero us c-head">
        <div class="f-toprow">
          <button type="button" class="f-round on-brand" aria-label="Back" onClick={props.onBack}>
            <Icon name="back" size={20} />
          </button>
          {head && (
            <button type="button" class="c-head-w" disabled={!sid && !(head.k === "g" && head.can.edit)} onClick={() => (sid ? props.onMate(sid) : head.can.edit ? showSheet((close) => <GroupSheet id={props.id} onClose={close} onDone={() => void load(true)} />) : undefined)}>
              <RoomFace r={head} />
              <span>
                <b>{head.name}</b>
                <small>{sub}</small>
              </span>
            </button>
          )}
          <span class="f-sp" />
          {head?.k === "h" && head.help && props.staff && (
            // His words: "not put as big button, because mistakenly teachers can press that. So just put three dot."
            <button type="button" class="f-round on-brand h-more" aria-label="Explained, Not now, Send to another teacher" onClick={() => showSheet((close) => <HelpMenu id={props.id} help={head.help!} onClose={close} onChange={() => void load(true)} />)}>
              ⋮
            </button>
          )}
          {head?.k === "g" && head.can.edit && (
            <button type="button" class="f-round on-brand" aria-label="Edit the group" onClick={() => showSheet((close) => <GroupSheet id={props.id} onClose={close} onDone={() => void load(true)} />)}>
              <Icon name="pen" size={18} />
            </button>
          )}
          {head?.k === "d" && !props.staff && sid && (
            <button
              type="button"
              class="f-round on-brand"
              aria-label={head.blk ? "Unblock" : "Block"}
              onClick={() => {
                // Blocking asks a second tap (a child's finger slips); unblocking is one.
                if (!head.blk && !blk) {
                  setBlk(true);
                  window.setTimeout(() => setBlk(false), 4000);
                  return toast("⛔ தடுக்க மீண்டும் தொடு: இவர் இனி உனக்கு எழுத முடியாது.");
                }
                setBlk(false);
                mutation("chat:block", { id: props.id, on: !head.blk }).then(
                  () => {
                    toast(head.blk ? "🔓 மீண்டும் திறந்தது." : "⛔ தடுத்தாயிற்று. ஆசிரியர்கள் இதைப் பார்க்க முடியும்.");
                    void load(true);
                  },
                  (e) => toast(problemWords(e), true),
                );
              }}
            >
              {head.blk ? "🔓" : "⛔"}
            </button>
          )}
        </div>
      </header>
      {!head && !err && <Waiting />}
      {err && !head && <p class="f-lead f-center-t">{err}</p>}
      {head && (
        <>
          {head.k === "h" && head.help && (
            <HelpTop
              id={props.id}
              help={head.help}
              staff={props.staff}
              onChange={() => void load(true)}
              onMate={props.onMate}
              onPhoto={() => showSheet((close) => <AskSheet unitId={head.help!.unitId} q={head.help!.q} onClose={close} onDone={() => (close(), void load(true))} />)}
            />
          )}
          {head.k === "d" && !head.look && <p class="c-safe">🛡️ {props.staff ? "The owner can read private chats (the students are told)." : "ARISTORA பாதுகாப்புக்காக chats ஐப் பார்க்கலாம். நல்ல வார்த்தைகள் மட்டும்."}</p>}
          {more && (
            <button type="button" class="f-btn white c-more" onClick={() => void earlier()}>
              ↑ Earlier
            </button>
          )}
          {!msgs.length ? (
            <div class="f-talk-none">
              <Owl mood="wave" class="tiny" still />
              <p>{head.k === "h" ? (props.staff ? "Nothing here yet." : "இன்னும் எதுவும் இல்லை.") : head.k === "g" ? (props.staff ? "Nobody has written yet: say hello." : "இன்னும் யாரும் எழுதவில்லை. முதலில் நீ: வணக்கம் சொல்! 👋") : props.staff ? "Say hello." : "வணக்கம் சொல் 👋"}</p>
            </div>
          ) : (
            <ol class="f-msgs c-msgs">
              {msgs.flatMap((m, i) => {
                const prev = msgs[i - 1];
                const q = m.re ? byId.get(m.re) : undefined;
                const out = [];
                if (!prev || dayNo(prev.at) !== dayNo(m.at)) out.push(<li key={`d${m.at}`} class="c-day"><span>{dayWords(m.at)}</span></li>);
                out.push(
                  <Bubble
                    key={m.id}
                    x={{ id: m.id, at: m.at, n: m.mine ? "நீ" : m.n, ...(m.w.startsWith("s:") ? { sid: m.w.slice(2) } : {}), ...(m.pic ? { pic: m.pic } : {}), ...(m.tch ? { tch: true } : {}), ...(m.mine ? { mine: true } : {}), ...(m.t ? { t: m.t } : {}), ...(m.mt ? { mt: m.mt } : {}), ...(m.rx ? { rx: m.rx } : {}), ...(m.my ? { my: m.my } : {}) }}
                    cls={`${m.re ? "re" : ""}${prev && prev.w === m.w && m.at - prev.at < 5 * 60_000 && dayNo(prev.at) === dayNo(m.at) ? " cont" : ""}`}
                    tags={
                      <>
                        {m.tch && <i class="f-msg-tag">ஆசிரியர்</i>}
                        {m.ask && <i class="f-msg-tag h-asktag">📷 {props.staff ? "his working" : "வழிமுறை"}</i>}
                        {!m.tch && head.k === "g" && m.g !== undefined && <i class="f-gchip">{m.g}</i>}
                      </>
                    }
                    quote={m.re ? (q ? { n: q.mine ? "நீ" : q.n, ...(q.t ? { t: q.t } : {}), ph: !!q.ph?.length } : null) : undefined}
                    onQuote={() => m.re && jumpTo(m.re)}
                    pics={
                      <>
                        {m.ph && <Pics ph={m.ph} />}
                        {m.hid && <p class="h-hid">🙈 படம் மறைக்கப்பட்டுள்ளது</p>}
                        {m.au && <Voice au={m.au} />}
                        {/* A teacher's link (a video she made or found, his words: "they can record the video and put the YouTube ... link"). */}
                        {m.tch && head.k === "h" && (m.t?.match(/https?:\/\/[^\s]+/g) ?? []).slice(0, 3).map((u) => (
                          <a key={u} class="h-link" href={u} target="_blank" rel="noopener noreferrer">
                            ▶ {u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 38)}
                          </a>
                        ))}
                      </>
                    }
                    me={props.me}
                    onMate={props.onMate}
                    onReply={head.can.write ? () => setRe({ id: m.id, n: m.mine ? "நீ" : m.n, ...(m.t ? { t: m.t } : {}) }) : undefined}
                    onReact={head.look ? undefined : (e) => react(m, e)}
                    onWho={() => showSheet((close) => <ReactorsSheet load={() => query("chat:reactors", { cid: m.id }) as Promise<never>} onClose={close} />)}
                    acts={
                      props.staff ? (
                        <>
                          <span class="f-sp" />
                          {m.rp ? (
                            <button type="button" class="f-ur-b flag" onClick={() => void mutation("chat:tkeep", { cid: m.id }).then(() => load(true), (e) => toast(problemWords(e), true))}>
                              ⚑ {m.rp} · Keep
                            </button>
                          ) : null}
                          {(head.k === "g" || m.mine || head.look) && (
                            <button type="button" class="f-ur-b" aria-label="Remove" onClick={() => drop(m)}>
                              {sure === m.id ? "Remove?" : <Icon name="bin" size={18} />}
                            </button>
                          )}
                        </>
                      ) : !m.mine && !m.tch && !told.includes(m.id) ? (
                        <>
                          <span class="f-sp" />
                          <button
                            type="button"
                            class="f-msg-rep"
                            aria-label="Report"
                            onClick={() => {
                              setTold([...told, m.id]);
                              mutation("chat:report", { cid: m.id }).then(
                                () => toast("⚑ நன்றி. ஆசிரியர்கள் பார்ப்பார்கள்."),
                                (e) => toast(problemWords(e), true),
                              );
                            }}
                          >
                            ⚑
                          </button>
                        </>
                      ) : undefined
                    }
                  />,
                );
                return out;
              })}
            </ol>
          )}
          {head.can.write ? (
            <WriteBar
              max={CHAT_MAX}
              hint={props.staff ? "Write…" : "எழுது…"}
              photos={head.can.photos}
              re={re}
              onUnRe={() => setRe(null)}
              people={head.k === "g" ? people : undefined}
              onAt={head.k === "g" ? askMembers : undefined}
              onSend={send}
              extra={head.k === "h" ? <VoiceRec staff={props.staff} max={props.staff ? 120 : 60} onSend={(au) => send("", [], [], au)} /> : undefined}
            />
          ) : (
            <p class="c-cant">{head.look ? "👁 Only the two of them write here." : (head.can.why ?? "இங்கே இப்போது எழுத முடியாது.")}</p>
          )}
        </>
      )}
    </div>
  );
}

/** The Members page: teachers, then every student by grade; 💬 where his rule allows; a student's name: his profile. */
export function PeopleScreen(props: { staff: boolean; onBack: () => void; onRoom: (id: string) => void; onMate: (id: string) => void }) {
  const [d, setD] = useState<ChatPeople | null>(() => keep<ChatPeople>("chatPeople"));
  const [find, setFind] = useState("");
  const [g, setG] = useState<number | "t" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    query("chat:people").then(
      (x) => {
        keep("chatPeople", x);
        setD(x as ChatPeople);
      },
      (e) => toast(problemWords(e), true),
    );
  }, []);
  const f = find.trim().toLowerCase();
  const fits = (p: ChatPerson) => !f || p.n.toLowerCase().includes(f);
  const tch = (d?.tch ?? []).filter((p) => (g === null || g === "t") && fits(p));
  const st = g === "t" ? [] : (d?.st ?? []).filter((p) => (g === null || g === p.g) && fits(p));
  usePics([...tch, ...st].slice(0, 80).map((p) => p.pic));
  const open = async (p: ChatPerson) => {
    if (busy) return;
    setBusy(p.w);
    buzz();
    try {
      const r = (await mutation("chat:dm", { to: p.w })) as { id: string };
      props.onRoom(r.id);
    } catch (e) {
      toast(problemWords(e), true);
    } finally {
      setBusy(null);
    }
  };
  const person = (p: ChatPerson) => (
    <li key={p.w} class={p.me ? "me" : ""}>
      <button type="button" class="c-pp" disabled={!p.w.startsWith("s:")} onClick={() => props.onMate(p.w.slice(2))}>
        <Avatar name={p.n} size="s" pic={picOf(p.pic)} />
        <b>{p.n}</b>
        {p.tch ? <i class="f-msg-tag">ஆசிரியர்</i> : p.g !== undefined ? <i class="f-gchip">{p.g}</i> : null}
        {p.me && <i class="c-you">நீ</i>}
      </button>
      {p.m && !p.me ? (
        <button type="button" class="c-dm" aria-label={`Message ${p.n}`} disabled={busy === p.w} onClick={() => void open(p)}>
          {busy === p.w ? "…" : "💬"}
        </button>
      ) : null}
    </li>
  );
  return (
    <div class="c-scr">
      <header class="f-hero us">
        <div class="f-toprow">
          <button type="button" class="f-round on-brand" aria-label="Back" onClick={props.onBack}>
            <Icon name="back" size={20} />
          </button>
          <b class="f-ut-h">
            👥 Members {d ? <small>{d.tch.length + d.st.length}</small> : null}
          </b>
        </div>
      </header>
      {!props.staff && d && (
        <p class="c-rule">
          {d.sex === "b"
            ? "💬 நீ ஆசிரியர்களுடனும் மற்ற மாணவர்களுடனும் (ஆண்கள்) message செய்யலாம்: எந்த grade ஆனாலும்."
            : d.sex === "g"
              ? "💬 நீ ஆசிரியர்களுடனும் மற்ற மாணவிகளுடனும் message செய்யலாம்: எந்த grade ஆனாலும்."
              : "💬 இப்போது ஆசிரியர்களுடன் மட்டும் message செய்யலாம். (ARISTORA உன் விவரத்தைச் சேர்த்ததும் நண்பர்களுடனும்.)"}
        </p>
      )}
      <div class="c-find">
        <input type="search" placeholder={props.staff ? "Find a name" : "பெயரைத் தேடு"} aria-label="Find a name" value={find} onInput={(e) => setFind((e.target as HTMLInputElement).value)} />
      </div>
      <div class="c-chips" role="group" aria-label="Who">
        <button type="button" class={g === null ? "on" : ""} onClick={() => setG(null)}>
          All
        </button>
        <button type="button" class={g === "t" ? "on" : ""} onClick={() => setG("t")}>
          ஆசிரியர்
        </button>
        {GRADES.map((x) => (
          <button key={x} type="button" class={g === x ? "on" : ""} onClick={() => setG(x)}>
            {x}
          </button>
        ))}
      </div>
      {!d ? (
        <Waiting />
      ) : (
        <ul class="c-people">
          {tch.length > 0 && <li class="c-ph">ஆசிரியர்கள்</li>}
          {tch.map(person)}
          {st.flatMap((p, i) => [...(i === 0 || st[i - 1].g !== p.g ? [<li key={`g${p.g}`} class="c-ph">Grade {p.g ?? "?"}</li>] : []), person(p)])}
        </ul>
      )}
    </div>
  );
}

/** A teacher (the Community tick) makes or changes a group: name, emoji, grades, students picked, who writes. */
function GroupSheet(props: { id?: string; onClose: () => void; onDone: (id: string) => void }) {
  const [name, setName] = useState("");
  const [emo, setEmo] = useState(GROUP_EMOJIS[0]);
  const [gs, setGs] = useState<number[]>([]);
  const [sids, setSids] = useState<{ id: string; n: string; g?: number }[]>([]);
  const [ro, setRo] = useState(false);
  const [gg, setGg] = useState<number | undefined>(undefined);
  const [find, setFind] = useState("");
  const [all, setAll] = useState<ChatPerson[]>([]);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    query("chat:people").then((x) => setAll((x as ChatPeople).st), () => {});
    if (props.id)
      query("chat:tgroupInfo", { id: props.id }).then(
        (x) => {
          const i = x as { name: string; emo: string; gs: number[]; sids: { id: string; n: string; g?: number }[]; ro: boolean; gg?: number };
          setName(i.name);
          if (i.emo) setEmo(i.emo);
          setGs(i.gs);
          setSids(i.sids);
          setRo(i.ro);
          setGg(i.gg);
        },
        (e) => toast(problemWords(e), true),
      );
  }, []);
  const f = find.trim().toLowerCase();
  const found = f ? all.filter((p) => p.n.toLowerCase().includes(f) && !sids.some((s) => `s:${s.id}` === p.w)).slice(0, 6) : [];
  const save = async () => {
    setBusy(true);
    try {
      const r = (await mutation("chat:tgroup", { ...(props.id ? { id: props.id } : {}), name, emo, gs, sids: sids.map((s) => s.id), ro })) as { id: string };
      sound("send");
      toast(props.id ? "Saved." : "👥 Group made: its students see it now.");
      props.onClose();
      props.onDone(r.id);
    } catch (e) {
      toast(problemWords(e), true);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!sure) return setSure(true);
    try {
      await mutation("chat:tgroupDrop", { id: props.id });
      toast("Removed.");
      props.onClose();
      props.onDone("");
    } catch (e) {
      toast(problemWords(e), true);
    }
  };
  return (
    <Sheet title={props.id ? (gg !== undefined ? `Grade ${gg}'s group` : "Change the group") : "👥 New group"} sub="Every teacher is in every group. Students see the groups of their grade and the ones they are picked for." onClose={props.onClose} class="c-gsheet">
      {gg === undefined && <input class="c-gname" maxLength={40} placeholder="Name: O/L doubts, Grade 11 algebra…" aria-label="Name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />}
      <div class="c-emos" role="group" aria-label="Emoji">
        {GROUP_EMOJIS.map((e) => (
          <button key={e} type="button" class={emo === e ? "on" : ""} onClick={() => setEmo(e)}>
            {e}
          </button>
        ))}
      </div>
      {gg === undefined && (
        <>
          <p class="c-lab">Grades in it</p>
          <div class="c-chips">
            {GRADES.map((x) => (
              <button key={x} type="button" class={gs.includes(x) ? "on" : ""} onClick={() => setGs(gs.includes(x) ? gs.filter((y) => y !== x) : [...gs, x].sort((a, b) => a - b))}>
                {x}
              </button>
            ))}
          </div>
          <p class="c-lab">And these students</p>
          <div class="c-picked">
            {sids.map((s) => (
              <button key={s.id} type="button" onClick={() => setSids(sids.filter((x) => x.id !== s.id))}>
                {s.n} ✕
              </button>
            ))}
          </div>
          <input type="search" class="c-gname" placeholder="Add a student: type a name" aria-label="Add a student" value={find} onInput={(e) => setFind((e.target as HTMLInputElement).value)} />
          {found.length > 0 && (
            <ul class="c-found">
              {found.map((p) => (
                <li key={p.w}>
                  <button
                    type="button"
                    onClick={() => {
                      setSids([...sids, { id: p.w.slice(2), n: p.n, ...(p.g !== undefined ? { g: p.g } : {}) }]);
                      setFind("");
                    }}
                  >
                    + {p.n} {p.g !== undefined && <i class="f-gchip">{p.g}</i>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <label class="c-ro-l">
        <input type="checkbox" checked={ro} onChange={(e) => setRo((e.target as HTMLInputElement).checked)} />
        <span>📣 Only teachers write (students read and react)</span>
      </label>
      <div class="f-ur-two">
        <button type="button" class="f-btn go" disabled={busy || (gg === undefined && (!name.trim() || (!gs.length && !sids.length)))} onClick={() => void save()}>
          {props.id ? "Save" : "Make the group"}
        </button>
        {props.id && gg === undefined && (
          <button type="button" class="f-btn white" onClick={() => void remove()}>
            {sure ? "Remove it and its messages?" : "Remove"}
          </button>
        )}
      </div>
    </Sheet>
  );
}
