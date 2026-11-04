// A page left open keeps its old code (5 Nov 2026: his upload refused by the teachers' app open since the night
// before): src/appVersion.ts looks for a newer version when the page comes back to the screen.
import { describe, expect, test } from "vitest";
import { busyHere, newerOnline, takeReopen, versionIn, watchUpdates, type WatchEnv } from "../src/appVersion";

const MIN = 60_000;

/** A phone's page that goes off the screen and comes back, a clock, and what the check did. */
function phone(o: { newer: boolean; safe?: boolean; checkAfter?: number }) {
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" as DocumentVisibilityState });
  let t = 5_000_000;
  const did = { checks: 0, reloads: 0, banners: 0 };
  const stop = watchUpdates(
    { page: "/", safe: () => o.safe ?? true, onNewer: () => did.banners++, checkAfter: o.checkAfter },
    {
      doc: doc as unknown as WatchEnv["doc"],
      now: () => t,
      newer: async () => {
        did.checks++;
        return o.newer;
      },
      reload: () => did.reloads++,
    },
  );
  const show = (s: DocumentVisibilityState) => {
    doc.visibilityState = s;
    doc.dispatchEvent(new Event("visibilitychange"));
  };
  const away = async (ms: number) => {
    show("hidden");
    t += ms;
    show("visible");
    await new Promise((r) => setTimeout(r, 0));
  };
  return { did, away, stop };
}

describe("a newer version of the app", () => {
  test("a quick look at another app checks nothing", async () => {
    const p = phone({ newer: true });
    await p.away(30_000);
    expect(p.did).toEqual({ checks: 0, reloads: 0, banners: 0 });
  });

  test("back after a few minutes: the banner asks for one tap (never a reload under her finger)", async () => {
    const p = phone({ newer: true });
    await p.away(5 * MIN);
    expect(p.did).toEqual({ checks: 1, reloads: 0, banners: 1 });
  });

  test("back after half an hour with nothing to lose: it loads the new one by itself", async () => {
    const p = phone({ newer: true });
    await p.away(31 * MIN);
    expect(p.did).toEqual({ checks: 1, reloads: 1, banners: 0 });
  });

  test("back after half an hour with words typed, a sheet open or taps unsent: the banner instead", async () => {
    const p = phone({ newer: true, safe: false });
    await p.away(31 * MIN);
    expect(p.did).toEqual({ checks: 1, reloads: 0, banners: 1 });
  });

  test("the same version online: nothing", async () => {
    const p = phone({ newer: false });
    await p.away(31 * MIN);
    expect(p.did).toEqual({ checks: 1, reloads: 0, banners: 0 });
  });

  test("the family app looks only after half an hour away", async () => {
    const p = phone({ newer: true, checkAfter: 30 * MIN });
    await p.away(10 * MIN);
    expect(p.did.checks).toBe(0);
    await p.away(30 * MIN);
    expect(p.did).toEqual({ checks: 1, reloads: 1, banners: 0 });
  });

  test("stopped: nothing more", async () => {
    const p = phone({ newer: true });
    p.stop();
    await p.away(31 * MIN);
    expect(p.did.checks).toBe(0);
  });

  test("no page to compare (no signal, a test): never a guess", async () => {
    expect(await newerOnline("/")).toBe(false);
    expect(takeReopen()).toBe(null);
  });
});

describe("what the check reads on the page", () => {
  const el = (attrs: Record<string, string>, more: Partial<{ type: string; value: string }> = {}) => ({
    getAttribute: (a: string) => attrs[a] ?? null,
    type: more.type ?? "text",
    value: more.value ?? "",
  });
  const page = (els: ReturnType<typeof el>[], dialog = false) =>
    ({ querySelectorAll: () => els, querySelector: () => (dialog ? {} : null) }) as unknown as ParentNode;

  test("its version: its code and style by name, in one order", () => {
    expect(versionIn(page([el({ src: "/assets/app-B2.js" }), el({ href: "/assets/app-A1.css" })]))).toBe("/assets/app-A1.css /assets/app-B2.js");
    expect(versionIn(page([el({ href: "/assets/app-A1.css" }), el({ src: "/assets/app-B2.js" })]))).toBe("/assets/app-A1.css /assets/app-B2.js");
  });

  test("busy: words typed, or a sheet open (a tick box or an empty field is not)", () => {
    expect(busyHere(page([el({}, { type: "checkbox", value: "on" }), el({}, { value: "  " })]))).toBe(false);
    expect(busyHere(page([el({}, { value: "Nila" })]))).toBe(true);
    expect(busyHere(page([el({}, { type: "textarea", value: "7 x 7 = 49, not 50" })]))).toBe(true);
    expect(busyHere(page([], true))).toBe(true);
  });
});
