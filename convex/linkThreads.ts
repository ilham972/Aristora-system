// The threads link (20 Nov 2026, his ask: "so many pendings and so many follow-ups and I don't have time to put the
// message to them ... create the link feature ... same like that [the books link] ... access the thread tabs chats
// also ... so you can clear everything"). The owner turns it on in Settings → Community (a code of its own: it never
// reads or changes a book, and the books link never reads a thread). A Claude chat holding its code reads the open
// threads and answers them through the Claude link's sealed carrier (convex/link.ts: `ask` "threads" and "thread",
// `tell` "reply"; the chat's side: scripts/threads.ts):
// - "threads" = every open thread: its question, level and teacher, and each student waiting in it with where he stands
//   (Pending, Follow-up and his reply, Understood: convex/lib/help.ts helpStage);
// - "thread" = one thread whole: the question as printed, the key part by part with each part's marks, what each
//   student typed (right or wrong part by part) and his marks, the messages (a voice note or a photo is named, never
//   sent: the chat can't hear or see them);
// - "reply" = a message into the thread under ARISTORA AI from the owner's account (as her 🤖's are), ringing every
//   student still waiting. It counts as the owner's answer (`tw`: Pending → Follow-up, the 12 hours stop), which the
//   AI by itself never does (it waits on a teacher); `done` = his ✓ Understood with it: who said he understood is
//   closed (explained), the rest close with their own ✓ tap. `seen` = the thread's message count when the chat read
//   it: anyone wrote since, the reply is refused (read it again), so nobody is answered twice or out of date.
// Never a mark, a key, a book or a student's row: only messages and the two ✓ of the thread.

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { AI_NAME } from "./ai";
import { explained, keyParts, printed, say } from "./help";
import { asMaster, bookFor, keyRow } from "./lib/backend";
import { studentPerson } from "./lib/chat";
import { asksIn, helpStage, type HelpStage, isLate } from "./lib/help";
import { basesOf, keyQOf, labelIn, piecesOf } from "./lib/helpParts";
import { helpHeadOf } from "./lib/helpView";
import { phoneKeyFor } from "./lib/homeWork";
import { keyText } from "./lib/photos";
import { alertStudent } from "./lib/push";
import { clip } from "./lib/usTalk";

/** A reply is at most this long (a thread's bubble: short, his ask "they never read big phrases"). */
export const LINK_REPLY_MAX = 1500;
/** The messages one "thread" read carries (the newest). */
export const LINK_MSGS = 60;

type Ask = Doc<"helpAsks">;
type Unit = { key: string; grade: number; code: string; en: string; ta: string };

/** One student waiting in a thread, as the chat sees him. */
export type LinkAsk = {
  aid: string;
  sid: string;
  n: string;
  g?: number;
  sg: HelpStage;
  rp?: true;
  /** He tapped ✓ I understood; a teacher tapped ✓ Understood; a teacher asked for his photo; his photo came. */
  su?: true;
  tu?: true;
  pw?: true;
  ph: boolean;
  /** Waiting on its teacher since; a teacher's last word; his last word. */
  ta: number;
  tw?: number;
  sw?: number;
  late?: true;
  from: "s" | "t";
};

export type LinkThreadLine = {
  id: string;
  unit: Unit;
  /** Its level and question. */
  lvl: number;
  q: number;
  /** The teacher it waits on. */
  tname: string;
  la: number;
  /** Its messages so far (send it back as a reply's `seen`). */
  msgs: number;
  lt?: string;
  ln?: string;
  asks: LinkAsk[];
};

const unitOf = (u: Doc<"units"> | null): Unit => ({ key: u?.key ?? "?", grade: u?.grade ?? 0, code: u?.code ?? "", en: u?.en ?? "", ta: u?.ta ?? "" });

/** Which first in the list: a Pending one, then a reply waiting, then Follow-up, then Understood; the oldest first. */
const RANK: Record<HelpStage, number> = { pend: 0, fol: 2, und: 3, closed: 4 };
const rankOf = (a: LinkAsk) => (a.sg === "fol" && a.rp ? 1 : RANK[a.sg]);

async function askLine(ctx: QueryCtx, a: Ask, now: number): Promise<LinkAsk | null> {
  const p = await studentPerson(ctx, a.sid);
  if (!p || p.demo) return null;
  return {
    aid: a._id,
    sid: a.sid,
    n: p.n,
    ...(p.g !== undefined ? { g: p.g } : {}),
    ...helpStage(a),
    ...(a.su ? { su: true as const } : {}),
    ...(a.tu ? { tu: true as const } : {}),
    ...(a.pw ? { pw: true as const } : {}),
    ph: a.ph,
    ta: a.ta,
    ...(a.tw !== undefined ? { tw: a.tw } : {}),
    ...(a.sw !== undefined ? { sw: a.sw } : {}),
    ...(isLate(a, now) ? { late: true as const } : {}),
    from: a.from,
  };
}

