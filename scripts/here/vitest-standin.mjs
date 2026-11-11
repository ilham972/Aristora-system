// A small stand-in for vitest (describe / test / expect / vi), enough for this repo's unit tests and run-throughs.
const RealDate = Date;
const realSetTimeout = globalThis.setTimeout;
let fakeNow = null;

class FakeDate extends RealDate {
  constructor(...a) {
    if (a.length === 0) super(fakeNow ?? RealDate.now());
    else super(...a);
  }
  static now() {
    return fakeNow ?? RealDate.now();
  }
}

const mk = (name, parent) => ({ name, parent, before: [], after: [], beforeAll: [], afterAll: [], tests: [], children: [] });
const root = mk("", null);
let cur = root;

export function describe(name, fn) {
  const s = mk(name, cur);
  cur.children.push(s);
  const p = cur;
  cur = s;
  fn();
  cur = p;
}
describe.skip = () => {};
export function test(name, fn) {
  cur.tests.push({ name, fn });
}
test.skip = () => {};
test.each = (rows) => (name, fn) =>
  rows.forEach((r, i) => {
    const args = Array.isArray(r) ? r : [r];
    let k = 0;
    const title = String(name).replace(/%[sdoji]/g, () => (k < args.length ? fmt(args[k++]) : "")) + (String(name).includes("%") ? "" : ` #${i}`);
    test(title, () => fn(...args));
  });
export const it = test;
export const beforeEach = (fn) => cur.before.push(fn);
export const afterEach = (fn) => cur.after.push(fn);
export const beforeAll = (fn) => cur.beforeAll.push(fn);
export const afterAll = (fn) => cur.afterAll.push(fn);

function fmt(v) {
  try {
    if (typeof v === "string") return v;
    const s = JSON.stringify(v, (_k, x) => (x === undefined ? "__undefined__" : typeof x === "bigint" ? `${x}n` : x instanceof RegExp ? String(x) : x && x.$$asym ? `<${x.$$asym}>` : x));
    return s === undefined ? String(v) : s.length > 1500 ? `${s.slice(0, 1500)}…` : s;
  } catch {
    return String(v);
  }
}

// ---- equality ----
const isObj = (x) => x !== null && typeof x === "object";
const asym = (name, check) => ({ $$asym: name, check });

function equals(a, b, strict = false) {
  if (isObj(b) && b.$$asym) return b.check(a);
  if (isObj(a) && a.$$asym) return a.check(b);
  if (Object.is(a, b)) return true;
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (!isObj(a) || !isObj(b)) return false;
  if (a instanceof RealDate && b instanceof RealDate) return a.getTime() === b.getTime();
  if (a instanceof RegExp && b instanceof RegExp) return String(a) === String(b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => equals(x, b[i], strict));
  if (a instanceof Set && b instanceof Set) return a.size === b.size && [...a].every((x) => [...b].some((y) => equals(x, y, strict)));
  if (a instanceof Map && b instanceof Map) return a.size === b.size && [...a].every(([k, v]) => b.has(k) && equals(v, b.get(k), strict));
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) return a.length === b.length && Array.prototype.every.call(a, (x, i) => x === b[i]);
  const ka = Object.keys(a).filter((k) => strict || a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => strict || b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && equals(a[k], b[k], strict));
}

function subset(obj, want) {
  if (isObj(want) && want.$$asym) return want.check(obj);
  if (want instanceof RegExp && typeof obj === "string") return want.test(obj);
  if (!isObj(want) || want instanceof RealDate || want instanceof RegExp) return equals(obj, want);
  if (Array.isArray(want)) return Array.isArray(obj) && obj.length === want.length && want.every((w, i) => subset(obj[i], w));
  if (!isObj(obj)) return false;
  return Object.keys(want).every((k) => (want[k] === undefined ? obj[k] === undefined : k in obj && subset(obj[k], want[k])));
}

