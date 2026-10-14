import type { SessionSummary } from "../lib/coachSession.ts";

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "–");
const secs = (ms: number | null) => (ms === null ? "–" : `${(ms / 1000).toFixed(1)}s`);

export function Results({ summary }: { summary: SessionSummary }) {
  return (
    <div className="results">
      <h2>Session results</h2>
      <div className="stat-row">
        <div className="stat"><div className="big">{summary.asked}</div><div>asked</div></div>
        <div className="stat"><div className="big">{pct(summary.firstAttemptCorrect, summary.asked)}</div><div>first-attempt accuracy</div></div>
        <div className="stat"><div className="big">{summary.retries}</div><div>retries</div></div>
        <div className="stat"><div className="big">{summary.passes}</div><div>passes</div></div>
        <div className="stat"><div className="big">{secs(summary.avgResponseMs)}</div><div>avg response</div></div>
      </div>

      <h3>By topic</h3>
      <table>
        <thead>
          <tr><th>Topic</th><th>Asked</th><th>First try</th><th>Retries</th><th>Passes</th><th>Avg time</th></tr>
        </thead>
        <tbody>
          {summary.byTopic.map((t) => (
            <tr key={t.topic}>
              <td>{t.label}</td>
              <td>{t.asked}</td>
              <td>{t.firstAttemptCorrect} ({pct(t.firstAttemptCorrect, t.asked)})</td>
              <td>{t.retries}</td>
              <td>{t.passes}</td>
              <td>{secs(t.avgResponseMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Missed questions and quick methods</h3>
      {summary.missed.length === 0 ? (
        <p>None missed on the first attempt.</p>
      ) : (
        <ul className="missed">
          {summary.missed.map((r) => (
            <li key={r.question.id}>
              <div className="mq">{r.question.prompt} = <strong>{r.question.answer.toDisplay()}</strong></div>
              <div className="muted">
                {r.passed ? "Passed" : `You said: ${r.answers.join(" → ") || "(nothing)"}`}
                {r.responseTimeMs !== null ? ` · ${secs(r.responseTimeMs)}` : ""}
              </div>
              <div className="method">{r.question.method}</div>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">Response time is measured from the end of question playback to your first submission. Repeating a question restarts that window.</p>
    </div>
  );
}
