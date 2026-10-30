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

/** Correction's phone: "Ahamed and Nila, go to Theory. Kumar, go to Evaluation." */
export function callPhrase(calls: { name: string; room: RoomName }[]): string {
  const parts: string[] = [];
  for (const room of ["theory", "evaluation"] as const) {
    const names = calls.filter((c) => c.room === room).map((c) => c.name);
    if (names.length) parts.push(`${joinNames(names)}, go to ${ROOM_WORD[room]}.`);
  }
  return parts.join(" ");
}

/** Correction's phone, when a student sent to a room isn't there after 3 minutes: go and find him. */
export function lostPhrase(calls: { name: string; room: RoomName }[]): string {
  const parts: string[] = [];
  for (const room of ["theory", "evaluation"] as const) {
    const names = calls.filter((c) => c.room === room).map((c) => c.name);
    if (names.length) parts.push(`${joinNames(names)} ${names.length === 1 ? "hasn't" : "haven't"} reached ${ROOM_WORD[room]}.`);
  }
  return parts.join(" ");
}

/** Evaluation's phone, when Theory takes a student straight from the evaluation room. */
export function pullPhrase(names: string[]): string {
  const who = joinNames(names);
  return who ? `Theory wants ${who} now.` : "";
}
