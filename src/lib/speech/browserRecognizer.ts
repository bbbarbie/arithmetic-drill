import { getSpeechRecognitionCtor } from "./capabilities.ts";
import type { RecognitionErrorCode, RecognitionResult, RecognizerOptions, SpeechRecognizer } from "./types.ts";

/**
 * Web Speech API adapter.
 *
 * Honest notes:
 * - In Chrome/Edge/Safari the audio is typically sent to a vendor service; it
 *   is NOT an offline recognizer.
 * - The API does not expose end-of-utterance timing. `utteranceEndMs` here is
 *   a client-side fallback: if interim text stops changing for that long we
 *   emit a synthetic final so the app can respond sooner than the browser's
 *   own endpointing. The browser's own final may still arrive later and is
 *   de-duplicated downstream.
 * - Device selection is not supported by this API (it uses the system default).
 * - Chrome ends continuous sessions after ~60s or on silence; we auto-restart
 *   while the user wants to listen.
 */
export class BrowserSpeechRecognizer implements SpeechRecognizer {
  readonly capabilities = {
    name: "Browser Web Speech API",
    mayUseRemoteService: true,
    supportsEndpointingConfig: false,
    supportsDeviceSelection: false,
    supportsContinuous: true,
    supportsInterimResults: true,
  };

  private rec: SpeechRecognition | null = null;
  private wantActive = false;
  private active = false;
  private opts: RecognizerOptions | null = null;
  private resultCbs = new Set<(r: RecognitionResult) => void>();
  private errorCbs = new Set<(code: RecognitionErrorCode, message: string) => void>();
  private stateCbs = new Set<(active: boolean) => void>();
  private restartTimer: number | null = null;
  private restartDelay = 250;
  private silenceTimer: number | null = null;
  private lastInterim = "";
  private lastInterimEmittedAsFinal = "";

  start(opts: RecognizerOptions): void {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      this.emitError("unsupported", "Speech recognition is not available in this browser.");
      return;
    }
    this.opts = opts;
    this.wantActive = true;
    this.restartDelay = 250;
    this.spawn(Ctor);
  }

  private spawn(Ctor: new () => SpeechRecognition): void {
    if (!this.opts) return;
    this.cleanupRec();
    const rec = new Ctor();
    rec.continuous = this.opts.continuous;
    rec.interimResults = this.opts.interimResults;
    rec.lang = this.opts.lang;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      this.active = true;
      this.restartDelay = 250;
      this.stateCbs.forEach((cb) => cb(true));
    };
    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const now = performance.now();
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const alt = res[0];
        if (res.isFinal) {
          this.clearSilenceTimer();
          const text = alt.transcript.trim();
          // Skip if we already emitted this exact text as a synthetic final.
          if (text && text !== this.lastInterimEmittedAsFinal) {
            this.emit({ transcript: text, isFinal: true, confidence: Number.isFinite(alt.confidence) ? alt.confidence : null, timestamp: now });
          }
          this.lastInterim = "";
          this.lastInterimEmittedAsFinal = "";
        } else {
          interim += alt.transcript;
        }
      }
      interim = interim.trim();
      if (interim) {
        this.emit({ transcript: interim, isFinal: false, confidence: null, timestamp: now });
        if (interim !== this.lastInterim) {
          this.lastInterim = interim;
          this.armSilenceTimer();
        }
      }
    };
    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      const code = mapError(ev.error);
      if (code === "no-speech" || code === "aborted") return; // routine; onend handles restart
      this.emitError(code, describeError(code, ev.message));
      if (code === "not-allowed" || code === "audio-capture" || code === "unsupported") this.wantActive = false;
    };
    rec.onend = () => {
      this.active = false;
      this.clearSilenceTimer();
      this.stateCbs.forEach((cb) => cb(false));
      if (this.wantActive) {
        // Recognizer disconnected (silence timeout, network, 60s cap). Restart with backoff.
        this.restartTimer = window.setTimeout(() => {
          this.restartTimer = null;
          if (this.wantActive) this.spawn(Ctor);
        }, this.restartDelay);
        this.restartDelay = Math.min(this.restartDelay * 2, 4000);
      }
    };
    this.rec = rec;
    try {
      rec.start();
    } catch (e) {
      this.emitError("unknown", e instanceof Error ? e.message : "Failed to start recognition");
    }
  }

  private armSilenceTimer(): void {
    this.clearSilenceTimer();
    const ms = this.opts?.utteranceEndMs;
    if (!ms || ms <= 0) return;
    this.silenceTimer = window.setTimeout(() => {
      this.silenceTimer = null;
      const text = this.lastInterim.trim();
      if (text && text !== this.lastInterimEmittedAsFinal) {
        this.lastInterimEmittedAsFinal = text;
        this.emit({ transcript: text, isFinal: true, confidence: null, timestamp: performance.now() });
      }
    }, ms);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer !== null) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private cleanupRec(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.rec) {
      this.rec.onstart = null;
      this.rec.onresult = null;
      this.rec.onerror = null;
      this.rec.onend = null;
      try {
        this.rec.abort();
      } catch {
        /* ignore */
      }
      this.rec = null;
    }
    if (this.active) {
      this.active = false;
      this.stateCbs.forEach((cb) => cb(false));
    }
  }

  stop(): void {
    this.wantActive = false;
    this.clearSilenceTimer();
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    try {
      this.rec?.stop();
    } catch {
      /* ignore */
    }
  }

  abort(): void {
    this.wantActive = false;
    this.clearSilenceTimer();
    this.cleanupRec();
    this.lastInterim = "";
    this.lastInterimEmittedAsFinal = "";
  }

  isActive(): boolean {
    return this.active;
  }

  onResult(cb: (r: RecognitionResult) => void): () => void {
    this.resultCbs.add(cb);
    return () => this.resultCbs.delete(cb);
  }
  onError(cb: (code: RecognitionErrorCode, message: string) => void): () => void {
    this.errorCbs.add(cb);
    return () => this.errorCbs.delete(cb);
  }
  onStateChange(cb: (active: boolean) => void): () => void {
    this.stateCbs.add(cb);
    return () => this.stateCbs.delete(cb);
  }

  private emit(r: RecognitionResult): void {
    this.resultCbs.forEach((cb) => cb(r));
  }
  private emitError(code: RecognitionErrorCode, message: string): void {
    this.errorCbs.forEach((cb) => cb(code, message));
  }
}

function mapError(err: string): RecognitionErrorCode {
  switch (err) {
    case "not-allowed":
    case "service-not-allowed":
      return "not-allowed";
    case "no-speech":
      return "no-speech";
    case "audio-capture":
      return "audio-capture";
    case "network":
      return "network";
    case "aborted":
      return "aborted";
    default:
      return "unknown";
  }
}

function describeError(code: RecognitionErrorCode, detail?: string): string {
  switch (code) {
    case "not-allowed":
      return "Microphone access was denied. Allow the microphone for this site and press Start again. You can still type answers.";
    case "audio-capture":
      return "No microphone was found. Connect one or type your answers.";
    case "network":
      return "The recognition service could not be reached (browser recognition uses a remote service). Retrying…";
    case "unsupported":
      return "Speech recognition is not supported in this browser. Chrome, Edge, or Safari are recommended. Typing still works.";
    default:
      return detail || "Speech recognition error.";
  }
}
