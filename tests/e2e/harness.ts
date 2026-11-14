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

/**
 * `each` (14 Nov 2026): the family app's Check after every question stays on (the app's default). Without it the
 * run-throughs' class has it off (the owner's switch, written before the first phone opens), so the ones written
 * before it still check a level once, at its end.
 */
export function makeBackend(modules: Record<string, () => Promise<unknown>>, opts: { each?: boolean } = {}) {
  const t = convexTest(schema, modules);
  let once: Promise<unknown> | null = null;
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
    if (!opts.each) await (once ??= serial(() => t.run(async (ctx) => void (await ctx.db.insert("meta", { key: "family.checkEach", value: false })))));
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
    // One answer to a query (the family app asks, it doesn't watch).
    await context.exposeBinding("__abQuery", (_src, name: string, args: Record<string, unknown>) =>
      serial(async () => {
        try {
          return { value: (await t.query(makeFunctionReference<"query">(name), args as never)) ?? null };
        } catch (e) {
          const data = (e as { data?: unknown }).data;
          return { __error: typeof data === "string" ? data : String((e as Error).message ?? e) };
        }
      }),
    );
    // Photos (4 Nov 2026): the family app's upload goes into convex-test's storage; the teachers' app shows a photo
    // through the address storage.getUrl gives (served here from the same storage).
    await context.exposeBinding("__abUpload", (_src, b64: string, type: string) =>
      serial(async () => {
        try {
          const id = await t.run(async (ctx) => await ctx.storage.store(new Blob([Buffer.from(b64, "base64")], { type })));
          return { value: id };
        } catch (e) {
          return { __error: String((e as Error).message ?? e) };
        }
      }),
    );
    await context.route("https://some-deployment.convex.cloud/api/storage/**", async (route) => {
      // convex-test's address ends with the file's sha256 in base64 (it may hold "/" or "+").
      const sha = decodeURIComponent(route.request().url().split("/api/storage/")[1] ?? "");
      const file = await t.run(async (ctx) => {
        const f = (await ctx.db.system.query("_storage").collect()).find((x) => x.sha256 === sha);
        const blob = f ? await ctx.storage.get(f._id) : null;
        return blob ? { type: blob.type || "image/jpeg", bytes: await blob.arrayBuffer() } : null;
      });
      if (!file) return route.fulfill({ status: 404, body: "" });
      await route.fulfill({ status: 200, contentType: file.type, body: Buffer.from(file.bytes) });
    });
    await context.addInitScript(() => {
      const w = window as unknown as Record<string, unknown> & {
        __abSubscribe(n: string, a: unknown, id: string): Promise<void>;
        __abUnsubscribe(id: string): Promise<void>;
        __abMutation(n: string, a: unknown): Promise<{ value?: unknown; __error?: string }>;
        __abQuery(n: string, a: unknown): Promise<{ value?: unknown; __error?: string }>;
        __abUpload(b64: string, type: string): Promise<{ value?: string; __error?: string }>;
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
        async query(name: string, args: unknown) {
          const r = await w.__abQuery(name, args);
          if (r && r.__error) {
            const e = new Error(r.__error) as Error & { data?: string };
            e.data = r.__error;
            throw e;
          }
          return r.value;
        },
        async upload(blob: Blob) {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let bin = "";
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          const r = await w.__abUpload(btoa(bin), blob.type);
          if (!r || r.__error || !r.value) throw new Error(r?.__error ?? "upload failed");
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
    const file = normalize(join(root, path.endsWith("/") ? `${path}index.html` : path)); // a folder: its index.html, as on Vercel
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
