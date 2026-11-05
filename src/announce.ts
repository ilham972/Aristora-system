// What the phones say out loud. Plain words, so a student across the hall knows it's them.

export type RoomName = "theory" | "evaluation";
const ROOM_WORD: Record<RoomName, string> = { theory: "Theory", evaluation: "Evaluation" };

function clean(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/** "Ahamed", "Ahamed and Nila", "Ahamed, Dilan and Nila". */
export function joinNames(names: string[]): string {
  const n = names.map(clean).filter(Boolean);
  if (n.length <= 1) return n[0] ?? "";
  return `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
}

/** `consult`: her consultation (5 Nov 2026): the phone says only her name (his answer: "Kumar, go to Ilham."). */
type Called = { name: string; room: RoomName; teacher?: string; consult?: boolean };

/** The calls grouped by room, then by the teacher who called them (31 Oct 2026: each teacher has her own room). */
function byTeacher(calls: Called[]): { room: RoomName; teacher: string; consult: boolean; names: string[] }[] {
  const out: { room: RoomName; teacher: string; consult: boolean; names: string[] }[] = [];
  for (const room of ["theory", "evaluation"] as const) {
    for (const c of calls) {
      if (c.room !== room) continue;
      const teacher = clean(c.teacher ?? "");
      const consult = !!c.consult && !!teacher;
      const g = out.find((x) => x.room === room && x.teacher === teacher && x.consult === consult);
      if (g) g.names.push(c.name);
      else out.push({ room, teacher, consult, names: [c.name] });
    }
  }
  return out;
}

/** "Fathima in Theory" (her own room), just "Theory" for a call without a teacher, or "Ilham" (a consultation). */
function whereTo(room: RoomName, teacher: string, consult = false): string {
  if (consult) return teacher;
  return teacher ? `${teacher} in ${ROOM_WORD[room]}` : ROOM_WORD[room];
}

/** Correction's phone: "Ahamed and Nila, go to Fathima in Theory. Kumar, go to Nila in Evaluation. Raj, go to Ilham." */
export function callPhrase(calls: Called[]): string {
  return byTeacher(calls)
    .map((g) => `${joinNames(g.names)}, go to ${whereTo(g.room, g.teacher, g.consult)}.`)
    .join(" ");
}

/** Correction's phone, when a student sent to a room isn't there after 3 minutes: go and find him. */
export function lostPhrase(calls: Called[]): string {
  return byTeacher(calls)
    .map((g) => `${joinNames(g.names)} ${g.names.length === 1 ? "hasn't" : "haven't"} reached ${whereTo(g.room, g.teacher, g.consult)}.`)
    .join(" ");
}

/**
 * A teacher's phone, when the manager sends her students (3 Nov 2026): "Raj is coming to you." Said again every 30 s
 * until she taps Arrived. `open`: they are for her other page ("Raj is coming to you. Open Evaluation.").
 */
export function comingPhrase(names: string[], open?: RoomName): string {
  const who = joinNames(names);
  if (!who) return "";
  return `${who} ${names.length === 1 ? "is" : "are"} coming to you.${open ? ` Open ${ROOM_WORD[open]}.` : ""}`;
}

/** Evaluation's phone, when Theory takes a student straight from the evaluation room. */
export function pullPhrase(names: string[]): string {
  const who = joinNames(names);
  return who ? `Theory wants ${who} now.` : "";
}
