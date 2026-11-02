// The Manager page (2 Nov 2026, his voice note: "one person runs the entire app and system"; the owner's first bottom
// tab). Theory and Evaluation teachers have no phone: he sends each group to a teacher himself, says each student's
// question numbers as they go, and taps Back when they return. Rules in src/managerData.ts.
// - Teachers: one card each. Busy: who is with her, how long, about how long is left; Back (= everything explained or
//   taught); tap a student for "not everything". Free: her next group is in Do now with her name.
// - Correction: levels to correct, the oldest; red = no work until it is corrected.
// - Do now: the groups to send, worst first: names big, each with his question numbers. Send / Not now.
// - Waiting on purpose (the hold rule: his pick, 20 minutes at most): who and why; Send now.
// - Can't solve, Check on, on paper, and the same question explained more than once today.

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { slClock, slDay } from "../convex/lib/day";
import { joinNames } from "./announce";
import { mutate } from "./backend";
import type { View } from "./derive";
import type { Decision, EvalHere } from "./evalFocusData";
import { useQuery } from "./live";
import {
  backAll,
  backEval,
  backTheory,
  bookWords,
  JOB_WORDS,
  managerPlan,
  qsWords,
  SNOOZE_MS,
  type Held,
  type Job,
  type PersonCard,
  type SendTask,
  type Teacher,
} from "./managerData";
import { MoveSheet } from "./move";
import { act, type Board, toast } from "./store";
import { lessonLength, mShort, type RoomLesson, type RoomStudent } from "./theoryFocusData";
import { tone } from "./tones";
import { Sheet } from "./ui";

/** The manager's taps go in the history as his. */
const BY = "manager";
type TeamRow = { _id: string; name: string; tabs: string[] };

/** Teachers he marked "not teaching today": this phone, today only. */
function useAway(now: number): [Set<string>, (id: string, away: boolean) => void] {
  const day = slDay(now);
  const read = (): Set<string> => {
    try {
      const raw = JSON.parse(localStorage.getItem("aristora.mgr.away") ?? "null") as { day: string; ids: string[] } | null;
      return new Set(raw && raw.day === day ? raw.ids : []);
    } catch {
      return new Set();
    }
  };
  const [ids, setIds] = useState<Set<string>>(read);
  useEffect(() => setIds(read()), [day]);
  const set = (id: string, away: boolean) => {
    const next = new Set(ids);
    if (away) next.add(id);
    else next.delete(id);
    setIds(next);
    try {
      localStorage.setItem("aristora.mgr.away", JSON.stringify({ day, ids: [...next] }));
    } catch {
      /* private mode: this visit only */
    }
  };
  return [ids, set];
}

/** "Raj, Zara +2": a group's names, short. */
const shortNames = (names: string[]) => (names.length <= 3 ? joinNames(names) : `${names.slice(0, 2).join(", ")} +${names.length - 2}`);
const jobsOf = (tabs: string[]): Job[] => (["evaluation", "theory"] as const).filter((j) => tabs.includes(j));
const unitTa = (t: Pick<SendTask, "unit">) => t.unit?.ta ?? "";