class AssertionError extends Error {}
const failWith = (msg) => {
  throw new AssertionError(msg);
};

function matchers(actual, not, label) {
  const check = (ok, msg) => {
    if (ok === not) failWith(`${label ? `${label}: ` : ""}expected ${not ? "not " : ""}${msg}`);
  };
  const thrown = (fn) => {
    if (typeof fn !== "function") return { err: fn, threw: true };
    try {
      fn();
      return { threw: false };
    } catch (err) {
      return { err, threw: true };
    }
  };
  const errMatches = (err, want) => {
    if (want === undefined) return true;
    const m = err && err.message !== undefined ? String(err.message) : String(err);
    if (want instanceof RegExp) return want.test(m);
    if (typeof want === "string") return m.includes(want);
    if (typeof want === "function") return err instanceof want;
    return subset(err, want);
  };
  return {
    toBe: (w) => check(Object.is(actual, w), `${fmt(actual)} to be ${fmt(w)}`),
    toEqual: (w) => check(equals(actual, w), `${fmt(actual)}\n   to equal ${fmt(w)}`),
    toStrictEqual: (w) => check(equals(actual, w, true), `${fmt(actual)}\n   to strictly equal ${fmt(w)}`),
    toMatchObject: (w) => check(subset(actual, w), `${fmt(actual)}\n   to match ${fmt(w)}`),
    toBeTruthy: () => check(!!actual, `${fmt(actual)} to be truthy`),
    toBeFalsy: () => check(!actual, `${fmt(actual)} to be falsy`),
    toBeNull: () => check(actual === null, `${fmt(actual)} to be null`),
    toBeUndefined: () => check(actual === undefined, `${fmt(actual)} to be undefined`),
    toBeDefined: () => check(actual !== undefined, `${fmt(actual)} to be defined`),
    toBeNaN: () => check(Number.isNaN(actual), `${fmt(actual)} to be NaN`),
    toBeGreaterThan: (w) => check(actual > w, `${fmt(actual)} > ${fmt(w)}`),
    toBeGreaterThanOrEqual: (w) => check(actual >= w, `${fmt(actual)} >= ${fmt(w)}`),
    toBeLessThan: (w) => check(actual < w, `${fmt(actual)} < ${fmt(w)}`),
    toBeLessThanOrEqual: (w) => check(actual <= w, `${fmt(actual)} <= ${fmt(w)}`),
    toBeCloseTo: (w, d = 2) => check(Math.abs(actual - w) < Math.pow(10, -d) / 2, `${fmt(actual)} close to ${fmt(w)}`),
    toBeInstanceOf: (w) => check(actual instanceof w, `${fmt(actual)} instance of ${w.name}`),
    toBeTypeOf: (w) => check(typeof actual === w, `${fmt(actual)} to be of type ${w}`),
    toContain: (w) => check(typeof actual === "string" ? actual.includes(w) : [...actual].some((x) => Object.is(x, w)), `${fmt(actual)} to contain ${fmt(w)}`),
    toContainEqual: (w) => check([...actual].some((x) => equals(x, w)), `${fmt(actual)} to contain equal ${fmt(w)}`),
    toHaveLength: (w) => check(actual != null && actual.length === w, `${fmt(actual)} (length ${actual?.length}) to have length ${w}`),
    toHaveProperty: (k, ...v) => {
      const got = String(k).split(".").reduce((o, p) => (o == null ? undefined : o[p]), actual);
      check(v.length ? equals(got, v[0]) : got !== undefined, `${fmt(actual)} to have property ${k}${v.length ? ` = ${fmt(v[0])}` : ""}`);
    },
    toMatch: (w) => check(w instanceof RegExp ? w.test(actual) : String(actual).includes(w), `${fmt(actual)} to match ${w}`),
    toThrow: (w) => {
      const r = thrown(actual);
      check(r.threw && errMatches(r.err, w), `to throw ${w ?? ""}${r.threw ? ` (threw: ${r.err?.message ?? r.err})` : " (did not throw)"}`);
    },
    toThrowError(w) {
      return this.toThrow(w);
    },
    toHaveBeenCalled: () => check(actual.mock.calls.length > 0, `mock to have been called`),
    toHaveBeenCalledTimes: (n) => check(actual.mock.calls.length === n, `mock called ${actual.mock.calls.length} times, wanted ${n}`),
    toHaveBeenCalledWith: (...a) => check(actual.mock.calls.some((c) => equals(c, a)), `mock to have been called with ${fmt(a)}; calls: ${fmt(actual.mock.calls)}`),
  };
}

