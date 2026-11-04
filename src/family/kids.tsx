// The children on this phone (3 Nov 2026, his voice note: parents with two children): switch, add another, sign one
// out. Shown in the top row's sheet and on Me.

import { useState } from "preact/hooks";
import { MAX_ACCOUNTS, type Account } from "./net";
import { picOf, usePics } from "./pics";
import { Avatar, firstName, Icon } from "./ui";

export const whoWords = (a: { grade?: number | null; index?: number | null }) =>
  [a.grade ? `Grade ${a.grade}` : "", a.index ? `#${a.index}` : ""].filter(Boolean).join(" · ");

/** The children on this phone: tap one to switch; add another; sign the one on screen out (after a second tap). */
export function Kids(props: { list: Account[]; current: Account | null; onSwitch: (id: string) => void; onAdd: () => void; onSignOut: () => void }) {
  const [sure, setSure] = useState(false);
  const cur = props.current;
  usePics(props.list.map((a) => a.pic));
  return (
    <div class="f-kids">
      <ul class="f-kid-list">
        {props.list.map((a) => (
          <li key={a.id}>
            <button type="button" class={`f-kid${a.id === cur?.id ? " on" : ""}`} aria-pressed={a.id === cur?.id} onClick={() => props.onSwitch(a.id)}>
              <Avatar name={a.name || "?"} pic={picOf(a.pic)} />
              <span class="f-kid-w">
                <b>{a.name || "…"}</b>
                <small>{whoWords(a)}</small>
              </span>
              {a.id === cur?.id && (
                <i class="f-kid-on">
                  <Icon name="check" size={18} />
                </i>
              )}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" class="f-btn ghost f-add" disabled={props.list.length >= MAX_ACCOUNTS} onClick={props.onAdd}>
        <Icon name="plus" size={18} /> Add a child
      </button>
      {cur &&
        (sure ? (
          <div class="f-sure rise" role="alertdialog" aria-label="Sign out">
            <p>
              {firstName(cur.name)} இந்த phone இலிருந்து வெளியேறவா? மீண்டும் வர index எண்ணும் code உம் வேண்டும்.
            </p>
            <div class="f-sure-b">
              <button type="button" class="f-btn danger" onClick={props.onSignOut}>
                Sign out
              </button>
              <button type="button" class="f-btn ghost" onClick={() => setSure(false)}>
                No
              </button>
            </div>
          </div>
        ) : (
          <button type="button" class="f-link danger" onClick={() => setSure(true)}>
            <Icon name="out" size={18} /> Sign out {firstName(cur.name)}
          </button>
        ))}
    </div>
  );
}
