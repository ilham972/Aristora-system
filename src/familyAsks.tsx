// Settings → Students → Waiting for your OK (4 Nov 2026, his answers): what students asked for in the family app.
// - A photo for the race: his own phone shows it at once; his classmates see it only after OK. No = it goes, and his
//   phone says so once.
// - A new name: it changes everywhere (the class, the race, the teachers' screens) only after OK, as Rename does.
// The owner and teachers with Students answer; the count of asks waiting is on the Settings gear.

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { AskItem } from "../convex/families";
import { slClock, slDate, slDayNo } from "../convex/lib/day";
import { mutate, subscribe } from "./backend";
import { useQuery } from "./live";
import { act, currentRole, toast } from "./store";

/** How many asks wait for an OK (the Settings gear's count); 0 without Students. */
export function useAskCount(allowed: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!allowed) return;
    return subscribe(
      api.families.askCount,
      {},
      (v) => setN(v),
      () => setN(0),
    );
  }, [allowed]);
  return allowed ? n : 0;
}

function when(at: number): string {
  const days = slDayNo(Date.now()) - slDayNo(at);
  return `${days === 0 ? "today" : days === 1 ? "yesterday" : slDate(at)}, ${slClock(at)}`;
}

/** OK or No for one ask (a photo, a name): the words the toast says after. */
export async function answerAsk(a: Pick<AskItem, "id" | "kind" | "name" | "want">, yes: boolean) {
  const r = await act(() => mutate(api.families.answer, { id: a.id, yes, by: currentRole() }));
  if (r === undefined) return;
  if (r === false) return toast(`${a.name} took this photo back.`);
  const first = a.name.split(" ")[0];
  toast(
    a.kind === "photo"
      ? yes
        ? `${first}'s photo is in the race now.`
        : `Not accepted: ${first}'s phone asks for another photo.`
      : yes
        ? `${a.name} is ${a.want} now, everywhere.`
        : `Not accepted: ${first}'s name stays.`,
  );
}

/** The asks waiting for an OK, oldest first: nothing shows when there are none. */
export function FamilyAsks() {
  const asks = useQuery<AskItem[]>(api.families.asks, {});
  if (!asks || asks.length === 0) return null;
  return (
    <section class="fa-box" aria-label="Waiting for your OK">
      <h3 class="block-title">
        Waiting for your OK <b class="fa-n">{asks.length}</b>
      </h3>
      <p class="muted small">From the family app: a photo shows in the race, a new name changes everywhere, only after OK.</p>
      <ul class="plain-list fa-list">
        {asks.map((a) => (
          <li key={a.id} class="fa-item">
            {a.kind === "photo" && a.pic ? (
              <img class="fa-pic" src={a.pic} alt={`${a.name}'s new photo`} />
            ) : (
              <span class="fa-nm" aria-hidden="true">
                Aa
              </span>
            )}
            <span class="fa-w">
              <b>{a.name}</b>
              <small>
                {a.kind === "photo" ? (a.had ? "A new photo (the old one stays until OK)" : "Photo for the race") : `Wants the name: ${a.want}`}
              </small>
              <small class="muted">
                {a.grade ? `Grade ${a.grade} · ` : ""}
                {when(a.at)}
              </small>
            </span>
            <span class="fa-b">
              <button type="button" class="btn small" onClick={() => void answerAsk(a, true)}>
                OK
              </button>
              <button type="button" class="btn small ghost" onClick={() => void answerAsk(a, false)}>
                No
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
