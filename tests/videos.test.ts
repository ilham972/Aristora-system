// A skill's videos (23 Nov 2026, his voice notes: "each skill need to have the video ... the map also need to be
// dynamic ... we have to be ready for the migration ... fast and smooth like YouTube"): the permanent skill keys,
// the play links signed in plain TypeScript, where a video sits on a Stage's road, his watching, and the server's
// side with the host simulated (the real Mux calls are internal actions, never run in tests). Made-up names only.
import { generateKeyPairSync, verify } from "node:crypto";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { MasterData } from "../convex/lib/book";
import { secretHash } from "../convex/lib/auth";
import { muxAuth, muxLinks, readAsset, readSigningKey, readUpload, readUploadState, uploadBody } from "../convex/lib/mux";
import { fromB64, jwtRs256, rs256, rsaKey, toB64 } from "../convex/lib/rsa";
import { carryKeys, sameName, type Skill, type SkillTag } from "../convex/lib/skills";
import { clock, firstLevels, hostLinks, placeVideos, resumeAt, skillOfFile, viewNext } from "../convex/lib/videos";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PKCS1 = pair.privateKey.export({ type: "pkcs1", format: "pem" }).toString();
const PKCS8 = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();

describe("RS256 in plain TypeScript", () => {
  test("its signature is the standard one (Node's own check), from PKCS#1 or PKCS#8", () => {
    for (const pem of [PKCS1, PKCS8]) {
      const key = rsaKey(pem);
      const sig = rs256(key, "header.body");
      expect(verify("sha256", Buffer.from("header.body"), pair.publicKey, Buffer.from(sig))).toBe(true);
      // PKCS#1 v1.5 is deterministic: Node signs the same bytes.
      const node = require("node:crypto").sign("sha256", Buffer.from("header.body"), pair.privateKey) as Buffer;
      expect(toB64(sig)).toBe(node.toString("base64"));
    }
  });

  test("a JWT: header with its key id, the claims, a signature that checks", () => {
    const jwt = jwtRs256(rsaKey(PKCS1), "kid-1", { sub: "play1", aud: "v", exp: 99 });
    const [h, b, s] = jwt.split(".");
    expect(JSON.parse(new TextDecoder().decode(fromB64(h)))).toEqual({ alg: "RS256", typ: "JWT", kid: "kid-1" });
    expect(JSON.parse(new TextDecoder().decode(fromB64(b)))).toEqual({ sub: "play1", aud: "v", exp: 99 });
    expect(s).not.toMatch(/[+/=]/);
    expect(verify("sha256", Buffer.from(`${h}.${b}`), pair.publicKey, Buffer.from(fromB64(s)))).toBe(true);
    expect(() => rsaKey("-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----")).toThrow();
  });

  test("base64 both ways, every length", () => {
    for (let n = 0; n < 40; n++) {
      const b = new Uint8Array(n).map((_, i) => (i * 37 + n) & 255);
      expect([...fromB64(toB64(b))]).toEqual([...b]);
      expect([...fromB64(toB64(b, true))]).toEqual([...b]);
    }
  });
});

