export type Report = {
  startedAt: number;
  endedAt: number;
  minutes: number;
  idleMin: number;
  idleTheoryMin: number;
  idleEvalMin: number;
  idleCorrMin?: number;
  master?: { levels: number; pct: number | null; avgWaitMin: number | null; maxWaitMin: number | null };
  marks: { right: number; wrong: number; slip: number };
  wrongRate: number | null;
  theory: { sittings: number; students: number; avgMin: number | null; maxMin: number | null };
  evaluation: { sittings: number; students: number; avgMin: number | null; maxMin: number | null; explained: number };
  students: {
    name: string;
    idleMin: number;
    idleTheoryMin: number;
    idleEvalMin: number;
    idleCorrMin?: number;
    right: number;
    wrong: number;
    slip: number;
  }[];
};

const n1 = (x: number | null) => (x === null ? "–" : Number.isInteger(x) ? String(x) : x.toFixed(1));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function ReportView(props: { report: Report }) {
  const r = props.report;
  const date = new Date(r.startedAt).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const idleStudents = r.students.filter((s) => s.idleMin > 0);
  return (
    <div class="report">
      <p class="muted">
        {date}, {r.minutes} minutes
      </p>
      <div class={`report-hero ${r.idleMin < 1 ? "good" : r.idleMin <= 10 ? "ok" : "bad"}`}>
        <strong>{n1(r.idleMin)}</strong>
        <span>minutes students sat with nothing to do</span>
      </div>
      <p class="report-split">
        Waiting for theory: <b>{n1(r.idleTheoryMin)} min</b>. Waiting for evaluation: <b>{n1(r.idleEvalMin)} min</b>.
        {r.idleCorrMin ? (
          <>
            {" "}
            Waiting for correction: <b>{n1(r.idleCorrMin)} min</b>.
          </>
        ) : null}
      </p>

      <table class="report-table">
        <tbody>
          <tr>
            <th scope="row">Theory sittings</th>
            <td>
              {r.theory.sittings} ({plural(r.theory.students, "student", "students")}), average {n1(r.theory.avgMin)} min, longest{" "}
              {n1(r.theory.maxMin)} min
            </td>
          </tr>
          <tr>
            <th scope="row">Evaluation sittings</th>
            <td>
              {r.evaluation.sittings} ({plural(r.evaluation.students, "student", "students")}), average {n1(r.evaluation.avgMin)}{" "}
              min, {plural(r.evaluation.explained, "answer", "answers")} explained
            </td>
          </tr>
          <tr>
            <th scope="row">Answers marked</th>
            <td>
              {r.marks.right} right, {r.marks.wrong} wrong, {plural(r.marks.slip, "slip", "slips")}
              {r.wrongRate !== null && <> ({r.wrongRate}% wrong)</>}
            </td>
          </tr>
          {r.master && r.master.levels > 0 && (
            <tr>
              <th scope="row">Workbook levels</th>
              <td>
                {plural(r.master.levels, "level", "levels")} corrected, {r.master.pct}% of the marks; waited for correction{" "}
                {n1(r.master.avgWaitMin)} min on average, longest {n1(r.master.maxWaitMin)} min
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {idleStudents.length > 0 && (
        <>
          <h3 class="block-title">Who waited</h3>
          <ul class="report-list">
            {idleStudents.map((s) => (
              <li key={s.name}>
                <span>{s.name}</span>
                <span>
                  {n1(s.idleMin)} min
                  <small>
                    {s.idleTheoryMin > 0 && ` theory ${n1(s.idleTheoryMin)}`}
                    {s.idleEvalMin > 0 && ` evaluation ${n1(s.idleEvalMin)}`}
                    {(s.idleCorrMin ?? 0) > 0 && ` correction ${n1(s.idleCorrMin ?? 0)}`}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
