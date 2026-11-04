// His levels checked at home, read from the database (4 Nov 2026): the photos each Check still owes, his 2-level limit
// (`blockedBy`), and one level's book for his phone (marks, the key's working where he lost marks, his photos and the
// teacher's answers). The rules themselves are pure, in `photos.ts`.

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { asMaster, bookFor, keyRow, masterState } from "./backend";
import { comesBack, masterRows } from "./family";
import type { MasterData } from "./book";
import type { KeyAnswer } from "./key";
import { phoneKey, slotWords, type KeyQ } from "./phone";
import { isRetake, isWhy, keyText, owedOf, partMarks, RETAKE, WHY, type CheckDebt, type PhotoKind } from "./photos";

/** The key as the phone reads it, with the answers the teachers typed (Settings → Books → See what the phone accepts). */
export async function phoneKeyFor(ctx: QueryCtx, unitId: Id<"units">, data: MasterData, answers: KeyAnswer[] | null): Promise<Map<number, KeyQ>> {
  const rows = await ctx.db
    .query("phoneFixes")
    .withIndex("by_unit", (q) => q.eq("unitId", unitId))
    .collect();
  return phoneKey(answers, data, new Map(rows.map((r) => [`${r.q}|${r.p}`, r.a])));
}

/** Settings → Photos (the owner): photos required, 2 levels at most without them. On unless he turned it off. */
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
  /** Each level he checked at home (its latest Check) and how many photos it still owes. */
  checks: CheckDebt[];
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
  const checks: CheckDebt[] = [];
  const owed = new Map<string, { q: number; kind: PhotoKind }[]>();
  for (const [k, r] of latest) {
    const m = states.get(r.unitId);
    const lv = m?.lv[String(r.n)];
    if (!m || !lv?.home || !lv.fixed) continue;
    const o = owedOf(
      r.owe,
      photos.filter((p) => p.unitId === r.unitId && p.n === r.n),
      m.q,
      required,
    );
    owed.set(k, o);
    // In the order he checked them (the row's creation: two Checks never share it).
    checks.push({ unitId: r.unitId, n: r.n, at: r._creationTime, owed: o.length });
  }
  return { required, checks, owed, photos, latest };
}

/** One photo row as his phone sees it: her answer in Tamil (`say`), never her name or the files. */
export type BookPhoto = {
  kind: PhotoKind;
  state: "waiting" | "done" | "retake";
  got: number | null;
  say: string | null;
  note: string | null;
  at: number;
  /** Her answer, not opened on his phone yet. */
  fresh: boolean;
  /** His typed reason (no photo): the phone says the teacher reads it. */
  said: boolean;
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
};

export type LevelBook = { unitId: Id<"units">; n: number; max: number; got: number; required: boolean; qs: BookQ[] };

function photoView(p: Doc<"homePhotos">): BookPhoto {
  const say =
    p.state === "retake"
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
  };
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
      photos: h.photos.filter((p) => p.unitId === unitId && p.n === n && p.q === q).map(photoView),
      owe: owed.filter((o) => o.q === q).map((o) => o.kind),
    });
  }
  return { unitId, n, max: l.max, got: lv.got ?? 0, required: h.required, qs };
}
