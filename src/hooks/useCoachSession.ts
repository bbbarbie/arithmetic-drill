import { useCallback, useEffect, useRef, useState } from "react";
import { CountdownTimer, type TimerSnapshot } from "../lib/timer.ts";
import { generateQuestion, makeRng, phaseForElapsed, type Question } from "../lib/questionGen.ts";
import { checkAnswer } from "../lib/answerCheck.ts";
import { newRecord, summarize, type QuestionRecord, type SessionSummary } from "../lib/coachSession.ts";
import { cancelSpeech, speak, ttsSupported } from "../lib/speech/tts.ts";
import { useRecognizer } from "./useRecognizer.ts";
import { usePageHidden } from "./usePageVisibility.ts";
import type { Settings } from "../lib/settings.ts";
import type { RecognitionResult } from "../lib/speech/types.ts";

export type CoachStatus = "idle" | "speaking" | "listening" | "feedback" | "paused" | "finished";

export interface Feedback {
  kind: "correct" | "retry" | "reveal" | "pass";
  text: string;
  answer?: string;
  method?: string;
}

export interface CoachView {
  status: CoachStatus;
  timer: TimerSnapshot;
  question: Question | null;
  attempts: number;
  feedback: Feedback | null;
  lastHeard: string;
  interim: string;
  listening: boolean;
  speechError: string | null;
  autoPaused: boolean;
  questionNumber: number;
  summary: SessionSummary | null;
}

const EMPTY_TIMER: TimerSnapshot = { status: "idle", elapsedMs: 0, remainingMs: 0 };

