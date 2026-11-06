// Settings → Race (7 Nov 2026, his voice note): the family app's race has every student, joined or not, with XP from
// class and home, his grade and the whole ARISTORA, any student's profile one tap away, cheers. Here:
// - the owner: the marks switch (his answer for the profiles was "Everything"; this is the way back if a parent
//   complains: classmates stop seeing a student's marks, the rest stays) and the centre's prizes (his ask: "gift cards
//   ... ice-cream or chicken fries"): each grade's champion, ARISTORA's champion, the grade cup; Monday 00:05 gives them;
// - the owner and the Manager: the gifts to give (the student's phone shows his card until Given) and given lately;
// - the owner, Reports and the Manager: last week's champions and their poster for the WhatsApp group and the wall.

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Champions, GiftItem, Prizes } from "../convex/race";
import { mutate, subscribe } from "./backend";
import { championsFile, drawChampions, weekSpan } from "./champions";
import { useQuery } from "./live";
import { saveFiles, shareFiles } from "./poster";
import { act, may, toast } from "./store";

/** Gifts waiting to be given (the gear's count): the owner and the Manager. */
export function useGiftsWaiting(allowed: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!allowed) return;
    return subscribe(
      api.race.giftCount,
      {},
      (x) => setN(x),
      () => setN(0),
    );
  }, [allowed]);
  return allowed ? n : 0;
}

const WIN: Record<GiftItem["kind"], string> = { g: "👑 Grade champion", a: "🏆 ARISTORA champion", cup: "🥇 Grade cup" };

function MarksSwitch() {
  const s = useQuery<{ marks: boolean; prizes: Prizes }>(api.race.settings, {});
  const [busy, setBusy] = useState(false);
  if (!s) return null;
  return (
    <section class="phq-sum">
      <b>Profiles</b>
      <label class="phq-req">
        <input
          type="checkbox"
          checked={s.marks}
          disabled={busy}
          onChange={() => {
            setBusy(true);
            void act(() => mutate(api.race.setMarks, { on: !s.marks })).finally(() => setBusy(false));
          }}
        />
        <span>Classmates see a student's marks on his profile (% right, questions, each Stage's marks)</span>
      </label>
      <small class="muted">
        {s.marks
          ? "On: everything, as you chose. Turn it off if a parent asks: his own phone still shows him everything."
          : "Off: classmates see his Levels, XP, days and trophies, not his marks. His own phone still shows him everything."}
      </small>
    </section>
  );
}

function PrizeForm() {
  const s = useQuery<{ marks: boolean; prizes: Prizes }>(api.race.settings, {});
  const [p, setP] = useState<Prizes | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (s && !p) setP(s.prizes);
  }, [s]);
  if (!s || !p) return null;
  const changed = p.g !== s.prizes.g || p.a !== s.prizes.a || p.cup !== s.prizes.cup;
  const field = (k: keyof Prizes, label: string, hint: string) => (
    <label class="rc-prize">
      <span>
        {label}
        <small class="muted">{hint}</small>
      </span>
      <input value={p[k]} maxLength={40} placeholder="No gift" onInput={(e) => setP({ ...p, [k]: (e.target as HTMLInputElement).value })} />
    </label>
  );
  return (
    <section class="rc-box">
      <b>Gifts from the centre</b>
      <small class="muted">
        Monday 00:05 gives last week's winners a gift card on their phone (empty = no gift). The ARISTORA champion is his
        grade's champion too: both gifts.
      </small>
      {field("g", "👑 Each grade's champion", "the most XP in his grade, one a grade")}
      {field("a", "🏆 ARISTORA champion", "the most XP of everyone")}
      {field("cup", "🥇 Grade cup", "every student who learned in the grade that won")}
      <button
        type="button"
        class="btn primary wide"
        disabled={busy || !changed}
        onClick={() => {
          setBusy(true);
          void act(() => mutate(api.race.setPrizes, p))
            .then((r) => r && toast("Prizes saved."))
            .finally(() => setBusy(false));
        }}
      >
        Save the prizes
      </button>
    </section>
  );
}

