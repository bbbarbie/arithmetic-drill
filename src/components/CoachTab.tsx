import { useState, type FormEvent } from "react";
import { useCoachSession } from "../hooks/useCoachSession.ts";
import type { Settings } from "../lib/settings.ts";
import type { SpeechSupport } from "../lib/speech/capabilities.ts";
import { formatClock } from "../lib/timer.ts";
import { phaseForElapsed } from "../lib/questionGen.ts";
import { Results } from "./Results.tsx";

const PHASE_LABEL = { 1: "Phase 1 · basic arithmetic", 2: "Phase 2 · products, fractions, decimals, percent", 3: "Phase 3 · probability & expected value" } as const;

interface Props {
  settings: Settings;
  support: SpeechSupport;
  onSettingsChange: (s: Settings) => void;
}

export function CoachTab({ settings, support, onSettingsChange }: Props) {
  const { view, start, pause, resume, stop, repeat, pass, submitTyped, recognizerCapabilities } = useCoachSession(settings);
  const [typed, setTyped] = useState("");
  const showText = settings.showQuestionText;
  const toggleText = () => onSettingsChange({ ...settings, showQuestionText: !showText });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!typed.trim()) return;
    submitTyped(typed.trim());
    setTyped("");
  };

  const running = view.status !== "idle" && view.status !== "finished";
  const canAnswer = view.status === "listening";
  const phase = phaseForElapsed(view.timer.elapsedMs);

  if (view.status === "finished" && view.summary) {
    return (
      <section className="panel">
        <Results summary={view.summary} />
        <div className="controls">
          <button className="primary" onClick={start}>Start another session</button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel coach">
      <div className="timer-row">
        <div className={`timer ${view.timer.remainingMs < 60_000 && running ? "urgent" : ""}`} aria-live="off">
          {formatClock(view.status === "idle" ? settings.sessionMinutes * 60_000 : view.timer.remainingMs)}
        </div>
        <div className="phase">{running ? PHASE_LABEL[phase] : "10-minute timed drill"}</div>
      </div>

      <div className="controls">
        {view.status === "idle" && <button className="primary" onClick={start}>Start</button>}
        {running && view.status !== "paused" && <button onClick={pause}>Pause</button>}
        {view.status === "paused" && <button className="primary" onClick={resume}>Resume</button>}
        {running && <button className="danger" onClick={stop}>Stop</button>}
        {running && view.status !== "paused" && (
          <>
            <button onClick={repeat} disabled={!view.question}>Repeat</button>
            <button onClick={pass} disabled={!view.question}>Pass</button>
          </>
        )}
        <button className="ghost" onClick={toggleText} aria-pressed={!showText} title="Hide the numbers and rely on hearing the question">
          {showText ? "Audio only: off" : "Audio only: on"}
        </button>
      </div>

      {view.autoPaused && <div className="banner info">Paused because the page was hidden. Press Resume to continue; the question will be read again.</div>}
      {view.speechError && <div className="banner warn">{view.speechError}</div>}

      {view.status === "idle" && (
        <div className="intro">
          <p>Questions are read aloud one at a time. Answer by voice or type below. Wrong answers get one retry; then the answer is shown.</p>
          <p className="muted">
            Speech recognition: {support.recognition ? recognizerCapabilities.name + " (audio may be sent to a vendor service)" : "not available — type your answers"}.
            Text-to-speech: {support.synthesis ? "available" : "not available"}.
          </p>
        </div>
      )}

      {view.question && (
        <div className="question-card">
          <div className="qmeta">
            Question {view.questionNumber} · {view.question.topic}
            {view.attempts > 0 && view.status === "listening" ? " · retry" : ""}
          </div>
          {showText ? (
            <div className="question">{view.question.prompt}</div>
          ) : (
            <div className="question hidden-text" aria-label="Question hidden; listen to the audio">
              🔊 Listen
            </div>
          )}
          <div className={`state ${view.status}`}>
            {view.status === "speaking" && "Speaking… (mic off)"}
            {view.status === "listening" && (view.listening ? "Listening for your answer" : "Waiting for microphone…")}
            {view.status === "feedback" && "…"}
            {view.status === "paused" && "Paused"}
          </div>
          {view.interim && <div className="interim">“{view.interim}”</div>}
          {view.lastHeard && !view.interim && <div className="heard">Heard: “{view.lastHeard}”</div>}
        </div>
      )}

      {view.feedback && (
        <div className={`feedback ${view.feedback.kind}`} role="status">
          <div className="fb-text">{view.feedback.text}</div>
          {view.feedback.answer && <div className="fb-answer">Answer: {view.feedback.answer}</div>}
          {view.feedback.method && <div className="fb-method">{view.feedback.method}</div>}
        </div>
      )}

      {running && view.status !== "paused" && (
        <form className="typed" onSubmit={onSubmit}>
          <input
            type="text"
            inputMode="decimal"
            placeholder={canAnswer ? "Type your answer (e.g. 182, 7/8, 0.875)" : "Wait for the question…"}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={!canAnswer}
            autoComplete="off"
          />
          <button type="submit" disabled={!canAnswer}>Submit</button>
        </form>
      )}
    </section>
  );
}