describe("Mux, behind one seam", () => {
  test("the keys come from the dashboard, both or nothing", () => {
    expect(muxAuth({})).toBeNull();
    expect(muxAuth({ MUX_TOKEN_ID: "id" })).toBeNull();
    expect(muxAuth({ MUX_TOKEN_ID: "id", MUX_TOKEN_SECRET: "secret" })).toBe(`Basic ${Buffer.from("id:secret").toString("base64")}`);
  });

  test("an upload asks for signed playback, free encoding, up to 1080p, even loudness, and names our video", () => {
    const b = uploadBody("v123");
    expect(b.new_asset_settings).toEqual({ playback_policies: ["signed"], video_quality: "basic", max_resolution_tier: "1080p", normalize_audio: true, passthrough: "v123" });
  });

  test("Mux's answers are read carefully; anything odd is no answer", () => {
    expect(readUpload({ data: { id: "up1", url: "https://direct-uploads.example.mux.com/x" } })).toEqual({ id: "up1", url: "https://direct-uploads.example.mux.com/x" });
    expect(readUpload({ data: { id: "up1", url: "javascript:alert(1)" } })).toBeNull();
    expect(readUploadState({ data: { status: "waiting" } })).toEqual({ asset: null, failed: null });
    expect(readUploadState({ data: { status: "asset_created", asset_id: "as1" } })).toEqual({ asset: "as1", failed: null });
    expect(readUploadState({ data: { status: "timed_out" } }).failed).toMatch(/timed out/);
    expect(readAsset({ data: { status: "preparing" } })).toMatchObject({ status: "preparing", play: null });
    expect(
      readAsset({ data: { status: "ready", duration: 183.456, aspect_ratio: "16:9", playback_ids: [{ id: "pub", policy: "public" }, { id: "sig", policy: "signed" }] } }),
    ).toEqual({ status: "ready", play: "sig", sec: 183.5, ratio: "16:9", err: null });
    expect(readAsset({ data: { status: "errored", errors: { messages: ["Bad file"] } } })).toMatchObject({ status: "errored", err: "Bad file" });
    expect(readSigningKey({ data: { id: "k1", private_key: Buffer.from(PKCS1).toString("base64") } })).toEqual({ kid: "k1", pem: PKCS1 });
    expect(readSigningKey({ data: { id: "k1", private_key: "not a key" } })).toBeNull();
  });

  test("play links: the stream and its poster, each signed for a few hours, the poster's options inside its token", () => {
    const now = Date.UTC(2026, 10, 23, 8);
    const l = muxLinks("PLAY1", { kid: "K1", pem: PKCS1 }, now, 180);
    expect(l.src).toMatch(/^https:\/\/stream\.mux\.com\/PLAY1\.m3u8\?token=[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(l.poster).toMatch(/^https:\/\/image\.mux\.com\/PLAY1\/thumbnail\.webp\?token=[\w-]+\.[\w-]+\.[\w-]+$/);
    const claims = (url: string) => JSON.parse(new TextDecoder().decode(fromB64(url.split("token=")[1].split(".")[1])));
    expect(claims(l.src)).toEqual({ sub: "PLAY1", aud: "v", exp: now / 1000 + 6 * 3600, kid: "K1" });
    expect(claims(l.poster)).toMatchObject({ sub: "PLAY1", aud: "t", time: 20, width: 640 });
    // The seam: a video with no key yet, or not ready, has no links.
    expect(hostLinks({ p: "mux", play: "PLAY1" }, {}, now)).toBeNull();
    expect(hostLinks({ p: "mux" }, { mux: { kid: "K1", pem: PKCS1 } }, now)).toBeNull();
  });
});

describe("permanent skill keys", () => {
  const S = (n: number) => `G8-U01-S${n}`;
  const sk = (n: number, en: string, k?: string): Skill => ({ id: S(n), ta: `திறன் ${n}`, en, ...(k ? { k } : {}) });
  let seq = 0;
  const fresh = () => `k${(++seq).toString(36)}`;

  test("a skill keeps its key by its id; a new skill gets a new one", () => {
    seq = 10;
    const r = carryKeys([sk(1, "Add", "k1"), sk(2, "Take away", "k2")], [sk(1, "Add"), sk(2, "Take away"), sk(3, "Times")], fresh);
    if (typeof r === "string") throw new Error(r);
    expect(r.skills.map((s) => s.k)).toEqual(["k1", "k2", "kb"]);
    expect(r.gone).toEqual([]);
    expect([...r.byId]).toEqual([S(1), S(2)]);
  });

  test("skill 2 becomes skill 3 (his words): the key sent with it moves with it, the new skill 2 gets its own", () => {
    seq = 20;
    const r = carryKeys([sk(1, "Add", "k1"), sk(2, "Take away", "k2")], [sk(1, "Add", "k1"), sk(2, "Times"), sk(3, "Take away", "k2")], fresh);
    if (typeof r === "string") throw new Error(r);
    expect(r.skills.map((s) => [s.id, s.k])).toEqual([
      [S(1), "k1"],
      [S(2), "kl"],
      [S(3), "k2"],
    ]);
    expect(r.gone).toEqual([]);
  });

  test("a wrong key, a key twice: plain words, nothing kept; a key left out is gone", () => {
    const before = [sk(1, "Add", "k1"), sk(2, "Take away", "k2")];
    expect(carryKeys(before, [sk(1, "Add", "k9")], fresh)).toMatch(/key "k9" is not one of this unit's/);
    expect(carryKeys(before, [sk(1, "Add", "k1"), sk(2, "Take away", "k1")], fresh)).toMatch(/on two skills/);
    const r = carryKeys(before, [sk(1, "Add")], fresh);
    expect(typeof r !== "string" && r.gone).toEqual(["k2"]);
    expect(sameName("Add two negative numbers", "add two negative numbers.")).toBe(true);
    expect(sameName("Add two numbers", "Multiply two numbers")).toBe(false);
  });

  test("a file names its skill by key first, else by its id (never S3 for S30)", () => {
    const skills = [sk(3, "Three", "k7"), sk(30, "Thirty", "k8"), sk(4, "Four", "k9")];
    expect(skillOfFile("G8-U01-S3 lesson.mp4", skills)?.id).toBe(S(3));
    expect(skillOfFile("g8_u01_s30.mp4", skills)?.id).toBe(S(30));
    expect(skillOfFile("/videos/whatever_k9.mp4", skills)?.id).toBe(S(4));
    expect(skillOfFile("lesson.mp4", skills)).toBeNull();
  });
});

describe("the road and his watching", () => {
  const data: MasterData = {
    kind: "master",
    parts: [
      { id: "I", from: 1, to: 6, kind: "short", each: 1 },
      { id: "II", from: 7, to: 8, kind: "cards" },
    ],
    levels: [
      { n: 1, from: 1, to: 3, max: 3 },
      { n: 2, from: 4, to: 6, max: 3 },
      { n: 3, from: 7, to: 8, max: 10 },
    ],
  };
  const U = "G8-U01";
  const tags: SkillTag[] = [
    { q: 1, s: `${U}-S1` },
    { q: 2, s: `${U}-S1` },
    { q: 3, s: `${U}-S1`, x: ["G7-U02-S4"] },
    { q: 4, s: `${U}-S2` },
    { q: 5, s: `${U}-S1` },
    { q: 6, s: `${U}-S2` },
    { q: 7, p: "i", s: `${U}-S3` },
    { q: 7, p: "ii", s: `${U}-S2`, x: [`${U}-S3`] },
    { q: 8, s: `${U}-S3` },
  ];
  const skills: Skill[] = [1, 2, 3].map((n) => ({ id: `${U}-S${n}`, ta: `த${n}`, en: `E${n}`, k: `k${n}` }));

  test("a skill's video sits before the first Level that needs it; another unit's skill never makes a stop", () => {
    expect([...firstLevels(U, data, tags)]).toEqual([
      [`${U}-S1`, 1],
      [`${U}-S2`, 2],
      [`${U}-S3`, 3],
    ]);
    const placed = placeVideos(U, data, tags, skills, [
      { id: "v3", sk: "k3", order: 1 },
      { id: "v1b", sk: "k1", order: 2 },
      { id: "v1", sk: "k1", order: 1 },
      { id: "gone", sk: "k99", order: 1 },
    ]);
    expect([...placed.keys()]).toEqual([1, 3]);
    expect(placed.get(1)!.map((x) => x.id)).toEqual(["v1", "v1b"]);
    expect(placed.get(3)!.map((x) => x.id)).toEqual(["v3"]);
  });

  test("watching: the furthest point, done at 90 %, once; it opens where he stopped", () => {
    const t0 = 1_000;
    let r = viewNext({ pos: 0, max: 0, dur: 180, n: 1, first: t0, last: t0 }, 40, 180, false, t0 + 40_000);
    expect(r.view).toMatchObject({ pos: 40, max: 40, dur: 180 });
    expect(r.ended).toBe(false);
    expect(resumeAt(r.view)).toBe(40);
    // He goes back to the start: where he is moves, the furthest stays.
    r = viewNext(r.view, 10, 180, false, t0 + 60_000);
    expect(r.view).toMatchObject({ pos: 10, max: 40 });
    r = viewNext(r.view, 163, 180, false, t0 + 90_000);
    expect(r.ended).toBe(true);
    expect(r.view.done).toBe(t0 + 90_000);
    expect(resumeAt(r.view)).toBe(0);
    // Done once: watching again never counts again.
    expect(viewNext(r.view, 180, 180, true, t0 + 99_000).ended).toBe(false);
    // A phone that sends nonsense never makes him further than the video.
    expect(viewNext({ pos: 0, max: 0, dur: 100, n: 1, first: 0, last: 0 }, 1e9, 100, false, 5).view.max).toBe(100);
    expect(viewNext(null, Number.NaN, Number.NaN, false, 5).view).toMatchObject({ pos: 0, max: 0, dur: 0 });
    expect(clock(183.5)).toBe("3:04");
  });
});

describe("the server: teachers add a video, students watch it", () => {
  const BOOKS = "books-teacher-token-videos-0123456789abcdefghijk";
  const FAM = "family-phone-token-videos-0123456789abcdefghijklm";
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let u01: Id<"units">;
  let hana: Id<"students">;

  beforeEach(async () => {
    vi.stubEnv("MUX_TOKEN_ID", "");
    vi.stubEnv("MUX_TOKEN_SECRET", "");
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    await addPerson(raw, { name: "Mala", token: BOOKS, tabs: ["correction"], can: ["books"] });
    const ids = await raw.run(async (ctx) => {
      const u = (await ctx.db
        .query("units")
        .withIndex("by_key", (q) => q.eq("key", "G8-U01"))
        .first())!;
      await ctx.db.insert("books", {
        unitId: u._id,
        stage: "master",
        data: {
          kind: "master",
          parts: [{ id: "I", from: 1, to: 4, kind: "short", each: 1 }],
          levels: [
            { n: 1, from: 1, to: 2, max: 2 },
            { n: 2, from: 3, to: 4, max: 2 },
          ],
        },
        updatedAt: 1,
      });
      // An older row: no keys yet (the data step gives them).
      await ctx.db.insert("skillTags", {
        unitId: u._id,
        stage: "master",
        skills: [
          { id: "G8-U01-S1", ta: "முதல்", en: "First" },
          { id: "G8-U01-S2", ta: "இரண்டாம்", en: "Second" },
        ],
        tags: [
          { q: 1, s: "G8-U01-S1" },
          { q: 2, s: "G8-U01-S1" },
          { q: 3, s: "G8-U01-S2" },
          { q: 4, s: "G8-U01-S2" },
        ],
        by: "test",
        updatedAt: 1,
      });
      return { u: u._id };
    });
    u01 = ids.u;
    hana = await t.mutation(api.students.add, { name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
    await t.mutation(api.families.makeLink, { studentId: hana, codeHash: secretHash("family-link", "video-test-code-0001") });
    await raw.mutation(api.family.join, { code: "video-test-code-0001", token: FAM, label: "Android" });
  });

  /** The data step again, as on a live app whose skills were tagged before version 7. */
  const rerunDataStep = async () => {
    await raw.run(async (ctx) => {
      const m = await ctx.db.query("meta").withIndex("by_key", (q) => q.eq("key", "data")).first();
      if (m) await ctx.db.patch(m._id, { value: 6 });
    });
    await t.mutation(api.setup.ensure, {});
  };
  const keyOf = async (n: number) =>
    await raw.run(async (ctx) => (await ctx.db.query("skillTags").withIndex("by_book", (q) => q.eq("unitId", u01).eq("stage", "master")).first())!.skills[n - 1].k!);

  test("signed out: a family function answers nobody (familyViewer / familyActor first)", async () => {
    await expect(raw.query(api.familyVideos.stage, { unitId: u01 })).rejects.toThrow(/signed out/);
    await expect(asPhone(raw, "not-a-family-token-0123456789abcdefghijklmn").query(api.familyVideos.stage, { unitId: u01 })).rejects.toThrow(/signed out/);
    await expect(raw.query(api.videos.list, { unitId: u01 })).rejects.toThrow(/signed out/);
  });

  test("without the host's keys: the page says so, nothing starts", async () => {
    const r = await asPhone(raw, BOOKS).query(api.videos.list, { unitId: u01 });
    expect(r).toEqual({ connected: false, videos: [] });
    await expect(asPhone(raw, BOOKS).mutation(api.videos.start, { unitId: u01, sk: "k1", kind: "skill", file: "a.mp4", bytes: 10 })).rejects.toThrow(/MUX_TOKEN_ID/);
  });

  test("a video from upload to the student's road: keys kept, the right Level, signed links, his watching, the counts", async () => {
    vi.stubEnv("MUX_TOKEN_ID", "test-id");
    vi.stubEnv("MUX_TOKEN_SECRET", "test-secret");
    // Every skill has its permanent key after the data step (version 7).
    await rerunDataStep();
    const k2 = await keyOf(2);
    expect(k2).toMatch(/^k[0-9a-z]+$/);
    const books = asPhone(raw, BOOKS);
    // Only teachers with Books; a family phone gets nothing.
    await expect(asPhone(raw, FAM).query(api.videos.list, { unitId: u01 })).rejects.toThrow();
    await expect(books.mutation(api.videos.start, { unitId: u01, sk: "k404", kind: "skill", file: "a.mp4", bytes: 10 })).rejects.toThrow(/isn't in this unit/);
    await expect(books.mutation(api.videos.start, { unitId: u01, sk: k2, kind: "skill", file: "a.mp4", bytes: 3 * 1024 ** 3 })).rejects.toThrow(/over 2 GB/);
    const id = await books.mutation(api.videos.start, { unitId: u01, sk: k2, kind: "skill", file: "C:\\videos\\G8-U01-S2 lesson.mp4", bytes: 12_000_000 });
    let list = await books.query(api.videos.list, { unitId: u01 });
    expect(list.connected).toBe(true);
    expect(list.videos[0]).toMatchObject({ id, sk: k2, state: "new", file: "G8-U01-S2 lesson.mp4", live: true, put: null });
    // The host's upload address comes; the phone sends the file; the host makes it ready (simulated).
    await raw.mutation(internal.videos.hostUpload, { videoId: id, upload: "up1", url: "https://direct-uploads.example.mux.com/u1" });
    list = await books.query(api.videos.list, { unitId: u01 });
    expect(list.videos[0]).toMatchObject({ state: "upload", put: "https://direct-uploads.example.mux.com/u1" });
    await books.mutation(api.videos.sent, { videoId: id });
    list = await books.query(api.videos.list, { unitId: u01 });
    expect(list.videos[0]).toMatchObject({ state: "work", put: null });
    // Not ready: students see no stop at all (no grey "coming soon").
    const fam = asPhone(raw, FAM);
    expect(await fam.query(api.familyVideos.stage, { unitId: u01 })).toEqual({ at: [] });
    await raw.mutation(internal.videos.saveKey, { kid: "KID1", pem: PKCS1 });
    await raw.mutation(internal.videos.hostReady, { videoId: id, asset: "as1", play: "PLAY1", sec: 183.5, ratio: "16:9" });
    // Before Level 2 (where S2 first comes), titled with the skill's Tamil name.
    expect(await fam.query(api.familyVideos.stage, { unitId: u01 })).toEqual({ at: [{ n: 2, v: [{ id, t: "இரண்டாம்", sec: 183.5, w: 0, done: false }] }] });
    // Its links: signed, from the start; asking for them writes nothing (the Stage asks as it opens).
    const p1 = await fam.mutation(api.familyVideos.links, { videoId: id });
    expect(p1.src).toMatch(/^https:\/\/stream\.mux\.com\/PLAY1\.m3u8\?token=/);
    expect(p1).toMatchObject({ sec: 183.5, ratio: "16:9", at: 0 });
    expect((await books.query(api.videos.list, { unitId: u01 })).videos[0].seen).toBe(0);
    // It plays: counted once; where he stopped is where it opens next.
    await fam.mutation(api.familyVideos.seen, { videoId: id, pos: 0, dur: 183.5, start: true });
    await fam.mutation(api.familyVideos.seen, { videoId: id, pos: 61, dur: 183.5 });
    expect((await fam.mutation(api.familyVideos.links, { videoId: id })).at).toBe(61);
    await fam.mutation(api.familyVideos.seen, { videoId: id, pos: 61, dur: 183.5, start: true });
    expect((await fam.query(api.familyVideos.stage, { unitId: u01 })).at[0].v[0]).toMatchObject({ w: 33, done: false });
    expect(await fam.mutation(api.familyVideos.seen, { videoId: id, pos: 183.5, dur: 183.5, end: true })).toEqual({ done: true });
    await fam.mutation(api.familyVideos.seen, { videoId: id, pos: 183.5, dur: 183.5, end: true });
    list = await books.query(api.videos.list, { unitId: u01 });
    expect(list.videos[0]).toMatchObject({ seen: 1, ended: 1, state: "ready", sec: 183.5 });
    // Hidden: off the road, still on the teachers' page; shown again.
    await books.mutation(api.videos.setLive, { videoId: id, live: false });
    expect(await fam.query(api.familyVideos.stage, { unitId: u01 })).toEqual({ at: [] });
    await expect(fam.mutation(api.familyVideos.links, { videoId: id })).rejects.toThrow(/isn't here/);
    await books.mutation(api.videos.setLive, { videoId: id, live: true });
    // Preview for the teachers; removal only by the owner, with every student's watching.
    expect((await books.mutation(api.videos.preview, { videoId: id })).src).toMatch(/PLAY1/);
    await expect(books.mutation(api.videos.remove, { videoId: id })).rejects.toThrow(/owner/);
    await t.mutation(api.videos.remove, { videoId: id });
    expect(await raw.run(async (ctx) => [(await ctx.db.query("videos").collect()).length, (await ctx.db.query("videoViews").collect()).length])).toEqual([0, 0]);
    expect(hana).toBeTruthy();
  });

  test("a unit tagged before the keys: its first video gives every skill its key, the video on its own", async () => {
    vi.stubEnv("MUX_TOKEN_ID", "test-id");
    vi.stubEnv("MUX_TOKEN_SECRET", "test-secret");
    const id = await asPhone(raw, BOOKS).mutation(api.videos.start, { unitId: u01, skill: "G8-U01-S2", kind: "skill", file: "x.mp4", bytes: 5 });
    const row = await raw.run(async (ctx) => (await ctx.db.query("skillTags").withIndex("by_book", (q) => q.eq("unitId", u01).eq("stage", "master")).first())!);
    expect(row.skills.every((x) => /^k[0-9a-z]+$/.test(x.k ?? ""))).toBe(true);
    expect((await raw.run(async (ctx) => await ctx.db.get(id)))?.sk).toBe(row.skills[1].k);
  });

  test("lost marks in the Level after it: the video asks to be watched again until he does", async () => {
    vi.stubEnv("MUX_TOKEN_ID", "test-id");
    vi.stubEnv("MUX_TOKEN_SECRET", "test-secret");
    await rerunDataStep();
    const k1 = await keyOf(1);
    const id = await asPhone(raw, BOOKS).mutation(api.videos.start, { unitId: u01, sk: k1, kind: "skill", file: "s1.mp4", bytes: 5 });
    await raw.mutation(internal.videos.saveKey, { kid: "KID1", pem: PKCS1 });
    await raw.mutation(internal.videos.hostReady, { videoId: id, asset: "as1", play: "PLAY1", sec: 100 });
    const fixedAt = Date.now();
    await raw.run(async (ctx) => {
      const m = { q: { "2": { got: 0, max: 1, lost: true, t: fixedAt } }, lv: { "1": { done: fixedAt, fixed: fixedAt, got: 1 } } };
      const row = await ctx.db.query("progress").withIndex("by_student_unit_stage", (q) => q.eq("studentId", hana).eq("unitId", u01).eq("stage", "master")).first();
      if (row) await ctx.db.patch(row._id, { m });
      else await ctx.db.insert("progress", { studentId: hana, unitId: u01, stage: "master", marks: {}, m, startedAt: 1, updatedAt: fixedAt });
    });
    const fam = asPhone(raw, FAM);
    expect((await fam.query(api.familyVideos.stage, { unitId: u01 })).at[0]).toMatchObject({ n: 1, v: [{ id, again: true }] });
    await fam.mutation(api.familyVideos.seen, { videoId: id, pos: 0, dur: 100, start: true });
    await fam.mutation(api.familyVideos.seen, { videoId: id, pos: 100, dur: 100, end: true });
    expect((await fam.query(api.familyVideos.stage, { unitId: u01 })).at[0].v[0].again).toBeUndefined();
  });
});
