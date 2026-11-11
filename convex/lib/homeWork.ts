// His levels checked at home, read from the database (4 Nov 2026): the photos each Check still owes (a drawing's part
// only, since 10 Nov 2026), and one level's book for his phone (marks, the key's working where he lost marks, his photos and the
// teacher's answers). The rules themselves are pure, in `photos.ts`.

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { asMaster, bookFor, keyRow, masterState } from "./backend";
import { comesBack, masterRows } from "./family";
import { outOf, type MasterData } from "./book";
import { isFree } from "./free";
import type { KeyAnswer } from "./key";
import { phoneKey, slotWords, type KeyQ } from "./phone";
import { isRetake, isWhy, keyText, owedOf, partMarks, RETAKE, WHY, type PhotoKind } from "./photos";

/** The key as the phone reads it, with the answers the teachers typed (Settings → Books → See what the phone accepts). */
export async function phoneKeyFor(ctx: QueryCtx, unitId: Id<"units">, data: MasterData, answers: KeyAnswer[] | null): Promise<Map<number, KeyQ>> {
  const rows = await ctx.db
    .query("phoneFixes")
    .withIndex("by_unit", (q) => q.eq("unitId", unitId))
    .collect();
  return phoneKey(answers, data, new Map(rows.map((r) => [`${r.q}|${r.p}`, r.a])));
}

/** Settings → Photos (the owner): a drawing's photo is asked for (📷 on the Level). On unless he turned it off. */
export const REQUIRED_KEY = "photos.required";

export async function photosRequired(ctx: QueryCtx): Promise<boolean> {
  const row = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", REQUIRED_KEY))
    .first();
  return row ? row.value !== false : true;
}

const levelKey = (unitId: string, n: number) => `${unitId}:${n}`;

export type HomeChecks = {
  required: boolean;
  owed: Map<string, { q: number; kind: PhotoKind }[]>;
  photos: Doc<"homePhotos">[];
  latest: Map<string, Doc<"familyAnswers">>;
};

/** Every level he checked at home and what each still owes (a level taken back in class is no longer one). */
export async function homeChecks(ctx: QueryCtx, studentId: Id<"students">): Promise<HomeChecks> {
  const required = await photosRequired(ctx);
  const rows = await ctx.db
    .query("familyAnswers")
    .withIndex("by_student", (q) => q.eq("studentId", studentId))
    .collect();
  const latest = new Map<string, Doc<"familyAnswers">>();
  for (const r of rows) {
    const k = levelKey(r.unitId, r.n);
    const before = latest.get(k);
    if (!before || before.at < r.at) latest.set(k, r);
  }
  const states = new Map((await masterRows(ctx, studentId)).map((p) => [p.unitId as string, masterState(p)]));
  const photos = await ctx.db
    .query("homePhotos")
    .withIndex("by_student", (q) => q.eq("studentId", studentId))
    .collect();
  const owed = new Map<string, { q: number; kind: PhotoKind }[]>();
  for (const [k, r] of latest) {
    const m = states.get(r.unitId);
    const lv = m?.lv[String(r.n)];
    if (!m || !lv?.home || !lv.fixed) continue;
    // Corrected in class (his paper, 6 Nov 2026): the photos' job (right or wrong) is done, so nothing is owed; his
    // wrong answers wait for Evaluation in class.
    const o = lv.hc
      ? []
      : owedOf(
          r.owe,
          photos.filter((p) => p.unitId === r.unitId && p.n === r.n),
          m.q,
          required,
        );
    owed.set(k, o);
  }
  return { required, owed, photos, latest };
}

/**
 * One photo row as his phone sees it: her answer in Tamil (`say`), her message (`ask`) and her name (`by`: who corrected
 * or asked, 7 Nov 2026, his ask: "they want the credit"), never the files.
 */
export type BookPhoto = {
  kind: PhotoKind;
  state: "waiting" | "done" | "retake" | "ask";
  got: number | null;
  say: string | null;
  note: string | null;
  at: number;
  /** Her answer, not opened on his phone yet. */
  fresh: boolean;
  /** His typed reason (no photo): the phone says the teacher reads it. */
  said: boolean;
  /** Who marked it, asked it again or wrote the message (her name as in People); null = the app (free marks, a sweep). */
  by: string | null;
  /** Her message (state ask: waiting for his answer; after it, kept with his `reply`). */
  ask: string | null;
  reply: string | null;
  /** When she answered it, asked again or wrote her message (null = still with her); `at` = when he sent it. */
  when: number | null;
  /** Her voice note with the message (12 Nov 2026): its address (his phone loads it only when he taps ▶) and seconds. */
  voice?: string;
  sec?: number;
};

export type BookQ = {
  q: number;
  max: number;
  /** Its marks now; null = a part waits for a teacher (from his photo, or in class). */
  got: number | null;
  /** Marks only a teacher can give (0 = the phone marks it all). */
  teach: number;
  typed: string[] | null;
  ok: (boolean[] | null)[] | null;
  /** The key's working (bold kept as `**`): only for a question he lost marks on, only after his Check. */
  sol: string | null;
  /** He lost marks and it comes back in a later level (`comesBack`): no solution until his second try. */
  back: boolean;
  photos: BookPhoto[];
  /** The photos he still has to send for it. */
  owe: PhotoKind[];
  /** Free marks: out of the syllabus, its marks his without doing it (the owner's, 5 Nov 2026; lib/free.ts). */
  free?: true;
};

