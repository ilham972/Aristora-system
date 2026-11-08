// Settings → Roles (8 Nov 2026, his voice note: "create the dedicated role management page ... set the permissions ... a
// dedicated, personalized app for each teacher based on their role ... create the departments ... select for each
// teacher what permission they have, how the UI looks ... and build a preview mode"). The owner only.
// - Three departments (convex/lib/dept.ts): Fighter, Master, Management; each with its people, the lead first. Then
//   those in none (the app of before: Class, their jobs' pages, Us).
// - Tap someone: her department, lead or consultation teacher, her own app (the pages of her bottom bar, six at most,
//   in fixed places), Correction's two modes, the hall's powers, and the extras. The jobs follow from her pages (the
//   server adds what a page can't work without). Save works at once on her phone.
// - Preview: her app exactly as she sees it, on this phone, look only (src/store.ts startPreview; a banner with Exit).
// - The owner's own app: his pages only (he can always do everything).

import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  DEPT_NAMES,
  DEPTS,
  extrasFor,
  isTeachDept,
  jobsFor,
  MAX_PAGES,
  PAGE_HELP,
  PAGE_IDS,
  PAGE_LABEL,
  presetPages,
  type Dept,
  type PageId,
} from "../convex/lib/dept";
import { mutate } from "./backend";
import { useQuery } from "./live";
import { act, currentMe, startPreview, toast, type Extra, type Job } from "./store";
import { tone } from "./tones";
import { Sheet } from "./ui";

/** Someone as Settings → People and Roles get them (people.list). */
export type RolePerson = {
  _id: Id<"users">;
  name: string;
  role: "owner" | "teacher";
  tabs: Job[];
  can: Extra[];
  dept: Dept | null;
  lead: boolean;
  pages: PageId[] | null;
};

/** What each department is for (his words, 8 Nov 2026). */
export const DEPT_HELP: Record<Dept, string> = {
  fighter: "theory books: the lessons, the students with no work, the wrong answers of their own questions",
  master: "workbooks: lost marks and blanks, and the theory they need",
  management: "correction now; fees and books come later",
};

/** The extras the owner ticks himself (Photos and Consultation follow from her pages). */
const OWN_EXTRAS: { id: Extra; name: string; help: string }[] = [
  { id: "students", name: "Students", help: "add, rename, remove students" },
  { id: "books", name: "Books", help: "workbooks and unit names" },
  { id: "reports", name: "Reports and History", help: "end-of-class reports, the history, Progress" },
  { id: "feedback", name: "Feedback", help: "reads what students send from the family app" },
  { id: "community", name: "Community", help: "writes posts in the students' Us tab" },
];

/** "Fighter lead · Dashboard, Fighter, Correction, Teach, Consult, Us", or the app of before. */
export function roleWords(p: Pick<RolePerson, "dept" | "lead" | "pages">): string {
  const who = p.dept ? `${DEPT_NAMES[p.dept]}${isTeachDept(p.dept) ? (p.lead ? " lead" : " consultation") : ""}` : "";
  if (!p.pages) return who ? `${who} · the app of before` : "The app of before";
  const pages = PAGE_IDS.filter((x) => p.pages!.includes(x)).map((x) => PAGE_LABEL[x]).join(", ");
  return who ? `${who} · ${pages}` : pages;
}

