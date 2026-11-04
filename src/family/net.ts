// The family app's only line to the server: Convex's plain HTTP API (no client library: the app stays tiny).
// Tests swap in the fake backend through window.__ARISTORA_TEST_BACKEND__ (the real app never sets it).
// Also the children on this phone (3 Nov 2026, his voice note: parents with two children switch between them): one
// family token per child, and everything else kept on the phone is kept per child (keep()).

declare const __CONVEX_URL__: string;

type TestBackend = {
  mutation(name: string, args: unknown): Promise<unknown>;
  query?(name: string, args: unknown): Promise<unknown>;
  /** Tests: keep a photo in the fake backend's storage (the real phone posts it to Convex). */
  upload?(blob: Blob): Promise<string>;
};
/** The fake server in tests (never in the real app). */
export const testBackend = (globalThis as { __ARISTORA_TEST_BACKEND__?: TestBackend }).__ARISTORA_TEST_BACKEND__;

/** A failed call: `offline` = no answer from the server (no signal); else the server's words. */
export class NetError extends Error {
  constructor(
    message: string,
    readonly offline = false,
  ) {
    super(message);
  }
}

/** The words a signed-out family phone gets (convex/lib/auth.ts FAMILY_SIGNED_OUT). */
export const isSignedOut = (e: unknown) => e instanceof NetError && /signed out of ARISTORA/.test(e.message);

export function words(e: unknown): string {
  const data = (e as { data?: unknown })?.data;
  if (typeof data === "string") return data;
  const m = String((e as Error)?.message ?? e);
  const uncaught = /(?:ConvexError|Error): (.+?)(?:\n|$)/.exec(m);
  return uncaught ? uncaught[1] : m;
}

