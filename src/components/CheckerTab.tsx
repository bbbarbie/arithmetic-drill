import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRecognizer } from "../hooks/useRecognizer.ts";
import { parseSpokenExpression, type ParseOutcome } from "../lib/expressionParser.ts";
import { fetchLlmStatus, solveWithLlm, type LlmStatus } from "../lib/llmClient.ts";
import type { Settings } from "../lib/settings.ts";
import type { SpeechSupport } from "../lib/speech/capabilities.ts";
import type { RecognitionResult } from "../lib/speech/types.ts";

interface Entry {
  id: number;
  transcript: string;
  expression: string;
  result: string;
  detail?: string;
  status: "ok" | "unclear" | "incomplete" | "llm" | "llm-pending" | "llm-error";
  parseMs: number;
  llmMs?: number;
}

let nextId = 1;

export function CheckerTab({ settings, support }: { settings: Settings; support: SpeechSupport }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [llm, setLlm] = useState<LlmStatus | null>(null);
  const [typed, setTyped] = useState("");
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const llmRef = useRef<LlmStatus | null>(null);
  llmRef.current = llm;

  useEffect(() => {
    fetchLlmStatus().then(setLlm);
  }, []);

  const handle = useCallback((transcript: string, receivedAt: number) => {
    const t0 = performance.now();
    const outcome: ParseOutcome = parseSpokenExpression(transcript);
    const parseMs = performance.now() - t0 + Math.max(0, t0 - receivedAt);

    if (outcome.kind === "no_expression") return; // filler, a lone number, or unrelated speech: stay silent
    const id = nextId++;

    if (outcome.kind === "ok") {
      const value = outcome.approximate ? `≈ ${outcome.value.toApproxDecimal(4)}` : outcome.value.toDisplay();
      const detail = outcome.ignoredWords.length ? `ignored: ${outcome.ignoredWords.join(", ")}` : undefined;
      push({ id, transcript, expression: outcome.expression, result: value, detail, status: "ok", parseMs });
      return;
    }
    if (outcome.kind === "incomplete") {
      push({ id, transcript, expression: outcome.expression ?? "", result: "Incomplete", detail: outcome.reason, status: "incomplete", parseMs });
      return;
    }

    const llmAllowed = settingsRef.current.llmEnabled && llmRef.current?.enabled;
    const wantsLlm = outcome.kind === "needs_llm" || (outcome.kind === "unclear" && outcome.unknownWords.length > 0);
    if (wantsLlm && llmAllowed) {
      push({ id, transcript, expression: outcome.kind === "needs_llm" ? "(sent to LLM)" : outcome.expression ?? "", result: "Thinking…", status: "llm-pending", parseMs });
      const t1 = performance.now();
      solveWithLlm(transcript)
        .then((a) => {
          const llmMs = performance.now() - t1;
          const detail = [a.assumptions.length ? `Assumptions: ${a.assumptions.join("; ")}` : "", `confidence: ${a.confidence}`, a.model ? `model: ${a.model}` : ""].filter(Boolean).join(" · ");
          update(id, { result: a.answer, detail, status: "llm", llmMs });
        })
        .catch((e: Error) => update(id, { result: "Unclear", detail: `LLM unavailable: ${e.message}`, status: "llm-error", llmMs: performance.now() - t1 }));
      return;
    }

    const reason = outcome.kind === "needs_llm" ? `${outcome.reason}; LLM is ${llmRef.current?.enabled ? "disabled in settings" : "not configured on the server"}` : outcome.reason;
    push({ id, transcript, expression: outcome.kind === "unclear" ? outcome.expression ?? "" : "", result: "Unclear", detail: reason, status: "unclear", parseMs });
  }, []);

  const push = (e: Entry) => setEntries((prev) => [e, ...prev].slice(0, 25));
  const update = (id: number, patch: Partial<Entry>) => setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const onFinal = useCallback((r: RecognitionResult) => handle(r.transcript, r.timestamp), [handle]);
  const rec = useRecognizer(onFinal);

  const toggleMic = () => {
    if (rec.active) rec.stop();
    else rec.start({ continuous: true, interimResults: true, lang: settings.lang, utteranceEndMs: settings.utteranceEndMs, deviceId: settings.micDeviceId || undefined });
  };

  const onTyped = (e: FormEvent) => {
    e.preventDefault();
    if (!typed.trim()) return;
    handle(typed.trim(), performance.now());
    setTyped("");
  };

  const latest = entries[0];

  return (
    <section className="panel checker">
      <div className="mic-row">
        <button className={rec.active ? "danger" : "primary"} onClick={toggleMic} disabled={!support.recognition}>
          {rec.active ? "Stop microphone" : "Start microphone"}
        </button>
        <div className={`indicator ${rec.active ? "on" : "off"}`} aria-live="polite">
          <span className="dot" /> {rec.active ? "Listening" : "Mic off"}
        </div>
        <div className="muted small">
          {rec.capabilities.name}
          {rec.capabilities.mayUseRemoteService ? " · audio may be sent to a vendor service" : ""} · silent mode: nothing is spoken or played
        </div>
      </div>

      {rec.error && <div className="banner warn">{rec.error.message}</div>}
      {llm && !llm.enabled && (
        <div className="banner info">
          LLM backend: {llm.provider === "unreachable" ? "API server not reachable (run `npm run dev`)" : "not configured (set LLM_PROVIDER and an API key in .env)"}. Arithmetic still works;
          probability questions will show “Unclear”.
        </div>
      )}

      <div className="live">
        <div className="label">Transcript</div>
        <div className="transcript">{rec.interim ? <em>{rec.interim}</em> : latest?.transcript ?? <span className="muted">Say a question, e.g. “thirteen times fourteen”</span>}</div>
        <div className="label">Expression</div>
        <div className="expression">{latest?.expression || "—"}</div>
        <div className="label">Result</div>
        <div className={`result ${latest?.status ?? ""}`}>{latest?.result ?? "—"}</div>
        {latest?.detail && <div className="muted small">{latest.detail}</div>}
        {latest && (
          <div className="muted small">
            parse {latest.parseMs.toFixed(1)} ms{latest.llmMs !== undefined ? ` · LLM ${(latest.llmMs / 1000).toFixed(2)} s` : ""} · measured in this browser; excludes recognizer delay
          </div>
        )}
      </div>

      <form className="typed" onSubmit={onTyped}>
        <input type="text" placeholder="Or type a question to test the parser" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        <button type="submit">Check</button>
      </form>

      {entries.length > 1 && (
        <details className="history">
          <summary>Recent ({entries.length})</summary>
          <ul>
            {entries.slice(1).map((e) => (
              <li key={e.id}>
                <span className="muted">“{e.transcript}”</span> → {e.expression || "—"} = <strong>{e.result}</strong>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
