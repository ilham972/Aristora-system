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

type Called = { name: string; room: RoomName; teacher?: string };

/** The calls grouped by room, then by the teacher who called them (31 Oct 2026: each teacher has her own room). */
function byTeacher(calls: Called[]): { room: RoomName; teacher: string; names: string[] }[] {
  const out: { room: RoomName; teacher: string; names: string[] }[] = [];
  for (const room of ["theory", "evaluation"] as const) {
    for (const c of calls) {
      if (c.room !== room) continue;
      const teacher = clean(c.teacher ?? "");
      const g = out.find((x) => x.room === room && x.teacher === teacher);
      if (g) g.names.push(c.name);
      else out.push({ room, teacher, names: [c.name] });
    }
  }
  return out;
}

/** "Fathima in Theory" (her own room), or just "Theory" for a call without a teacher. */
function whereTo(room: RoomName, teacher: string): string {
  return teacher ? `${teacher} in ${ROOM_WORD[room]}` : ROOM_WORD[room];
}

/** Correction's phone: "Ahamed and Nila, go to Fathima in Theory. Kumar, go to Nila in Evaluation." */
export function callPhrase(calls: Called[]): string {
  return byTeacher(calls)
    .map((g) => `${joinNames(g.names)}, go to ${whereTo(g.room, g.teacher)}.`)
    .join(" ");
}

/** Correction's phone, when a student sent to a room isn't there after 3 minutes: go and find him. */
export function lostPhrase(calls: Called[]): string {
  return byTeacher(calls)
    .map((g) => `${joinNames(g.names)} ${g.names.length === 1 ? "hasn't" : "haven't"} reached ${whereTo(g.room, g.teacher)}.`)
    .join(" ");
}

/** Evaluation's phone, when Theory takes a student straight from the evaluation room. */
export function pullPhrase(names: string[]): string {
  const who = joinNames(names);
  return who ? `Theory wants ${who} now.` : "";
}
