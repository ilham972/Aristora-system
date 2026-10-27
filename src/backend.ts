// The only place that talks to Convex. Tests swap in a fake through
// window.__ARISTORA_TEST_BACKEND__; the real app never sets it.

import { ConvexClient } from "convex/browser";
import { getFunctionName, type FunctionArgs, type FunctionReference, type FunctionReturnType } from "convex/server";

declare const __CONVEX_URL__: string;

type TestBackend = {
  subscribe(name: string, args: unknown, cb: (v: unknown) => void, onError: (e: unknown) => void): () => void;
  mutation(name: string, args: unknown): Promise<unknown>;
};

const testBackend = (globalThis as { __ARISTORA_TEST_BACKEND__?: TestBackend }).__ARISTORA_TEST_BACKEND__;
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
  if (testBackend) {
    return testBackend.subscribe(getFunctionName(query), args, onValue as (v: unknown) => void, onError);
  }
  const unsub = convex().onUpdate(query, args, onValue, (e) => onError(e));
  return () => unsub();
}

export async function mutate<M extends FunctionReference<"mutation">>(
  fn: M,
  args: FunctionArgs<M>,
): Promise<FunctionReturnType<M>> {
  if (testBackend) return (await testBackend.mutation(getFunctionName(fn), args)) as FunctionReturnType<M>;
  return await convex().mutation(fn, args);
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