function GiftList() {
  const g = useQuery<{ open: GiftItem[]; given: GiftItem[] }>(api.race.gifts, {});
  const [busy, setBusy] = useState<string | null>(null);
  if (!g) return null;
  const give = (x: GiftItem, given: boolean) => {
    setBusy(x.id);
    void act(() => mutate(api.race.give, { id: x.id as never, given }))
      .then((r) => {
        if (r && given) toast(`${x.n}: ${x.what} given.`, "info", () => void mutate(api.race.give, { id: x.id as never, given: false }));
      })
      .finally(() => setBusy(null));
  };
  return (
    <section class="rc-box">
      <b>Gifts to give{g.open.length ? ` · ${g.open.length}` : ""}</b>
      {g.open.length === 0 ? (
        <small class="muted">Nothing waits. Monday's winners get theirs when you set a prize above.</small>
      ) : (
        <ul class="rc-gifts">
          {g.open.map((x) => (
            <li key={x.id}>
              <span>
                <b>
                  {x.n}
                  {x.g !== null ? <i class="rc-g">{x.g}</i> : null}
                </b>
                <small>
                  {x.what} · {WIN[x.kind]} · {weekSpan(x.wk)}
                </small>
              </span>
              <button type="button" class="btn primary" disabled={busy === x.id} onClick={() => give(x, true)}>
                Given
              </button>
            </li>
          ))}
        </ul>
      )}
      {g.given.length > 0 && (
        <details class="rc-given">
          <summary>Given lately · {g.given.length}</summary>
          <ul class="rc-gifts">
            {g.given.map((x) => (
              <li key={x.id}>
                <span>
                  <b>{x.n}</b>
                  <small>
                    {x.what} · {x.by ?? ""}
                  </small>
                </span>
                <button type="button" class="btn ghost" disabled={busy === x.id} onClick={() => give(x, false)}>
                  Undo
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ChampionsCard() {
  const c = useQuery<Champions>(api.race.champions, {});
  const [busy, setBusy] = useState(false);
  if (!c) return null;
  const ones = (k: "g" | "a", g?: number) => c.top.filter((x) => x.k === k && x.place === 1 && (g === undefined || x.g === g));
  const all = ones("a");
  const cup = c.cup[0];
  const share = async (save: boolean) => {
    setBusy(true);
    try {
      const file = await championsFile(await drawChampions(c), c.wk);
      if (save) saveFiles([file]);
      else {
        const r = await shareFiles([file], `ARISTORA · Champions · ${weekSpan(c.wk)}`);
        if (r === "saved") toast("Saved the image.");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "The phone couldn't make the image.", "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section class="rc-box">
      <b>Last week's champions · {weekSpan(c.wk)}</b>
      <ul class="rc-champs">
        <li>
          <span>🏆 ARISTORA</span>
          <b>{all.length ? `${all.map((x) => x.n).join(" · ")} · ${all[0].xp} XP` : "—"}</b>
        </li>
        {[6, 7, 8, 9, 10, 11].map((g) => {
          const w = ones("g", g);
          return (
            <li key={g}>
              <span>👑 {g}</span>
              <b>{w.length ? `${w.map((x) => x.n).join(" · ")} · ${w[0].xp} XP` : "—"}</b>
            </li>
          );
        })}
        <li>
          <span>🥇 Cup</span>
          <b>{cup && cup.n > 0 ? `Grade ${cup.g} · ${cup.n}/${cup.of} learned` : "—"}</b>
        </li>
      </ul>
      {!c.kept && <small class="muted">Worked out now from the race; Monday 00:05 keeps it for good.</small>}
      <div class="rc-row">
        <button type="button" class="btn primary" disabled={busy} onClick={() => void share(false)}>
          Share poster
        </button>
        <button type="button" class="btn ghost" disabled={busy} onClick={() => void share(true)}>
          Save
        </button>
      </div>
    </section>
  );
}

export function RaceSettings() {
  const owner = may("owner");
  return (
    <div class="settings-body rc">
      <section class="phq-sum">
        <b>The race in the family app</b>
        <small class="muted">
          Every student is in it, on the app or not: XP from class and from home, his grade and the whole ARISTORA, last
          week's champions with a 👑. A student can open anyone's profile and cheer him (👏, no words).
        </small>
      </section>
      {(owner || may("manager")) && <GiftList />}
      <ChampionsCard />
      {owner && <PrizeForm />}
      {owner && <MarksSwitch />}
    </div>
  );
}
