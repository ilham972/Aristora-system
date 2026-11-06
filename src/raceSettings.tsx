// Settings → Race (the owner; 7 Nov 2026, his voice note): the family app's race has every student, joined or not, with
// XP from class and home, his grade and the whole ARISTORA, and any student's profile one tap away. His answer for the
// profiles was "Everything"; this switch is the way back if a parent complains: classmates stop seeing a student's
// marks (% right, his questions, each Stage's marks), the rest stays (Levels, XP, days, trophies, 👑).

import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { mutate } from "./backend";
import { useQuery } from "./live";

export function RaceSettings() {
  const s = useQuery<{ marks: boolean }>(api.race.settings, {});
  const [busy, setBusy] = useState(false);
  if (!s) return <p class="muted settings-body">Loading…</p>;
  return (
    <div class="settings-body phq">
      <section class="phq-sum">
        <b>The race in the family app</b>
        <small class="muted">
          Every student is in it, on the app or not: XP from class and from home, his grade and the whole ARISTORA, last
          week's champions with a 👑. A student can open anyone's profile and cheer him (👏, no words).
        </small>
        <label class="phq-req">
          <input
            type="checkbox"
            checked={s.marks}
            disabled={busy}
            onChange={() => {
              setBusy(true);
              void mutate(api.race.setMarks, { on: !s.marks }).finally(() => setBusy(false));
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
    </div>
  );
}