/** Every open thread (real students only), the ones waiting on a teacher first. */
export async function linkThreads(ctx: QueryCtx, now: number): Promise<LinkThreadLine[]> {
  const open = await ctx.db
    .query("helpAsks")
    .withIndex("by_st", (x) => x.eq("st", "open"))
    .collect();
  const byRoom = new Map<string, Ask[]>();
  for (const a of open) if (!a.demo) byRoom.set(a.rid, [...(byRoom.get(a.rid) ?? []), a]);
  const units = new Map<string, Unit>();
  const names = new Map<string, string>();
  const out: LinkThreadLine[] = [];
  for (const [rid, rows] of byRoom) {
    const r = await ctx.db.get(rid as Id<"usRooms">);
    if (!r || r.k !== "h" || r.demo || !r.hu || r.hq === undefined) continue;
    const asks: LinkAsk[] = [];
    for (const a of rows.sort((x, y) => x.ta - y.ta)) {
      const l = await askLine(ctx, a, now);
      if (l) asks.push(l);
    }
    if (!asks.length) continue;
    if (!units.has(r.hu)) units.set(r.hu, unitOf(await ctx.db.get(r.hu)));
    const tid = r.ht ?? rows[0].tid;
    if (!names.has(tid)) names.set(tid, (await ctx.db.get(tid))?.name ?? "—");
    out.push({
      id: r._id,
      unit: units.get(r.hu)!,
      lvl: r.hn ?? 0,
      q: r.hq,
      tname: names.get(tid)!,
      la: r.la,
      msgs: r.n,
      ...(r.lt ? { lt: r.lt } : {}),
      ...(r.ln ? { ln: r.ln } : {}),
      asks,
    });
  }
  const first = (l: LinkThreadLine) => Math.min(...l.asks.map(rankOf));
  const since = (l: LinkThreadLine) => Math.min(...l.asks.map((a) => a.ta));
  return out.sort((a, b) => first(a) - first(b) || since(a) - since(b));
}

/** A message as the chat reads it: who (a student, a teacher, the AI), the words, a voice note's seconds, photos. */
type LinkMsg = { at: number; who: "s" | "t" | "ai"; n: string; t?: string; voice?: number; photos?: number; ask?: true; pt?: string; to?: string[] };

/** One thread whole (`css`: the book's style too, to draw the question). */
export async function linkThread(ctx: QueryCtx, id: unknown, uid: Id<"users">, now: number, css: boolean) {
  const rid = typeof id === "string" ? ctx.db.normalizeId("usRooms", id) : null;
  const r = rid ? await ctx.db.get(rid) : null;
  if (!r || r.k !== "h" || r.demo || !r.hu || r.hq === undefined) return { ok: false as const, error: "No such thread." };
  const head = await helpHeadOf(ctx, { k: "u", uid }, r, now);
  if (!head) return { ok: false as const, error: "No such thread." };
  const rows = await asksIn(ctx, r._id);
  const lines = new Map<string, LinkAsk>();
  for (const a of rows) {
    const l = await askLine(ctx, a, now);
    if (l) lines.set(a._id, l);
  }
  const book = await bookFor(ctx, r.hu, "master");
  const key = book ? await keyRow(ctx, r.hu, "master") : null;
  const raw = key?.answers.find((a) => a.q === r.hq);
  const k = book && key ? (await phoneKeyFor(ctx, r.hu, asMaster(book), key.answers)).get(r.hq) : undefined;
  const kp = keyParts(raw, k);
  const page = await printed(ctx, r);
  const msgs = (
    await ctx.db
      .query("usChat")
      .withIndex("by_room", (x) => x.eq("rid", r._id))
      .order("desc")
      .take(LINK_MSGS)
  ).reverse();
  return {
    ok: true as const,
    id: r._id,
    msgs: r.n,
    unit: unitOf(await ctx.db.get(r.hu)),
    lvl: r.hn ?? 0,
    q: r.hq,
    tname: head.tname,
    html: page.html,
    ...(css ? { css: page.css } : {}),
    key: keyText(raw) || null,
    max: k?.max ?? null,
    kp: kp.map((x, i) => ({ ...x, m: k?.parts[i]?.m ?? null })),
    // Each student: where he stands, his marks, what he typed part by part, his photo of a teacher's part (named only).
    asks: head.asks.map((a) => {
      const l = lines.get(a.id);
      return {
        ...(l ?? { aid: a.id, n: a.n, sg: a.sg, ph: a.ph, from: a.from }),
        st: a.st,
        ...(a.got !== undefined ? { got: a.got } : {}),
        ...(a.max !== undefined ? { max: a.max } : {}),
        ...(a.parts ? { parts: a.parts } : {}),
        ...(a.photo ? { photo: { st: a.photo.st, max: a.photo.max, photos: a.photo.urls.length, ...(a.photo.got !== undefined ? { got: a.photo.got } : {}), ...(a.photo.said ? { said: true } : {}) } } : {}),
        ...(a.by ? { by: a.by } : {}),
      };
    }),
    talk: msgs.map(
      (m): LinkMsg => ({
        at: m.at,
        who: m.n === AI_NAME ? "ai" : m.sid ? "s" : "t",
        n: m.n,
        ...(m.t ? { t: m.t } : {}),
        ...(m.au ? { voice: m.au.d } : {}),
        ...(m.ph?.length ? { photos: m.ph.length } : {}),
        ...(m.ak ? { ask: true as const } : {}),
        ...(m.pt ? { pt: m.pt } : {}),
        ...(m.mt?.length ? { to: m.mt.map((x) => x.n) } : {}),
      }),
    ),
  };
}

