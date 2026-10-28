// Test harness: the real phone app (dist/) in Chromium, talking to the real
// Convex functions running in convex-test, through a bridge instead of the network.

import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { readFile } from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";
import schema from "../../convex/schema";

const require = createRequire(import.meta.url);
// Playwright is installed globally in this environment.
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const playwright = require("playwright") as typeof import("playwright");

type Page = import("playwright").Page;
type Context = import("playwright").BrowserContext;

export function makeBackend(modules: Record<string, () => Promise<unknown>>) {
  const t = convexTest(schema, modules);
  const subs = new Map<string, { page: Page; name: string; args: Record<string, unknown> }>();
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn, fn);
    chain = p.catch(() => undefined);
    return p;
  };

  async function deliver(id: string) {
    const s = subs.get(id);
    if (!s) return;
    let value: unknown = null;
    let error: string | null = null;
    try {
      value = await t.query(makeFunctionReference<"query">(s.name), s.args as never);
    } catch (e) {
      // Like Convex: a query that throws reaches the page's error callback; the subscription stays.
      const data = (e as { data?: unknown }).data;
      error = typeof data === "string" ? data : String((e as Error).message ?? e);
    }
    await s.page
      .evaluate(
        ([i, v, err]) => {
          const w = window as unknown as { __abDeliver(i: string, v: unknown): void; __abDeliverError(i: string, e: string): void };
          if (err !== null) w.__abDeliverError(i, err);
          else w.__abDeliver(i, v);
        },
        [id, value, error] as const,
      )
      .catch(() => undefined);
  }
  async function push() {
    for (const id of [...subs.keys()]) await deliver(id);
  }

  async function attach(context: Context) {
    await context.exposeBinding("__abMutation", ({ page: _page }, name: string, args: Record<string, unknown>) =>
      serial(async () => {
        try {
          const value = await t.mutation(makeFunctionReference<"mutation">(name), args as never);
          await push();
          return { value: value ?? null };
        } catch (e) {
          const data = (e as { data?: unknown }).data;
          return { __error: typeof data === "string" ? data : String((e as Error).message ?? e) };
        }
      }),
    );
    await context.exposeBinding("__abSubscribe", ({ page }, name: string, args: Record<string, unknown>, id: string) =>
      serial(async () => {
        subs.set(id, { page, name, args });
        await deliver(id);
      }),
    );
    await context.exposeBinding("__abUnsubscribe", (_src, id: string) => {
      subs.delete(id);
    });
    await context.addInitScript(() => {
      const w = window as unknown as Record<string, unknown> & {
        __abSubscribe(n: string, a: unknown, id: string): Promise<void>;
        __abUnsubscribe(id: string): Promise<void>;
        __abMutation(n: string, a: unknown): Promise<{ value?: unknown; __error?: string }>;
      };
      const cbs: Record<string, (v: unknown) => void> = {};
      const errs: Record<string, (e: unknown) => void> = {};
      let n = 0;
      w.__abDeliver = (id: string, v: unknown) => cbs[id]?.(v);
      w.__abDeliverError = (id: string, message: string) => {
        const e = new Error(message) as Error & { data?: string };
        e.data = message;
        errs[id]?.(e);
      };
      w.__ARISTORA_TEST_BACKEND__ = {
        subscribe(name: string, args: unknown, cb: (v: unknown) => void, onError: (e: unknown) => void) {
          const id = `s${++n}${Math.random().toString(36).slice(2, 6)}`;
          cbs[id] = cb;
          errs[id] = onError;
          w.__abSubscribe(name, args, id).catch(onError);
          return () => {
            delete cbs[id];
            delete errs[id];
            void w.__abUnsubscribe(id);
          };
        },
        async mutation(name: string, args: unknown) {
          const r = await w.__abMutation(name, args);
          if (r && r.__error) {
            const e = new Error(r.__error) as Error & { data?: string };
            e.data = r.__error;
            throw e;
          }
          return r.value;
        },
      };
    });
  }
  return { t, attach, push };
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};

/** Serve dist/ with the same headers Vercel will send (from vercel.json). */
export async function serveDist(root: string): Promise<{ url: string; close: () => Promise<void> }> {
  const config = JSON.parse(await readFile(join(root, "..", "vercel.json"), "utf8")) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  const server = http.createServer(async (req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const file = normalize(join(root, path === "/" ? "index.html" : path));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    for (const rule of config.headers) {
      const re = new RegExp(`^${rule.source.replace("(.*)", ".*")}$`);
      if (re.test(path)) for (const h of rule.headers) res.setHeader(h.key, h.value);
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) };
}