export function ManagerPage(props: { board: Board; views: View[]; now: number }) {
  const { board, views, now } = props;
  const rows = useQuery<TeamRow[]>(api.people.team, {});
  const recent = useQuery<{ ms: number[] }>(api.calls.lessons, {});
  const [away, setAway] = useAway(now);
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<{ teacher: string; key: string } | null>(null);
  const [moving, setMoving] = useState<View | null>(null);
  const team: Teacher[] = (rows ?? []).map((r) => ({ id: r._id, name: r.name, jobs: jobsOf(r.tabs) }));
  const lessonMs = lessonLength(recent?.ms);
  const quietSet = new Set(Object.entries(snoozed).filter(([, until]) => until > now).map(([k]) => k));
  const plan = managerPlan(board, views, now, team, { lessonMs, snoozed: quietSet, away });
  const inClass = views.filter((v) => v.where !== "absent");

  /** Send a group: they go to her now (he tells each his numbers). Undo for 2 minutes. */
  const send = async (t: SendTask) => {
    if (!t.to) {
      toast("Nobody can take them now. Tap a teacher's card when she is free, or add one in Settings → People.", "error");
      return;
    }
    const to = t.to;
    setBusy(true);
    const books = t.who.flatMap((w) =>
      w.v.unit && (w.v.stage === "fighter" || w.v.stage === "master") ? [{ studentId: w.v.s._id, unitId: w.v.unit._id, stage: w.v.stage }] : [],
    );
    const res = await act(() =>
      mutate(api.calls.create, {
        studentIds: t.who.map((w) => w.v.s._id),
        room: t.job,
        kind: t.job,
        books,
        teacherId: to.id as Id<"users">,
        here: true,
        by: BY,
      }),
    );
    setBusy(false);
    if (!res) return;
    for (const r of res.rejected) toast(`${r.name} ${r.reason}.`, "error");
    const ids = res.created.map((c) => c.callId);
    if (!ids.length) return;
    tone("call");
    const sent = t.who.filter((w) => res.created.some((c) => c.studentId === w.v.s._id)).map((w) => w.v.s.name);
    toast(`${joinNames(sent)} → ${to.name}.`, "info", () => {
      void act(() => mutate(api.calls.unsend, { callIds: ids, by: BY })).then((r) => r && toast("Taken back: they stay in the hall."));
    });
  };

  /** "Send now" on someone held: the group he would go in, now. */
  const sendNow = async (h: Held) => {
    const forced = managerPlan(board, views, now, team, { lessonMs, away, force: new Set([h.v.key]) });
    const t = forced.tasks.find((x) => x.who.some((w) => w.v.s._id === h.v.s._id));
    if (t) await send(t);
    else toast(`${h.v.s.name} can't be sent now.`, "error");
  };

  /** Back: everything explained / taught, all back to work. */
  const back = async (p: PersonCard) => {
    const items = backAll(p);
    if (!items.length) return;
    setBusy(true);
    const res = await act(() => mutate(api.calls.finish, { items: items.map((i) => ({ ...i, callId: i.callId as Id<"calls"> })), by: BY }));
    setBusy(false);
    if (!res) return;
    tone("done");
    const names = [...p.evalHere.map((h) => h.v.s.name), ...p.theory.flatMap((l) => l.here.map((st) => st.v.s.name))];
    toast(`${joinNames(names)}: back to work.`);
  };

  /** Called by a teacher's own phone and not with her yet: not now. */
  const cancel = async (ids: string[]) => {
    await act(() => mutate(api.calls.cancel, { callIds: ids as Id<"calls">[], by: "correction" }));
  };

  const open = sheet ? plan.people.find((p) => p.t.id === sheet.teacher) : undefined;
  const openEval = open?.evalHere.find((h) => h.v.key === sheet?.key);
  const openTheory = open?.theory.flatMap((l) => l.here.map((st) => ({ l, st }))).find((x) => x.st.v.key === sheet?.key);

  if (inClass.length === 0) {
    return (
      <div class="mg-page">
        <p class="mg-empty">Nobody is signed in yet. Sign students in from the count at the top.</p>
      </div>
    );
  }

  const awayList = team.filter((t) => away.has(t.id) && !plan.people.some((p) => p.t.id === t.id));
  // A card for each group someone can take (now, or next when she is free); the rest in one line, until a teacher frees.
  const toDo = plan.tasks.filter((t) => t.to);
  const later = plan.tasks.filter((t) => !t.to);

  return (
    <div class="mg-page">
      <section class="mg-people" aria-label="Teachers">
        {plan.people.map((p) => (
          <PersonBox key={p.t.id} p={p} now={now} busy={busy} onBack={() => void back(p)} onOpen={(key) => setSheet({ teacher: p.t.id, key })} onAway={(a) => setAway(p.t.id, a)} onCancel={(ids) => void cancel(ids)} />
        ))}
        {plan.noTeachers && team.length === 0 && rows !== undefined && (
          <p class="mg-note">No Theory or Evaluation teacher yet: Settings → People → Add a teacher (her phone isn't needed).</p>
        )}
        <CorrectionBox c={plan.correction} now={now} />
      </section>

      <h2 class="mg-h">Do now{toDo.length ? ` · ${toDo.length}` : ""}</h2>
      {toDo.length === 0 ? (
        <p class="mg-none">
          {later.length
            ? "Nobody can take a group now."
            : plan.held.length
              ? "Nothing to send yet: the groups below are filling."
              : "Nothing to send. Everyone has work."}
        </p>
      ) : (
        toDo.map((t) => (
          <TaskCard key={t.key} t={t} now={now} busy={busy} onSend={() => void send(t)} onSnooze={() => setSnoozed({ ...snoozed, [t.key]: now + SNOOZE_MS })} />
        ))
      )}
      {later.length > 0 && (
        <div class="mg-later">
          <b>Also waiting</b> (after these):{" "}
          {later.map((t, i) => (
            <span key={t.key} class={`h-${t.heat}`}>
              {i ? " · " : ""}
              {joinNames(t.who.map((w) => w.v.s.name))} <i>{JOB_WORDS[t.job]}{t.section ? ` ${t.section}` : ""}</i>
            </span>
          ))}
        </div>
      )}

      {plan.held.length > 0 && (
        <>
          <h2 class="mg-h">Waiting on purpose</h2>
          <p class="mg-sub">They keep working while others reach the same question: one explanation for all (20 min at most).</p>
          {plan.held.map((h) => (
            <div key={h.key} class={`mg-held j-${h.job}`}>
              <div class="mg-held-l">
                <span class="mg-nm">{h.v.s.name}</span>
                <span class="mg-qs">
                  {h.qs.map((q) => (
                    <i key={q}>{q}</i>
                  ))}
                </span>
                <span class="mg-why">
                  {h.why}
                  {h.sendBy ? ` · goes by ${slClock(h.sendBy)}` : ""}
                </span>
              </div>
              <button type="button" class="btn ghost small" disabled={busy} onClick={() => void sendNow(h)}>
                Send now
              </button>
            </div>
          ))}
        </>
      )}

      {(plan.stuck.length > 0 || plan.quiet.length > 0) && (
        <>
          <h2 class="mg-h">You decide</h2>
          {plan.stuck.map((s) => (
            <div key={s.key} class="mg-stuck">
              <span>
                {s.v && s.key !== "s:nobody" && <b>{s.v.s.name} </b>}
                {s.why}
              </span>
              {s.move && (
                <button type="button" class="btn small" onClick={() => setMoving(s.v)}>
                  Move
                </button>
              )}
            </div>
          ))}
          {plan.quiet.map((v) => (
            <div key={v.key} class="mg-quiet">
              <b>{v.s.name}</b> no mark for {mShort(v.quietMs ?? 0)}: go and check on him
            </div>
          ))}
        </>
      )}

      {plan.offApp.length > 0 && <p class="mg-foot">On paper (not in the app): {joinNames(plan.offApp.map((v) => v.s.name))}</p>}
      {plan.repeats.length > 0 && (
        <p class="mg-foot">
          Explained more than once today:{" "}
          {plan.repeats.slice(0, 5).map((r, i) => (
            <span key={r.key}>
              {i ? " · " : ""}
              <b>{r.label}</b> ×{r.times}
            </span>
          ))}
        </p>
      )}
      {awayList.length > 0 && (
        <p class="mg-foot">
          Not teaching today:{" "}
          {awayList.map((t, i) => (
            <span key={t.id}>
              {i ? ", " : ""}
              <button type="button" class="mg-link" onClick={() => setAway(t.id, false)}>
                {t.name} (bring back)
              </button>
            </span>
          ))}
        </p>
      )}

      {open && openEval && <EvalBack h={openEval} who={open.t.name} busy={busy} setBusy={setBusy} onClose={() => setSheet(null)} />}
      {open && openTheory && (
        <TheoryBack l={openTheory.l} st={openTheory.st} who={open.t.name} busy={busy} setBusy={setBusy} onClose={() => setSheet(null)} />
      )}
      {moving && <MoveSheet v={moving} onClose={() => setMoving(null)} />}
    </div>
  );
}

// ---------------- Pieces ----------------

function PersonBox(props: {
  p: PersonCard;
  now: number;
  busy: boolean;
  onBack: () => void;
  onOpen: (key: string) => void;
  onAway: (away: boolean) => void;
  onCancel: (ids: string[]) => void;
}) {
  const { p, now } = props;
  const jobs = p.t.jobs.map((j) => JOB_WORDS[j]).join(" · ");
  const withHer: { key: string; name: string; qs: string[]; job: Job }[] = [
    ...p.evalHere.map((h) => ({
      key: h.v.key,
      name: h.v.s.name,
      qs: h.kind === "theory" ? ["theory"] : h.qs.map((q) => String(q)),
      job: "evaluation" as Job,
    })),
    ...p.theory.flatMap((l) =>
      l.here.map((st) => ({
        key: st.v.key,
        name: st.v.s.name,
        qs: l.section ? [l.section.id] : [...st.qs.map(String), ...(st.whole ? ["All"] : [])],
        job: "theory" as Job,
      })),
    ),
  ];
  const free = withHer.length === 0 && p.coming.length === 0;
  const spent = p.since !== null ? now - p.since : 0;
  return (
    <div class={`mg-person${free ? " free" : ""}${p.over ? " over" : ""}${p.away ? " away" : ""}`}>
      <div class="mg-ph">
        <span class={`mg-dot ${p.t.jobs[0] ?? "evaluation"}`} aria-hidden="true" />
        <b class="mg-pn">{p.t.name}</b>
        <span class="mg-pj">{jobs}</span>
        <span class="mg-pt">
          {free
            ? "free"
            : p.since !== null
              ? [spent >= 60_000 ? mShort(spent) : "", p.leftMs ? `~${mShort(Math.max(60_000, p.leftMs))} left` : p.over ? "over" : ""].filter(Boolean).join(" · ") || "now"
              : "called"}
        </span>
      </div>
      {withHer.length > 0 && (
        <div class="mg-with">
          {withHer.map((w) => (
            <button key={w.key} type="button" class={`mg-sp j-${w.job}`} onClick={() => props.onOpen(w.key)} aria-label={`${w.name}: not everything done?`}>
              <b>{w.name}</b>
              <span>{w.qs.join(" ")}</span>
            </button>
          ))}
        </div>
      )}
      {p.coming.length > 0 && (
        <div class="mg-coming">
          Called from her phone: {joinNames(p.coming.map((rc) => rc.v?.s.name ?? "?"))}{" "}
          <button type="button" class="mg-link" onClick={() => props.onCancel(p.coming.map((rc) => rc.c._id))}>
            Cancel
          </button>
        </div>
      )}
      {withHer.length > 0 ? (
        <div class="mg-pacts">
          <button type="button" class="btn mg-back" disabled={props.busy} onClick={props.onBack}>
            Back ✓ {withHer.length > 1 ? `all ${withHer.length}` : ""}
          </button>
        </div>
      ) : (
        !p.away && (
          <div class="mg-pnext">
            <span>{p.next ? `Next: ${shortNames(p.next.who.map((w) => w.v.s.name))}` : "Nothing for her yet"}</span>
            <button type="button" class="mg-link" onClick={() => props.onAway(true)}>
              Not here today
            </button>
          </div>
        )
      )}
    </div>
  );
}

function CorrectionBox(props: { c: ReturnType<typeof managerPlan>["correction"]; now: number }) {
  const { c, now } = props;
  return (
    <div class={`mg-person mg-corr${c.red.length ? " red" : ""}`}>
      <div class="mg-ph">
        <span class="mg-dot correction" aria-hidden="true" />
        <b class="mg-pn">Correction</b>
        <span class="mg-pt">{c.levels ? `${c.levels} to correct` : "nothing waits"}</span>
      </div>
      {c.oldest && (
        <div class="mg-cl">
          Oldest: <b>{c.oldest.v.s.name}</b> L{c.oldest.n} · {mShort(now - c.oldest.since)}
        </div>
      )}
      {c.red.map((w) => (
        <div key={`${w.v.key}:${w.n}`} class="mg-cl mg-red">
          <b>{w.v.s.name}</b> has no work until L{w.n} is corrected · {mShort(now - w.since)}
        </div>
      ))}
    </div>
  );
}

function TaskCard(props: { t: SendTask; now: number; busy: boolean; onSend: () => void; onSnooze: () => void }) {
  const { t } = props;
  const shared = new Set(t.shared.map((s) => s.q));
  const v0 = t.who[0].v;
  const head = `${t.to?.name ?? ""}${t.swap ? ` (does ${JOB_WORDS[t.job]})` : ""}`;
  return (
    <div class={`mg-task h-${t.heat} j-${t.job}`}>
      <div class="mg-th">
        <span class="mg-job">{JOB_WORDS[t.job]}</span>
        <span class="mg-why">{t.why}</span>
      </div>
      <div class="mg-book">
        {bookWords(t.unit, v0)}
        {t.section ? ` · ${t.section} ${t.sectionTitle ?? ""}` : ` ${unitTa(t)}`}
      </div>
      <ul class="mg-who">
        {t.who.map((w) => (
          <li key={w.v.key} class={w.red ? "red" : ""}>
            <b class="mg-nm">{w.v.s.name}</b>
            <span class="mg-qs">
              {qsWords(t, w).map((q, i) => (
                <i key={`${q}${i}`} class={shared.has(w.qs[i]) ? "sh" : ""}>
                  {q}
                </i>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div class="mg-acts">
        <button type="button" class="btn ghost small" onClick={props.onSnooze}>
          Not now
        </button>
        {t.freeIn > 0 ? (
          // She is busy: this group is her next one. Sending now = they wait with her (call ahead).
          <button type="button" class={`btn ghost mg-send next ${t.job}`} disabled={props.busy || !t.to} onClick={props.onSend}>
            Next for {head}
            <small>free ~{mShort(Math.max(60_000, t.freeIn))}</small>
          </button>
        ) : (
          <button type="button" class={`btn mg-send ${t.job}`} disabled={props.busy || !t.to} onClick={props.onSend}>
            Send to {head}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------- Back, not everything ----------------

const EVAL_STEP: Record<string, Decision> = { x: "th", th: "skip", skip: "x" };
const EVAL_MARK: Record<Decision, string> = { x: "✓", th: "T", skip: "–" };

function EvalBack(props: { h: EvalHere; who: string; busy: boolean; setBusy: (b: boolean) => void; onClose: () => void }) {
  const { h } = props;
  const [dec, setDec] = useState<Record<number, Decision>>({});
  const pick = (q: number): Decision => dec[q] ?? "x";
  const save = async (nothing: boolean) => {
    props.setBusy(true);
    const { item, theoryQs } = nothing ? { item: { callId: h.rc.c._id, explained: [] as number[] }, theoryQs: [] as number[] } : backEval(h, dec);
    let ok = true;
    if (theoryQs.length) {
      ok = !!(await act(() =>
        mutate(api.workbook.toTheory, { studentId: h.v.s._id, unitId: h.v.unit?._id ?? h.v.s.unitId!, qs: theoryQs, on: true, by: BY }),
      ));
    }
    const res = ok ? await act(() => mutate(api.calls.finish, { items: [{ ...item, callId: item.callId as Id<"calls"> }], by: BY })) : undefined;
    props.setBusy(false);
    if (!res) return;
    tone("done");
    toast(`${h.v.s.name}: back to work.`);
    props.onClose();
  };
  return (
    <Sheet
      title={`${h.v.s.name} with ${props.who}`}
      sub="Tap a question: ✓ explained → T needs Theory → – not now (stays waiting)."
      onClose={props.onClose}
      foot={
        <div class="row-actions">
          <button type="button" class="btn ghost" disabled={props.busy} onClick={() => void save(true)}>
            Nothing explained
          </button>
          <button type="button" class="btn evaluation" disabled={props.busy} onClick={() => void save(false)}>
            Back to work
          </button>
        </div>
      }
    >
      <div class="mg-decs">
        {h.qs.length === 0 && <p class="muted">No questions left to explain in this book.</p>}
        {h.qs.map((q) => (
          <button key={q} type="button" class={`mg-dec d-${pick(q)}`} onClick={() => setDec({ ...dec, [q]: EVAL_STEP[pick(q)] })}>
            <b>{q}</b>
            <span>{EVAL_MARK[pick(q)]}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function TheoryBack(props: { l: RoomLesson; st: RoomStudent; who: string; busy: boolean; setBusy: (b: boolean) => void; onClose: () => void }) {
  const { l, st } = props;
  const qs = l.section ? st.teach : st.qs;
  const [off, setOff] = useState<Set<number>>(new Set());
  const [wholeOff, setWholeOff] = useState(false);
  const save = async (nothing: boolean) => {
    props.setBusy(true);
    const taught = new Set(nothing ? [] : qs.filter((q) => !off.has(q)));
    const { item, workbookTaught } = nothing
      ? { item: { callId: st.rc.c._id as string, taught: [] as number[], skip: [] as number[] }, workbookTaught: [] as number[] }
      : backTheory(l, st.v, st.rc.c._id, taught, !wholeOff);
    let ok = true;
    if (workbookTaught.length) {
      ok = !!(await act(() =>
        mutate(api.workbook.taught, { studentId: st.v.s._id, unitId: st.v.unit?._id ?? st.v.s.unitId!, qs: workbookTaught, on: true, by: BY }),
      ));
    }
    const res = ok ? await act(() => mutate(api.calls.finish, { items: [{ ...item, callId: item.callId as Id<"calls"> }], by: BY })) : undefined;
    props.setBusy(false);
    if (!res) return;
    tone("done");
    toast(`${st.v.s.name}: back to work.`);
    props.onClose();
  };
  const flip = (q: number) => {
    const next = new Set(off);
    if (next.has(q)) next.delete(q);
    else next.add(q);
    setOff(next);
  };
  return (
    <Sheet
      title={`${st.v.s.name} with ${props.who}`}
      sub="Tap what wasn't taught: it stays his, the lesson comes back."
      onClose={props.onClose}
      foot={
        <div class="row-actions">
          <button type="button" class="btn ghost" disabled={props.busy} onClick={() => void save(true)}>
            Nothing taught
          </button>
          <button type="button" class="btn theory" disabled={props.busy} onClick={() => void save(false)}>
            Back to work
          </button>
        </div>
      }
    >
      <div class="mg-decs">
        {qs.map((q) => (
          <button key={q} type="button" class={`mg-dec ${off.has(q) ? "d-skip" : "d-x"}`} onClick={() => flip(q)}>
            <b>{q}</b>
            <span>{off.has(q) ? "–" : "✓"}</span>
          </button>
        ))}
        {st.whole && (
          <button type="button" class={`mg-dec ${wholeOff ? "d-skip" : "d-x"}`} onClick={() => setWholeOff(!wholeOff)}>
            <b>All</b>
            <span>{wholeOff ? "–" : "✓"}</span>
          </button>
        )}
      </div>
    </Sheet>
  );
}