/** A reply of the threads link into a thread (the owner's, under ARISTORA AI): see the top of this file. */
export async function linkReply(ctx: MutationCtx, uid: Id<"users"> | undefined, req: Record<string, unknown>, now: number) {
  const u = uid ? await ctx.db.get(uid) : null;
  if (!u || !u.active || u.role !== "owner") return { ok: false as const, error: "Turn the threads link on again (Settings → Community)." };
  const t = typeof req.text === "string" ? req.text.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : "";
  if (!t) return { ok: false as const, error: "A reply needs its words (text)." };
  if (t.length > LINK_REPLY_MAX) return { ok: false as const, error: `At most ${LINK_REPLY_MAX} letters: this is ${t.length}. Shorter (they never read long ones).` };
  const rid = typeof req.id === "string" ? ctx.db.normalizeId("usRooms", req.id) : null;
  const r = rid ? await ctx.db.get(rid) : null;
  if (!r || r.k !== "h" || r.demo || !r.hu || r.hq === undefined) return { ok: false as const, error: "No such thread." };
  if (typeof req.seen === "number" && req.seen !== r.n) return { ok: false as const, error: `Q${r.hq}: someone wrote in this thread since you read it. Read it again.` };
  const open: Ask[] = [];
  for (const a of await asksIn(ctx, r._id)) {
    if (a.st !== "open" || a.demo) continue;
    const s = await ctx.db.get(a.sid);
    if (s && !s.archived && !s.demo && !s.test) open.push(a);
  }
  if (!open.length) return { ok: false as const, error: `Q${r.hq}: nobody waits in this thread any more.` };
  // Under its sub-question (21 Nov 2026): `pt` = all of it under that one; else its "[ii] …" labels cut it, each piece
  // for those who got that one wrong. Who no piece is for isn't answered (still waiting).
  const want = typeof req.pt === "string" && req.pt.trim() ? req.pt.trim() : undefined;
  const bases = basesOf(await keyQOf(ctx, r));
  const pt = want ? labelIn(want, bases) : undefined;
  if (want && bases.length > 1 && !pt) return { ok: false as const, error: `Q${r.hq} has no sub-question (${want}): ${bases.map((b) => `(${b})`).join(" ")}.` };
  const { pieces } = await piecesOf(ctx, r, open.map((a) => a.sid), t, pt ?? undefined);
  let at = now;
  for (const p of pieces) {
    const mt = bases.length > 1 ? await Promise.all(p.to.map(async (s) => ({ s, n: (await ctx.db.get(s))?.name ?? "?" }))) : [];
    await say(ctx, r, { by: u._id, n: AI_NAME }, at++, { t: p.t, ...(p.pt ? { pt: p.pt } : {}), ...(mt.length ? { mt } : {}) });
  }
  const reached = new Set<string>(pieces.flatMap((p) => p.to));
  const room = (await ctx.db.get(r._id))!;
  let closed = 0;
  const ring: Id<"students">[] = [];
  for (const a of open) {
    if (!reached.has(a.sid)) continue;
    if (req.done === true && a.su) {
      await ctx.db.patch(a._id, { tw: now });
      await explained(ctx, a, u, room, now);
      closed++;
      continue;
    }
    await ctx.db.patch(a._id, { tw: now, ...(req.done === true && !a.tu ? { tu: now, tub: u._id } : {}) });
    ring.push(a.sid);
  }
  for (const sid of ring) {
    const p = pieces.find((x) => x.to.includes(sid)) ?? pieces[0];
    await alertStudent(ctx, sid, `🤖 Q${r.hq}${p.pt && bases.length > 1 ? ` ${p.pt}` : ""}: ${clip(p.t.replace(/\s+/g, " "), 60)}`, `/f/#chat=${r._id}`);
  }
  return { ok: true as const, id: r._id, q: r.hq, msgs: room.n, closed, waiting: ring.length, ...(open.length > reached.size ? { notFor: open.length - reached.size } : {}) };
}