export function expect(actual, label) {
  const m = matchers(actual, false, label);
  m.not = matchers(actual, true, label);
  const settle = (wantReject, not) =>
    new Proxy(
      {},
      {
        get: (_t, name) => {
          if (name === "not") return settle(wantReject, !not);
          return async (...args) => {
            let value;
            let rejected = false;
            try {
              value = await actual;
            } catch (e) {
              rejected = true;
              value = e;
            }
            if (wantReject) {
              if (!rejected) failWith(`${label ? `${label}: ` : ""}expected the promise to reject, it resolved with ${fmt(value)}`);
              const mm = matchers(name === "toThrow" || name === "toThrowError" ? value : value, not, label);
              return mm[name](...args);
            }
            if (rejected) throw value;
            return matchers(value, not, label)[name](...args);
          };
        },
      },
    );
  m.rejects = settle(true, false);
  m.resolves = settle(false, false);
  return m;
}
expect.objectContaining = (w) => asym("objectContaining", (x) => isObj(x) && subset(x, w));
expect.arrayContaining = (w) => asym("arrayContaining", (x) => Array.isArray(x) && w.every((y) => x.some((z) => equals(z, y))));
expect.stringContaining = (w) => asym("stringContaining", (x) => typeof x === "string" && x.includes(w));
expect.stringMatching = (w) => asym("stringMatching", (x) => typeof x === "string" && (w instanceof RegExp ? w.test(x) : x.includes(w)));
expect.anything = () => asym("anything", (x) => x !== null && x !== undefined);
expect.any = (C) =>
  asym(`any ${C.name}`, (x) =>
    C === Number ? typeof x === "number" : C === String ? typeof x === "string" : C === Boolean ? typeof x === "boolean" : C === Function ? typeof x === "function" : C === Object ? isObj(x) : x instanceof C,
  );
expect.closeTo = (w, d = 2) => asym("closeTo", (x) => typeof x === "number" && Math.abs(x - w) < Math.pow(10, -d) / 2);
expect.soft = expect;