export function Roles(props: { onClose: () => void }) {
  const list = useQuery<RolePerson[]>(api.people.list, {});
  const [open, setOpen] = useState<Id<"users"> | null>(null);
  const me = currentMe();
  if (!list) return <p class="muted settings-body">Loading…</p>;
  const teachers = list.filter((p) => p.role === "teacher");
  const owner = list.find((p) => p.role === "owner") ?? null;
  const person = open ? list.find((p) => p._id === open) : undefined;
  const none = teachers.filter((p) => !p.dept);
  return (
    <div class="settings-body roles">
      <p class="muted">
        Each teacher's own app: her department, the pages at the bottom of her phone, and what else she may do. <b>Preview</b> shows her app as she
        sees it. New teacher? Settings → People → Add a teacher.
      </p>
      {DEPTS.map((d) => {
        const ppl = teachers.filter((p) => p.dept === d).sort((a, b) => Number(b.lead) - Number(a.lead) || a.name.localeCompare(b.name));
        return (
          <section key={d} class={`role-dept rd-${d}`} aria-label={`${DEPT_NAMES[d]} department`}>
            <h3 class="role-h">
              {DEPT_NAMES[d]} department
              <small>{DEPT_HELP[d]}</small>
            </h3>
            {ppl.length === 0 ? (
              <p class="muted small role-empty">Nobody yet: tap a teacher below to put her here.</p>
            ) : (
              <ul class="role-list">
                {ppl.map((p) => (
                  <li key={p._id}>
                    <button type="button" class="role-p" onClick={() => setOpen(p._id)}>
                      <b>
                        {p.name}
                        {isTeachDept(p.dept) && <span class={`role-tag${p.lead ? " lead" : ""}`}>{p.lead ? "Lead" : "Consultation"}</span>}
                      </b>
                      <small>{roleWords(p)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {none.length > 0 && (
        <section class="role-dept rd-none" aria-label="Not in a department">
          <h3 class="role-h">
            Not in a department
            <small>tap to give each her department and her own app</small>
          </h3>
          <ul class="role-list">
            {none.map((p) => (
              <li key={p._id}>
                <button type="button" class="role-p" onClick={() => setOpen(p._id)}>
                  <b>{p.name}</b>
                  <small>{roleWords(p)}</small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {owner && (
        <section class="role-dept rd-owner" aria-label="Your own app">
          <h3 class="role-h">
            Your own app
            <small>the pages at the bottom of your phone (you can always do everything)</small>
          </h3>
          <ul class="role-list">
            <li>
              <button type="button" class="role-p" onClick={() => setOpen(owner._id)}>
                <b>
                  {owner.name}
                  {owner._id === me?._id && <span class="role-tag">You</span>}
                </b>
                <small>{roleWords(owner)}</small>
              </button>
            </li>
          </ul>
        </section>
      )}
      {person && <RoleSheet key={person._id} p={person} onClose={() => setOpen(null)} onPreview={props.onClose} />}
    </div>
  );
}

/** One person's role and app: department, lead, pages, Correction's modes, the hall, extras; Preview; Save. */
function RoleSheet(props: { p: RolePerson; onClose: () => void; onPreview: () => void }) {
  const p = props.p;
  const owner = p.role === "owner";
  const [dept, setDept] = useState<Dept | null>(p.dept);
  const [lead, setLead] = useState(p.lead);
  const [pages, setPages] = useState<PageId[]>(p.pages ?? presetPages(p.dept ?? undefined, p.lead));
  const [homework, setHomework] = useState(p.pages ? p.can.includes("photos") : true);
  const [klass, setKlass] = useState(p.pages ? p.tabs.includes("correction") : p.tabs.includes("correction") || !isTeachDept(p.dept));
  const [manager, setManager] = useState(p.tabs.includes("manager"));
  const [extras, setExtras] = useState<Extra[]>(p.can.filter((x) => OWN_EXTRAS.some((o) => o.id === x)));
  const [busy, setBusy] = useState(false);

  /** A department (and lead) picked: her pages start from its preset (she can change any). */
  const preset = (d: Dept | null, l: boolean) => {
    const next = presetPages(d ?? undefined, l);
    setPages(next);
    if (d === "management") {
      setKlass(true);
      setManager(true);
    } else if (isTeachDept(d)) {
      setKlass(l);
      setHomework(true);
      setManager(false);
    }
    toast(`Pages set for ${d ? `the ${DEPT_NAMES[d]} department${isTeachDept(d) ? (l ? "'s lead" : "'s consultation teacher") : ""}` : "someone in no department"}: change any below.`);
  };
  const pickDept = (d: Dept | null) => {
    if (d === dept) return;
    tone("tick");
    const l = isTeachDept(d) ? lead : false;
    setDept(d);
    setLead(l);
    preset(d, l);
  };
  const pickLead = (l: boolean) => {
    if (l === lead) return;
    tone("tick");
    setLead(l);
    preset(dept, l);
  };
  const togglePage = (x: PageId) => {
    const on = pages.includes(x);
    if (!on && pages.length >= MAX_PAGES) {
      toast(`${MAX_PAGES} pages at most: they must fit the phone. Untick one first.`, "error");
      return;
    }
    if (!on && ((x === "fighter" && dept === "master") || (x === "master" && dept === "fighter"))) {
      toast(`The ${PAGE_LABEL[x]} page is the ${PAGE_LABEL[x]} department's.`, "error");
      return;
    }
    tone("tick");
    setPages(on ? pages.filter((y) => y !== x) : PAGE_IDS.filter((y) => y === x || pages.includes(y)));
  };

  /** What she gets: her jobs (and extras) from her pages and the ticks. */
  const role = () => {
    const tabs = new Set<Job>(jobsFor(pages, manager));
    if (pages.includes("correction") && !klass) tabs.delete("correction");
    const can = new Set<Extra>([...extras, ...extrasFor(pages)]);
    if (pages.includes("correction") && !homework) can.delete("photos");
    if (pages.includes("correction") && !klass && !homework) tabs.add("correction");
    return { tabs: [...tabs], can: [...can] };
  };
  const save = async () => {
    if (pages.length === 0) return toast("Pick at least one page for her app.", "error");
    setBusy(true);
    const r = role();
    const res = await act(() =>
      mutate(api.people.setRole, {
        id: p._id,
        ...(dept ? { dept } : {}),
        lead: isTeachDept(dept) && lead,
        pages,
        tabs: r.tabs,
        can: r.can,
      }),
    );
    setBusy(false);
    if (res === undefined) return;
    tone("done");
    toast(owner ? "Your app is saved." : `${p.name}'s app is saved: her phone shows it now.`);
    props.onClose();
  };
  const reset = async () => {
    setBusy(true);
    const res = await act(() => mutate(api.people.setRole, { id: p._id, pages: [], tabs: p.tabs, can: p.can, reset: true }));
    setBusy(false);
    if (res === undefined) return;
    toast(`${p.name} has the app of before again.`);
    props.onClose();
  };
  const preview = () => {
    if (pages.length === 0) return toast("Pick at least one page first.", "error");
    const r = role();
    startPreview({
      _id: p._id,
      name: p.name,
      role: owner ? "owner" : "teacher",
      tabs: owner ? (["correction", "theory", "evaluation", "manager"] as Job[]) : r.tabs,
      can: owner ? (["students", "books", "reports", "feedback", "photos", "consult", "community"] as Extra[]) : r.can,
      ...(dept && !owner ? { dept } : {}),
      ...(isTeachDept(dept) && lead && !owner ? { lead: true } : {}),
      pages,
    });
    toast(`${p.name}'s app: look only. Exit is at the top.`);
    props.onClose();
    props.onPreview();
  };

  return (
    <Sheet
      title={owner ? "Your own app" : p.name}
      sub={owner ? "Only the pages: you can always do everything." : "Her department and her own app. Save works at once on her phone."}
      onClose={props.onClose}
      cls="role-sheet"
      foot={
        <div class="row-actions">
          <button type="button" class="btn ghost" disabled={busy} onClick={preview}>
            Preview
          </button>
          <button type="button" class="btn primary" disabled={busy} onClick={() => void save()}>
            Save
          </button>
        </div>
      }
    >
      {!owner && (
        <>
          <h3 class="block-title">Department</h3>
          <div class="segc plain role-seg" role="group" aria-label="Her department">
            {DEPTS.map((d) => (
              <button key={d} type="button" class={`segc-b${dept === d ? " on" : ""}`} aria-pressed={dept === d} onClick={() => pickDept(d)}>
                {DEPT_NAMES[d]}
              </button>
            ))}
            <button type="button" class={`segc-b${dept === null ? " on" : ""}`} aria-pressed={dept === null} onClick={() => pickDept(null)}>
              None
            </button>
          </div>
          {isTeachDept(dept) && (
            <div class="perm-list role-lead">
              <label class="perm">
                <input type="radio" name="lead" checked={lead} onChange={() => pickLead(true)} />
                <span>
                  Lead teacher
                  <small>walks from grade to grade; her department's consultation calls ring on her phone (she sends him)</small>
                </span>
              </label>
              <label class="perm">
                <input type="radio" name="lead" checked={!lead} onChange={() => pickLead(false)} />
                <span>
                  Consultation teacher
                  <small>sits in the consultation room: her department's Consultation page</small>
                </span>
              </label>
            </div>
          )}
        </>
      )}
      <h3 class="block-title">
        {owner ? "Your pages" : "Her app"} <small class="muted">({pages.length} of {MAX_PAGES} at most, in this order)</small>
      </h3>
      <div class="perm-list role-pages">
        {PAGE_IDS.map((x) => (
          <label key={x} class={`perm${(x === "fighter" && dept === "master") || (x === "master" && dept === "fighter") ? " off" : ""}`}>
            <input type="checkbox" checked={pages.includes(x)} onChange={() => togglePage(x)} />
            <span>
              {PAGE_LABEL[x]}
              <small>{PAGE_HELP[x]}</small>
            </span>
          </label>
        ))}
      </div>
      {!owner && pages.includes("correction") && (
        <>
          <h3 class="block-title">Correction</h3>
          <div class="perm-list">
            <label class="perm">
              <input type="checkbox" checked={homework} onChange={() => setHomework(!homework)} />
              <span>
                Homework
                <small>the photos students send from home</small>
              </span>
            </label>
            <label class="perm">
              <input type="checkbox" checked={klass} onChange={() => setKlass(!klass)} />
              <span>
                Class
                <small>papers in the hall, and signing students in</small>
              </span>
            </label>
          </div>
        </>
      )}
      {!owner && (
        <>
          <h3 class="block-title">Also</h3>
          <div class="perm-list">
            <label class="perm">
              <input type="checkbox" checked={manager} onChange={() => setManager(!manager)} />
              <span>
                Runs the hall
                <small>the Class tab's powers: sends any student to any teacher, marks teachers arrived and went</small>
              </span>
            </label>
            {OWN_EXTRAS.map((o) => (
              <label key={o.id} class="perm">
                <input type="checkbox" checked={extras.includes(o.id)} onChange={() => setExtras(extras.includes(o.id) ? extras.filter((y) => y !== o.id) : [...extras, o.id])} />
                <span>
                  {o.name}
                  <small>{o.help}</small>
                </span>
              </label>
            ))}
          </div>
        </>
      )}
      {p.pages && (
        <button type="button" class="link-btn role-reset" disabled={busy} onClick={() => void reset()}>
          {owner ? "Back to the app of before" : `Give ${p.name} the app of before`}
        </button>
      )}
    </Sheet>
  );
}
