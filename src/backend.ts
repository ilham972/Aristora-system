// The only place that talks to Convex. Tests swap in a fake through
// window.__ARISTORA_TEST_BACKEND__; the real app never sets it.

import { ConvexClient } from "convex/browser";
import { getFunctionName, type FunctionArgs, type FunctionReference, type FunctionReturnType } from "convex/server";

declare const __CONVEX_URL__: string;

type TestBackend = {
  subscribe(name: string, args: unknown, cb: (v: unknown) => void, onError: (e: unknown) => void): () => void;
  mutation(name: string, args: unknown): Promise<unknown>;
  /** One answer to a query (the test harness has it; older fakes don't). */
  query?(name: string, args: unknown): Promise<unknown>;
};

const testBackend = (globalThis as { __ARISTORA_TEST_BACKEND__?: TestBackend }).__ARISTORA_TEST_BACKEND__;

// ---- This phone's sign-in key ----
// Made here from the phone's secure random numbers, kept in this browser, sent with every request.
// The server keeps only its SHA-256.

const TOKEN_KEY = "aristora.token";
let token: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
})();

export function phoneToken(): string | null {
  return token;
}

export function savePhoneToken(t: string | null): void {
  token = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: signed in until the page is closed */
  }
}

/** Random bytes from the phone's secure generator, as base64url text. */
export function randomKey(bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A short name for this phone, for the owner's list of signed-in phones. */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : "Phone";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung"
      : /CriOS|Chrome\//.test(ua)
        ? "Chrome"
        : /FxiOS|Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "";
  return browser ? `${os} · ${browser}` : os;
}

function withToken<A>(args: A): A {
  return token ? ({ token, ...(args as object) } as A) : args;
}
let client: ConvexClient | null = null;
function convex(): ConvexClient {
  if (!client) client = new ConvexClient(__CONVEX_URL__);
  return client;
}

export function subscribe<Q extends FunctionReference<"query">>(
  query: Q,
  args: FunctionArgs<Q>,
  onValue: (value: FunctionReturnType<Q>) => void,
  onError: (e: unknown) => void,
): () => void {
  const a = withToken(args);
  if (testBackend) {
    return testBackend.subscribe(getFunctionName(query), a, onValue as (v: unknown) => void, onError);
  }
  const unsub = convex().onUpdate(query, a, onValue, (e) => onError(e));
  return () => unsub();
}

/**
 * A query read once, not watched (the CEO page: a live query would run again on every tap of every teacher).
 */
export async function fetchOnce<Q extends FunctionReference<"query">>(query: Q, args: FunctionArgs<Q>): Promise<FunctionReturnType<Q>> {
  const a = withToken(args);
  if (testBackend?.query) return (await testBackend.query(getFunctionName(query), a)) as FunctionReturnType<Q>;
  if (testBackend) {
    const tb = testBackend;
    return await new Promise<FunctionReturnType<Q>>((ok, no) => {
      let done = false;
      let off: (() => void) | null = null;
      const finish = () => {
        done = true;
        queueMicrotask(() => off?.());
      };
      off = tb.subscribe(
        getFunctionName(query),
        a,
        (v) => {
          if (done) return;
          finish();
          ok(v as FunctionReturnType<Q>);
        },
        (e) => {
          if (done) return;
          finish();
          no(e);
        },
      );
      if (done) off();
    });
  }
  return (await convex().query(query, a)) as FunctionReturnType<Q>;
}

export async function mutate<M extends FunctionReference<"mutation">>(
  fn: M,
  args: FunctionArgs<M>,
): Promise<FunctionReturnType<M>> {
  const a = withToken(args);
  if (testBackend) return (await testBackend.mutation(getFunctionName(fn), a)) as FunctionReturnType<M>;
  return await convex().mutation(fn, a);
}

export type Link = { connected: boolean; everConnected: boolean; sending: number };

export function watchLink(cb: (l: Link) => void): () => void {
  if (testBackend) {
    cb({ connected: true, everConnected: true, sending: 0 });
    return () => {};
  }
  const c = convex();
  const emit = () => {
    const s = c.connectionState();
    cb({ connected: s.isWebSocketConnected, everConnected: s.hasEverConnected, sending: s.inflightMutations });
  };
  emit();
  const unsub = c.subscribeToConnectionState(emit);
  return () => unsub();
}

/** A message a teacher can act on, from a failed call. */
export function errorText(e: unknown): string {
  const data = (e as { data?: unknown })?.data;
  if (typeof data === "string") return data;
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const m = /ConvexError: (.+?)(\n|$)/.exec(msg);
  if (m) return m[1];
  if (/network|fetch|connection|websocket/i.test(msg)) return "No internet. Try again when it's back.";
  return msg && msg.length < 140 ? msg : "That didn't save. Try again.";
}