export function useCoachSession(settings: Settings) {
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const timerRef = useRef<CountdownTimer | null>(null);
  const rngRef = useRef(makeRng(Date.now() >>> 0));
  const seenRef = useRef(new Set<string>());
  const currentRef = useRef<QuestionRecord | null>(null);
  const historyRef = useRef<QuestionRecord[]>([]);
  const answerWindowStartRef = useRef<number | null>(null);
  const runIdRef = useRef(0); // bumps on pause/stop so stale async continuations bail out
  const statusRef = useRef<CoachStatus>("idle");

  const [status, setStatusState] = useState<CoachStatus>("idle");
  const [timer, setTimer] = useState<TimerSnapshot>(EMPTY_TIMER);
  const [question, setQuestion] = useState<Question | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [lastHeard, setLastHeard] = useState("");
  const [autoPaused, setAutoPaused] = useState(false);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  const setStatus = (s: CoachStatus) => {
    statusRef.current = s;
    setStatusState(s);
  };

  // ---- recognition ----
  const submitRef = useRef<(text: string) => void>(() => {});
  const onFinal = useCallback((r: RecognitionResult) => {
    if (statusRef.current !== "listening") return; // never act on speech while we are talking
    submitRef.current(r.transcript);
  }, []);
  const rec = useRecognizer(onFinal);

  const startListening = useCallback(() => {
    rec.start({
      continuous: true,
      interimResults: true,
      lang: settingsRef.current.lang,
      utteranceEndMs: settingsRef.current.utteranceEndMs,
      deviceId: settingsRef.current.micDeviceId || undefined,
    });
  }, [rec]);

  // ---- timer ticking ----
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = timerRef.current;
      if (!t) return;
      const snap = t.tick(performance.now());
      setTimer(snap);
      if (snap.status === "finished" && statusRef.current !== "finished") finishRef.current();
    }, 200);
    return () => clearInterval(id);
  }, []);

  // ---- core flow ----
  const say = useCallback(async (text: string): Promise<boolean> => {
    const run = runIdRef.current;
    rec.abort(); // mic off while the app speaks
    if (ttsSupported()) await speak(text, { rate: settingsRef.current.speechRate, voiceURI: settingsRef.current.voiceURI || undefined, lang: settingsRef.current.lang });
    else await new Promise((r) => setTimeout(r, Math.min(4000, 400 + text.length * 40)));
    return run === runIdRef.current;
  }, [rec]);

  const askRef = useRef<(q: Question, isRepeat: boolean) => Promise<void>>(async () => {});
  const nextRef = useRef<() => void>(() => {});
  const finishRef = useRef<() => void>(() => {});

  askRef.current = async (q: Question, isRepeat: boolean) => {
    setStatus("speaking");
    if (!isRepeat) setFeedback(null);
    const ok = await say(q.spoken);
    if (!ok) return;
    answerWindowStartRef.current = performance.now();
    setStatus("listening");
    startListening();
  };

  nextRef.current = () => {
    const t = timerRef.current;
    if (!t || t.getStatus() !== "running") {
      finishRef.current();
      return;
    }
    const phase = phaseForElapsed(t.elapsed(performance.now()));
    const q = generateQuestion(phase, rngRef.current, settingsRef.current.difficulty, seenRef.current);
    const recd = newRecord(q);
    currentRef.current = recd;
    setQuestion(q);
    setAttempts(0);
    setLastHeard("");
    setQuestionNumber((n) => n + 1);
    void askRef.current(q, false);
  };

  finishRef.current = () => {
    runIdRef.current += 1;
    cancelSpeech();
    rec.abort();
    timerRef.current?.stop(performance.now());
    setTimer(timerRef.current?.snapshot(performance.now()) ?? EMPTY_TIMER);
    // A question that was asked but never answered or passed is not counted.
    currentRef.current = null;
    setStatus("finished");
    setSummary(summarize(historyRef.current));
  };

  const finalizeAndAdvance = useCallback(async (recd: QuestionRecord, fb: Feedback, spokenFeedback: string) => {
    historyRef.current = [...historyRef.current, recd];
    currentRef.current = null;
    setFeedback(fb);
    setStatus("feedback");
    const ok = await say(spokenFeedback);
    if (!ok) return;
    nextRef.current();
  }, [say]);

  submitRef.current = (text: string) => {
    const recd = currentRef.current;
    if (!recd || statusRef.current !== "listening") return;
    const now = performance.now();
    setLastHeard(text);
    recd.attempts += 1;
    recd.answers.push(text);
    if (recd.attempts === 1) recd.responseTimeMs = answerWindowStartRef.current !== null ? now - answerWindowStartRef.current : null;
    const q = recd.question;
    const result = checkAnswer(q.answer, text, q.tolerance, { acceptPercentForm: q.acceptPercentForm });
    setAttempts(recd.attempts);

    if (result.correct) {
      if (recd.attempts === 1) recd.firstAttemptCorrect = true;
      else recd.firstAttemptCorrect = false;
      recd.finalCorrect = true;
      const fb: Feedback = { kind: "correct", text: "Correct", answer: settingsRef.current.practiceReveal ? q.answer.toDisplay() : undefined };
      void finalizeAndAdvance(recd, fb, "Correct");
      return;
    }

    if (recd.attempts === 1) {
      recd.firstAttemptCorrect = false;
      const heard = result.parsed === null ? "I did not catch a number." : `I heard ${result.parsed.toDisplay()}.`;
      setFeedback({ kind: "retry", text: `${heard} Not quite — one more try.` });
      setStatus("speaking");
      void (async () => {
        const ok = await say(result.parsed === null ? "I didn't catch a number. Try again." : "Not quite. Try again.");
        if (!ok) return;
        setStatus("listening");
        startListening();
      })();
      return;
    }

    const fb: Feedback = { kind: "reveal", text: "Not quite.", answer: q.answer.toDisplay(), method: q.method };
    void finalizeAndAdvance(recd, fb, `The answer is ${q.answer.isInteger() ? q.answer.toString() : q.answer.toExactDecimal() ?? q.answer.toString()}.`);
  };

  // ---- public controls ----
  const start = useCallback(() => {
    const t = new CountdownTimer(settingsRef.current.sessionMinutes * 60_000);
    timerRef.current = t;
    historyRef.current = [];
    seenRef.current = new Set();
    rngRef.current = makeRng(Date.now() >>> 0);
    setSummary(null);
    setQuestionNumber(0);
    setFeedback(null);
    setAutoPaused(false);
    runIdRef.current += 1;
    t.start(performance.now());
    setTimer(t.snapshot(performance.now()));
    nextRef.current();
  }, []);

  const pause = useCallback((auto = false) => {
    const t = timerRef.current;
    if (!t || t.getStatus() !== "running") return;
    runIdRef.current += 1;
    cancelSpeech();
    rec.abort();
    t.pause(performance.now());
    setTimer(t.snapshot(performance.now()));
    setAutoPaused(auto);
    setStatus("paused");
  }, [rec]);

  const resume = useCallback(() => {
    const t = timerRef.current;
    if (!t || t.getStatus() !== "paused") return;
    t.resume(performance.now());
    setAutoPaused(false);
    const recd = currentRef.current;
    if (recd) void askRef.current(recd.question, true);
    else nextRef.current();
  }, []);

  const stop = useCallback(() => finishRef.current(), []);

  const repeat = useCallback(() => {
    const recd = currentRef.current;
    if (!recd || (statusRef.current !== "listening" && statusRef.current !== "speaking")) return;
    runIdRef.current += 1;
    cancelSpeech();
    void askRef.current(recd.question, true);
  }, []);

  const pass = useCallback(() => {
    const recd = currentRef.current;
    if (!recd || (statusRef.current !== "listening" && statusRef.current !== "speaking")) return;
    runIdRef.current += 1;
    cancelSpeech();
    recd.passed = true;
    recd.firstAttemptCorrect = false;
    const q = recd.question;
    const fb: Feedback = { kind: "pass", text: "Passed.", answer: q.answer.toDisplay(), method: q.method };
    void finalizeAndAdvance(recd, fb, `The answer is ${q.answer.isInteger() ? q.answer.toString() : q.answer.toExactDecimal() ?? q.answer.toString()}.`);
  }, [finalizeAndAdvance]);

  const submitTyped = useCallback((text: string) => {
    if (statusRef.current !== "listening") return;
    rec.abort();
    submitRef.current(text);
  }, [rec]);

  usePageHidden(() => {
    if (statusRef.current !== "idle" && statusRef.current !== "finished" && statusRef.current !== "paused") pause(true);
  });

  useEffect(() => () => {
    cancelSpeech();
  }, []);

  const view: CoachView = {
    status,
    timer,
    question,
    attempts,
    feedback,
    lastHeard,
    interim: rec.interim,
    listening: rec.active,
    speechError: rec.error?.message ?? null,
    autoPaused,
    questionNumber,
    summary,
  };

  return { view, start, pause: () => pause(false), resume, stop, repeat, pass, submitTyped, recognizerCapabilities: rec.capabilities };
}
