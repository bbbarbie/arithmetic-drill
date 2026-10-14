# Quant Drill

A local web app for 10-minute quantitative interview practice. Two modes:

- **Interview Coach** – a real 10-minute countdown. Questions are read aloud with browser text-to-speech, the mic listens for your answer (or you type it), answers are scored exactly, and a results screen shows accuracy by topic plus quick methods for anything you missed.
- **Answer Checker** – silent mode. Leave the mic on, say (or hear) a question like "thirteen times fourteen", and the parsed expression and result appear immediately. Nothing is ever spoken.

Stack: React + TypeScript + Vite, with a tiny Express server that holds the optional LLM key.

## Run it

```bash
npm install
cp .env.example .env      # optional; only needed for the LLM path
npm run dev               # web on http://localhost:5173, API on http://localhost:8787
```

Open http://localhost:5173 in Chrome, Edge, or Safari. Allow the microphone when prompted.

Other commands:

```bash
npm test                  # unit tests (vitest)
npm run build             # typecheck + production build into dist/
npm start                 # serve dist/ and the API from one process on :8787
```

## Optional LLM backend

Arithmetic never touches an LLM. The Answer Checker only calls the server when it hears probability / expected-value wording, or when the deterministic parser cannot make sense of the words. To enable that path:

```
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-5-5   # optional
```

The key stays in `.env` on the server. The provider is pluggable: implement `LlmProvider` in `server/llm.ts` and return it from `createProvider`. With the Anthropic provider, server-side refusal fallbacks are enabled by default (`fallbacks: "default"`) so a policy decline is retried on a fallback model inside the same request; remove those two lines if you don't want that. The server also exposes `/api/health` so the UI can show whether the LLM is configured.

With `LLM_PROVIDER=none` (the default) everything else works; probability questions in the checker show "Unclear".

## How it works

| Piece | Where |
|---|---|
| Exact rational arithmetic (bigint) | `src/lib/fraction.ts` |
| Spoken number words → numbers | `src/lib/numberWords.ts` |
| Spoken expression → tokens → evaluated result (no `eval`) | `src/lib/expressionParser.ts` |
| Answer parsing and tolerance checking | `src/lib/answerCheck.ts` |
| Phase-based question generator (seeded RNG) | `src/lib/questionGen.ts` |
| Pure countdown state machine | `src/lib/timer.ts` |
| Duplicate transcript filter | `src/lib/transcriptDedupe.ts` |
| Speech adapter interface + browser implementation + TTS | `src/lib/speech/` |
| Coach session orchestration | `src/hooks/useCoachSession.ts` |
| Express API + LLM provider | `server/` |

**Question schedule.** Minutes 0–2: three-digit addition/subtraction, easy multiplication and division. Minutes 2–7: mostly two-digit × two-digit, plus fractions, decimals, percentages. Minutes 7–10: arithmetic mixed with coin/dice probability and expected value of clearly specified bets.

**Answer checking.** Answers are compared as exact rationals. Integer answers must match exactly. Decimal, percentage, probability, and expected-value answers use an absolute tolerance of **0.005** (e.g. 0.33 is accepted for 1/3; 0.3 is not). Equivalent forms are accepted: `7/8`, `0.875`, "seven eighths", "seven over eight". For probabilities, "25 percent" or a bare "25" is accepted for 1/4.

**Flow per question.** Mic off → question spoken → mic on, response clock starts → you answer → "Correct" and next, or one retry, then the answer is revealed and the drill moves on. Repeat re-reads the question (and restarts the response clock); Pass reveals the answer and moves on. The **Practice** setting also shows the answer after a correct submission, never before you submit.

**Audio only.** The "Audio only" button in the coach (or the "Show the question on screen" setting) hides the question text so you have to work from what you hear, like a real phone screen. Repeat re-reads it. The answer reveal and results screen still show the numbers.

**Pause/resume.** Pausing stops the clock, cancels speech, and closes the mic. Resume re-reads the current question. The session auto-pauses when the tab is hidden because background timers are unreliable.

**Self-corrections.** "thirteen, sorry, fourteen times fifteen" → `14 × 15 = 210`. The parser drops everything back to the last token of the same kind as the one that follows the correction word.

**Silence rules in the checker.** A lone number, a bare "twenty percent", filler ("okay next question"), or a sentence with no numbers produces no output. "thirteen times" shows *Incomplete*. "thirteen fourteen" shows *Unclear* rather than guessing an operator. Up to two unrecognised words are ignored and listed; more than that is *Unclear*.

## Speech: what is actually supported

- The app checks for `SpeechRecognition`/`webkitSpeechRecognition`, `speechSynthesis`, and `mediaDevices` at startup and shows a banner for anything missing. Firefox has no speech recognition; typing still works everywhere.
- Browser speech recognition in Chrome/Edge/Safari sends audio to a vendor service. It is **not** offline and the UI says so.
- The adapter interface in `src/lib/speech/types.ts` lets you swap in a local or streaming recognizer later; the hook only depends on that interface.
- Microphone is closed while the app speaks, so it cannot answer its own questions. Recognition results that arrive outside the listening window are discarded.
- **End-of-utterance timing.** The Web Speech API does not let a page configure its endpointing, and no prompt can change it. The "End-of-utterance silence" setting is a client-side fallback: when interim text stops changing for N ms, the app treats it as final. The browser's own final may land first and is de-duplicated.
- Microphone denial, no device, network errors, and recognizer disconnects are surfaced in the UI; disconnects auto-restart with backoff while listening is wanted.
- **Device selection** is listed in settings, but the browser recognizer always uses the system default input. The setting only applies to adapters that take a device id.
- The app captures only what reaches your microphone. It does not hear other apps or tabs. No raw audio is recorded or stored.

## Testing status

Automated (`npm test`, 52 tests, all passing):

- spoken number and expression parsing, including the five examples from the brief and self-corrections;
- exact rational arithmetic, answer equivalence, and the 0.005 tolerance;
- question generation (phase mapping, topic mix, every generated arithmetic prompt re-evaluates to its stored answer, no repeats, seeded reproducibility);
- timer start/pause/resume/stop and clamping;
- duplicate and re-emitted transcript handling;
- LLM response parsing fallback.

`npm run build` (typecheck + Vite production build) passes. The API server was smoke-tested with curl (`/api/health`, `/api/solve` with and without a provider).

**Requires manual browser testing** (not covered by automation):

- actual microphone recognition quality, latency, and endpointing behaviour in your browser;
- text-to-speech voices and the mic-off-while-speaking handoff;
- microphone permission denial flow;
- the hidden-tab auto-pause;
- the LLM path with a real key.

Latency shown in the checker is measured in-browser from the final recognition event to the displayed result (and separately for the LLM round trip). It excludes the recognizer's own delay, which the page cannot observe. No noise-robustness claims are made.

## Limitations

- Browser recognition is cloud-backed and English-only as configured (`lang` default `en-US`).
- The parser handles arithmetic phrasing, percentages, fractions, powers, and square roots. Word problems, "what percent of X is Y", and "subtract A from B" are deliberately routed to *Unclear* or the LLM rather than guessed.
- Probability/expected-value answers in the checker come from the LLM and can be wrong; the UI shows its stated confidence and assumptions.
- Settings persist in `localStorage`; session results are not saved.
