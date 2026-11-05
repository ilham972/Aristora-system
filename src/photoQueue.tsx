// Settings → Photos (4 Nov 2026, his voice notes: "if the student done at home, everything will be done at home"): what
// students send from the family app. Since 5 Nov 2026 they are marked in Correction's ⌂ lane (src/homeLane.tsx: his
// photos big and turned with ↻, each sub-question its own marks, Save → the next by itself); here stay how many wait
// and since when, the owner's "Photos required" switch, and one button to the lane. The count is on the Settings gear
// (red when one waited over a day), for the owner and the people he ticks for Photos.

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { mutate, subscribe } from "./backend";
import type { View } from "./derive";
import { ago, isLate, useLaneList } from "./homeLane";
import { useQuery } from "./live";
import { may } from "./store";

/** Photos waiting for a teacher (the gear's count); late = one waited over a day. */
export function usePhotosWaiting(allowed: boolean): { n: number; late: boolean } {
  const [v, setV] = useState({ n: 0, late: false });
  useEffect(() => {
    if (!allowed) return;
    return subscribe(
      api.photos.count,
      {},
      (x) => setV(x),
      () => setV({ n: 0, late: false }),
    );
  }, [allowed]);
  return allowed ? v : { n: 0, late: false };
}

export function PhotoQueue(props: { views: View[]; onOpen?: () => void }) {
  const list = useLaneList(true, props.views);
  const required = useQuery<boolean>(api.photos.required, {});
  const owner = may("owner");
  const [busy, setBusy] = useState(false);
  if (!list) return <p class="muted settings-body">Loading…</p>;
  const n = list.reduce((s, x) => s + x.n, 0);
  const oldest = list[0];
  return (
    <div class="settings-body phq">
      <section class="phq-sum">
        <b class={oldest && isLate(oldest) ? "late" : ""}>
          {n === 0 ? "No photos waiting" : `${n} to mark from ${list.length} student${list.length === 1 ? "" : "s"} · oldest ${ago(oldest.at)}`}
        </b>
        <small class="muted">
          From the family app: drawings and parts the phone can't mark, and the working on wrong answers. They are marked in
          Correction → ⌂: his photos big (↻ turns one), each sub-question its own marks. A photo goes a day after you mark it.
        </small>
        {owner && required !== undefined && (
          <label class="phq-req">
            <input
              type="checkbox"
              checked={required}
              disabled={busy}
              onChange={() => {
                setBusy(true);
                void mutate(api.photos.setRequired, { on: !required }).finally(() => setBusy(false));
              }}
            />
            <span>Photos required: 2 levels at most without them</span>
          </label>
        )}
      </section>
      {props.onOpen && (
        <button type="button" class="btn primary phq-open" onClick={props.onOpen}>
          ⌂ Mark them in Correction{n ? ` (${n})` : ""}
        </button>
      )}
    </div>
  );
}
