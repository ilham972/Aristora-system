// The family app's only line to the server: Convex's plain HTTP API (no client library: the app stays tiny).
// Tests swap in the fake backend through window.__ARISTORA_TEST_BACKEND__ (the real app never sets it).

declare const __CONVEX_URL__: string;

type TestBackend = {
  mutation(name: string, args: unknown): Promise<unknown>;
  query?(name: string, args: unknown): Promise<unknown>;
};
const testBackend = (globalThis as { __ARISTORA_TEST_BACKEND__?: TestBackend }).__ARISTORA_TEST_BACKEND__;

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

function words(e: unknown): string {
  const data = (e as { data?: unknown })?.data;
  if (typeof data === "string") return data;
  const m = String((e as Error)?.message ?? e);
  const uncaught = /(?:ConvexError|Error): (.+?)(?:\n|$)/.exec(m);
  return uncaught ? uncaught[1] : m;
}

async function call(kind: "query" | "mutation", path: string, args: Record<string, unknown>): Promise<unknown> {
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

// ---- This phone's family key: made here, kept here; the server keeps only its SHA-256. ----
const TOKEN_KEY = "aristora.family.token";

export function token(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function saveToken(t: string | null): void {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: signed in until the page closes */
  }
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

export const query = (path: string, args: Record<string, unknown> = {}) => call("query", path, { token: token() ?? undefined, ...args });
export const mutation = (path: string, args: Record<string, unknown> = {}) => call("mutation", path, { token: token() ?? undefined, ...args });
/** The two open calls (no token yet). */
export const peek = (code: string) => call("query", "family:peek", { code }) as Promise<{ name: string | null; problem: string | null }>;
export const join = (code: string, t: string) => call("mutation", "family:join", { code, token: t, label: phoneLabel() }) as Promise<{ name: string }>;

/** Small things kept on this phone (the last home screen, typed answers): never needed, only faster. */
export function keep<T>(key: string, value?: T | null): T | null {
  try {
    if (value === undefined) {
      const s = localStorage.getItem(`aristora.family.${key}`);
      return s ? (JSON.parse(s) as T) : null;
    }
    if (value === null) localStorage.removeItem(`aristora.family.${key}`);
    else localStorage.setItem(`aristora.family.${key}`, JSON.stringify(value));
  } catch {
    /* nothing kept: still works */
  }
  return value ?? null;
}