/** `hc` = corrected in class (his paper): no photo is asked for it any more; `cn` = who checked it there, `hcAt` = when. */
export type LevelBook = { unitId: Id<"units">; n: number; max: number; got: number; required: boolean; hc?: true; cn?: string; hcAt?: number; qs: BookQ[] };

/**
 * The class corrected a level he marked at home (his paper, 6 Nov 2026, the founder's rule: "the photo is for
 * correction only ... if that is already corrected in the classroom, we don't need to show the photo"): every photo
 * still waiting for it closes (`cls`), no dot on his phone; its files go a day later, like any marked photo.
 */
export async function closeClassPhotos(ctx: MutationCtx, studentId: Id<"students">, unitId: Id<"units">, n: number, now: number, by?: string) {
  const rows = await ctx.db
    .query("homePhotos")
    .withIndex("by_student", (q) => q.eq("studentId", studentId).eq("unitId", unitId).eq("n", n))
    .collect();
  let closed = 0;
  for (const r of rows) {
    // Waiting for a teacher, or for his answer to her message: the class's correction is enough.
    if (r.state !== "waiting" && r.state !== "ask") continue;
    await ctx.db.patch(r._id, classClosed(now, by));
    closed++;
  }
  return closed;
}

/** A waiting photo closed because the class corrected its level. */
export const classClosed = (now: number, by?: string) => ({ state: "done" as const, doneAt: now, seen: now, cls: true as const, ...(by ? { by } : {}) });

/** What his phone says under a photo the class closed. */
export const CLASS_SAY = "வகுப்பில் திருத்தப்பட்டது: விளக்கம் வகுப்பில்.";

function photoView(p: Doc<"homePhotos">): BookPhoto {
  const say = p.cls
    ? CLASS_SAY
    : p.state === "retake"
      ? p.why && isRetake(p.why)
        ? RETAKE[p.why].ta
        : null
      : p.why && isWhy(p.why)
        ? WHY[p.why].ta
        : null;
  return {
    kind: p.kind,
    state: p.state,
    got: p.got ?? null,
    say,
    note: p.note ?? null,
    at: p.at,
    fresh: p.state !== "waiting" && !p.seen,
    said: !!p.said,
    by: (p.state === "ask" ? p.askBy : p.by) ?? null,
    ask: p.ask ?? null,
    reply: p.reply ?? null,
    when: (p.state === "ask" ? p.askAt : p.state === "waiting" ? undefined : p.doneAt) ?? null,
  };
}

/** A photo row for his phone, with her voice note's address when she spoke (an address only: nothing is downloaded). */
async function withVoice(ctx: QueryCtx, p: Doc<"homePhotos">): Promise<BookPhoto> {
  const v = photoView(p);
  if (!p.askVoice) return v;
  const url = await ctx.storage.getUrl(p.askVoice);
  return url ? { ...v, voice: url, sec: p.askSec ?? 0 } : v;
}

/** A level he checked at home, question by question (null: not one). */
export async function bookOf(
  ctx: QueryCtx,
  s: Doc<"students">,
  unitId: Id<"units">,
  n: number,
  known?: HomeChecks,
): Promise<LevelBook | null> {
  const book = await bookFor(ctx, unitId, "master");
  if (!book) return null;
  const data = asMaster(book);
  const l = data.levels.find((x) => x.n === n);
  if (!l) return null;
  const progress = (await masterRows(ctx, s._id)).find((p) => p.unitId === unitId);
  const m = progress ? masterState(progress) : null;
  const lv = m?.lv[String(n)];
  if (!m || !lv?.fixed || !lv.home) return null;
  const key = await keyRow(ctx, unitId, "master");
  const keys = await phoneKeyFor(ctx, unitId, data, key?.answers ?? null);
  const raw = new Map((key?.answers ?? []).map((a) => [a.q, a]));
  const h = known ?? (await homeChecks(ctx, s._id));
  const row = h.latest.get(levelKey(unitId, n));
  const owed = h.owed.get(levelKey(unitId, n)) ?? [];
  const qs: BookQ[] = [];
  for (let q = l.from; q <= l.to; q++) {
    const k = keys.get(q);
    if (isFree(data, q)) {
      const max = outOf(data, q) ?? k?.max ?? 0;
      qs.push({ q, max, got: max, teach: 0, typed: null, ok: null, sol: null, back: false, photos: [], owe: [], free: true });
      continue;
    }
    if (!k) continue;
    const mq = m.q[String(q)];
    const typed = row?.qs.find((x) => x.q === q);
    const back = comesBack(m, data, keys, q);
    qs.push({
      q,
      max: k.max,
      got: mq ? (mq.got ?? (mq.lost ? 0 : k.max)) : null,
      // A part left to the teacher at his Check keeps its share (`partMarks`), whatever the key reads today.
      teach: row?.owe?.part.includes(q) && !mq ? partMarks(row.owe, q, k, typed?.a ?? null).teach : k.parts.filter((p) => !p.want).reduce((a, p) => a + p.m, 0),
      typed: typed ? slotWords(k, typed.a) : null,
      ok: typed?.ok ?? null,
      sol: mq?.lost && !back ? keyText(raw.get(q)) || null : null,
      back,
      photos: await Promise.all(h.photos.filter((p) => p.unitId === unitId && p.n === n && p.q === q).map((p) => withVoice(ctx, p))),
      owe: owed.filter((o) => o.q === q).map((o) => o.kind),
    });
  }
  return { unitId, n, max: l.max, got: lv.got ?? 0, required: h.required, ...(lv.hc ? { hc: true as const } : {}), ...(lv.hc && lv.cn ? { cn: lv.cn, hcAt: lv.hc } : {}), qs };
}