export async function call(kind: "query" | "mutation", path: string, args: Record<string, unknown>): Promise<unknown> {
  if (testBackend) {
    try {
      return kind === "mutation" || !testBackend.query ? await testBackend.mutation(path, args) : await testBackend.query(path, args);
    } catch (e) {
      throw new NetError(words(e));
    }
  }
  let res: Response;
  try {
    res = await fetch(`${__CONVEX_URL__}/api/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, args, format: "json" }),
    });
  } catch {
    throw new NetError("offline", true);
  }
  const j = (await res.json().catch(() => null)) as { status?: string; value?: unknown; errorMessage?: string; errorData?: unknown } | null;
  if (!j) throw new NetError("offline", true);
  if (j.status === "success") return j.value;
  throw new NetError(typeof j.errorData === "string" ? j.errorData : words({ message: j.errorMessage }));
}

/** Random bytes from the phone's secure generator, as base64url. */
export function randomKey(bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function phoneLabel(): string {
  const ua = navigator.userAgent;
  return /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "Mac" : "Computer";
}

// ---- The children on this phone. Each is one family key, made here and kept here (the server keeps its SHA-256). ----

export type Account = {
  /** This phone's own name for the child: the prefix of everything kept for him. */
  id: string;
  token: string;
  name: string;
  grade?: number | null;
  index?: number | null;
  /** His photo's key (pics.ts): the list of children shows his face. */
  pic?: string | null;
};

const ACCOUNTS = "aristora.family.accounts";
const CURRENT = "aristora.family.current";
/** Before 3 Nov 2026 a phone held one child: his key was here (and his things straight under aristora.family.). */
const OLD_TOKEN = "aristora.family.token";
/** Enough for any family; a phone isn't a class register. */
export const MAX_ACCOUNTS = 6;

function ls(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function readList(): Account[] {
  try {
    const x = JSON.parse(ls()?.getItem(ACCOUNTS) ?? "[]") as Account[];
    return Array.isArray(x) ? x.filter((a) => a && typeof a.token === "string" && typeof a.id === "string") : [];
  } catch {
    return [];
  }
}

let list: Account[] = [];
let currentId: string | null = null;

function save() {
  try {
    ls()?.setItem(ACCOUNTS, JSON.stringify(list));
    if (currentId) ls()?.setItem(CURRENT, currentId);
    else ls()?.removeItem(CURRENT);
  } catch {
    /* private mode: kept until the page closes */
  }
}

/** A phone from before: its one child becomes the first account, with everything kept for him. */
function migrate() {
  const store = ls();
  const old = store?.getItem(OLD_TOKEN);
  if (!store || !old) return;
  const id = randomKey(6);
  let name = "";
  const moves: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && /^aristora\.family\.(me|hello|draft\..+|form\..+)$/.test(k)) moves.push(k);
  }
  for (const k of moves) {
    const v = store.getItem(k);
    if (v === null) continue;
    if (k === "aristora.family.me") name = (JSON.parse(v) as { name?: string } | null)?.name ?? "";
    store.setItem(`aristora.family.${id}.${k.slice("aristora.family.".length)}`, v);
    store.removeItem(k);
  }
  store.removeItem(OLD_TOKEN);
  list.push({ id, token: old, name });
  currentId = id;
  save();
}

function load() {
  list = readList();
  currentId = ls()?.getItem(CURRENT) ?? null;
  migrate();
  if (!list.some((a) => a.id === currentId)) currentId = list[0]?.id ?? null;
}
load();

export const accounts = (): Account[] => list.slice();
export const current = (): Account | null => list.find((a) => a.id === currentId) ?? null;
export const token = (): string | null => current()?.token ?? null;

/** A child joins this phone (link, or index and code) and is the one on screen. */
export function addAccount(t: string, name: string): Account {
  const a: Account = { id: randomKey(6), token: t, name };
  list.push(a);
  currentId = a.id;
  save();
  return a;
}

export function switchTo(id: string): void {
  if (!list.some((a) => a.id === id)) return;
  currentId = id;
  save();
}

/** What the server says about him now (his name, grade, index): kept for the list of children. */
export function noteAccount(id: string, p: Partial<Pick<Account, "name" | "grade" | "index" | "pic">>): void {
  const a = list.find((x) => x.id === id);
  if (!a || (a.name === p.name && a.grade === p.grade && a.index === p.index && (a.pic ?? null) === (p.pic ?? null))) return;
  Object.assign(a, p);
  save();
}

/** A child leaves this phone: his key and everything kept for him. The next child (if any) is on screen. */
export function removeAccount(id: string): Account | null {
  list = list.filter((a) => a.id !== id);
  const store = ls();
  if (store) {
    const gone: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k?.startsWith(`aristora.family.${id}.`)) gone.push(k);
    }
    for (const k of gone) store.removeItem(k);
  }
  if (currentId === id) currentId = list[0]?.id ?? null;
  save();
  return current();
}

export const query = (path: string, args: Record<string, unknown> = {}) => call("query", path, { token: token() ?? undefined, ...args });
export const mutation = (path: string, args: Record<string, unknown> = {}) => call("mutation", path, { token: token() ?? undefined, ...args });
/** The child on screen: photos waiting on this phone are his (4 Nov 2026). */
export const childId = () => currentId ?? "_";

/** One photo into Convex storage (an address from `family:photoUrl`, then a plain POST): its storage id. */
export async function uploadPhoto(blob: Blob): Promise<string> {
  const url = (await mutation("family:photoUrl")) as string;
  if (testBackend?.upload) {
    try {
      return await testBackend.upload(blob);
    } catch (e) {
      throw new NetError(words(e));
    }
  }
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": blob.type || "image/jpeg" }, body: blob });
  } catch {
    throw new NetError("offline", true);
  }
  const j = (await res.json().catch(() => null)) as { storageId?: string } | null;
  if (!res.ok || !j?.storageId) throw new NetError("படம் போய்ச் சேரவில்லை. மீண்டும் அனுப்பு.");
  return j.storageId;
}

/** A mutation for one child, whoever is on screen (signing him out). */
export const mutationFor = (t: string, path: string, args: Record<string, unknown> = {}) => call("mutation", path, { ...args, token: t });
/** The two open calls (no token yet). */
export const peek = (code: string) => call("query", "family:peek", { code }) as Promise<{ name: string | null; problem: string | null }>;
export const join = (code: string, t: string) => call("mutation", "family:join", { code, token: t, label: phoneLabel() }) as Promise<{ name: string }>;
/** His index number and code (the other way in). */
export const signInIndex = (index: number, code: string, t: string) =>
  call("mutation", "family:signIn", { index, code, token: t, label: phoneLabel() }) as Promise<
    { ok: true; name: string } | { ok: false; why: "wrong" | "locked"; minutes: number }
  >;

/** Small things kept on this phone for the child on screen (his home screen, typed answers): never needed, only faster. */
export function keep<T>(key: string, value?: T | null): T | null {
  const k = `aristora.family.${currentId ?? "_"}.${key}`;
  try {
    if (value === undefined) {
      const s = ls()?.getItem(k);
      return s ? (JSON.parse(s) as T) : null;
    }
    if (value === null) ls()?.removeItem(k);
    else ls()?.setItem(k, JSON.stringify(value));
  } catch {
    /* nothing kept (private mode, or the phone is full): still works */
  }
  return value ?? null;
}