// ---- vi ----
function fn(impl) {
  let current = impl;
  const once = [];
  const f = function (...a) {
    f.mock.calls.push(a);
    const i = once.length ? once.shift() : current;
    const r = i ? i.apply(this, a) : undefined;
    f.mock.results.push({ type: "return", value: r });
    return r;
  };
  f.mock = { calls: [], results: [] };
  f.mockImplementation = (i) => ((current = i), f);
  f.mockImplementationOnce = (i) => (once.push(i), f);
  f.mockReturnValue = (v) => ((current = () => v), f);
  f.mockResolvedValue = (v) => ((current = async () => v), f);
  f.mockRejectedValue = (v) => ((current = async () => Promise.reject(v)), f);
  f.mockClear = () => ((f.mock.calls = []), (f.mock.results = []), f);
  f.mockReset = () => ((current = undefined), f.mockClear());
  f.mockRestore = () => f.mockReset();
  return f;
}
const stubbed = [];
let fakeTimeouts = null;
export const vi = {
  fn,
  useFakeTimers(o = {}) {
    globalThis.Date = FakeDate;
    if (fakeNow === null) fakeNow = RealDate.now();
    if (o.now !== undefined) fakeNow = +new RealDate(o.now);
    if (o.toFake && o.toFake.includes("setTimeout")) {
      fakeTimeouts = [];
      let id = 1;
      globalThis.setTimeout = (f, ms, ...a) => {
        fakeTimeouts.push({ id: ++id, f, a, at: (fakeNow ?? 0) + (ms || 0) });
        return id;
      };
    }
    return vi;
  },
  useRealTimers() {
    globalThis.Date = RealDate;
    fakeNow = null;
    if (fakeTimeouts) {
      globalThis.setTimeout = realSetTimeout;
      fakeTimeouts = null;
    }
    return vi;
  },
  setSystemTime(d) {
    fakeNow = +new RealDate(d);
    return vi;
  },
  getRealSystemTime: () => RealDate.now(),
  advanceTimersByTime(ms) {
    if (fakeNow !== null) fakeNow += ms;
    if (fakeTimeouts) {
      const due = fakeTimeouts.filter((t) => t.at <= fakeNow);
      fakeTimeouts = fakeTimeouts.filter((t) => t.at > fakeNow);
      for (const t of due) t.f(...t.a);
    }
    return vi;
  },
  async advanceTimersByTimeAsync(ms) {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    return vi;
  },
  spyOn(obj, key) {
    const orig = obj[key];
    const f = fn(function (...a) {
      return orig.apply(this, a);
    });
    obj[key] = f;
    f.mockRestore = () => {
      obj[key] = orig;
    };
    return f;
  },
  stubGlobal(k, v) {
    stubbed.push([k, Object.getOwnPropertyDescriptor(globalThis, k)]);
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
    return vi;
  },
  unstubAllGlobals() {
    for (const [k, d] of stubbed.splice(0).reverse()) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
    return vi;
  },
  restoreAllMocks() {},
  clearAllMocks() {},
};

// ---- running ----
export async function __run(filter) {
  let pass = 0;
  let failN = 0;
  let skipped = 0;
  const fails = [];
  const want = filter ? new RegExp(filter) : null;
  const chain = (s) => (s.parent ? [...chain(s.parent), s] : [s]);
  async function suite(s) {
    const path = chain(s)
      .map((x) => x.name)
      .filter(Boolean)
      .join(" > ");
    const mine = s.tests.filter((t) => !want || want.test(`${path} ${t.name}`));
    const hasWork = (x) => x.tests.some((t) => !want || want.test(`${chain(x).map((y) => y.name).filter(Boolean).join(" > ")} ${t.name}`)) || x.children.some(hasWork);
    if (!hasWork(s)) {
      skipped += s.tests.length;
      return;
    }
    skipped += s.tests.length - mine.length;
    for (const f of s.beforeAll) await f();
    for (const t of mine) {
      const t0 = RealDate.now();
      try {
        for (const x of chain(s)) for (const f of x.before) await f();
        await t.fn();
        for (const x of chain(s).reverse()) for (const f of x.after) await f();
        pass++;
        console.log(`  ✓ ${path ? `${path} > ` : ""}${t.name.slice(0, 150)} (${RealDate.now() - t0} ms)`);
      } catch (e) {
        failN++;
        try {
          for (const x of chain(s).reverse()) for (const f of x.after) await f();
        } catch {
          /* the first error is the one to show */
        }
        const msg = e && e.stack ? (e instanceof AssertionError ? `${e.message}\n${String(e.stack).split("\n").filter((l) => /\.test\.|e2e/.test(l)).slice(0, 3).join("\n")}` : e.stack) : String(e);
        fails.push(`✗ ${path ? `${path} > ` : ""}${t.name}\n${msg}`);
        console.log(`  ✗ ${path ? `${path} > ` : ""}${t.name.slice(0, 150)}\n${msg}`);
      }
    }
    for (const c of s.children) await suite(c);
    for (const f of s.afterAll) await f();
  }
  await suite(root);
  console.log(`\n${pass} passed, ${failN} failed${skipped ? `, ${skipped} not run` : ""}`);
  return failN;
}
