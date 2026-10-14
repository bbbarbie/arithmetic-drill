/**
 * Browser text-to-speech wrapper. Resolves when the utterance ends (or on a
 * length-based safety timeout, because some browsers drop the `end` event).
 */
export interface SpeakOptions {
  rate: number; // 0.5 .. 2
  voiceURI?: string;
  lang?: string;
}

let current: SpeechSynthesisUtterance | null = null;

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  return window.speechSynthesis.getVoices();
}

export function cancelSpeech(): void {
  if (!ttsSupported()) return;
  current = null;
  window.speechSynthesis.cancel();
}

export function speak(text: string, opts: SpeakOptions): Promise<void> {
  if (!ttsSupported()) return Promise.resolve();
  cancelSpeech();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = Math.min(2, Math.max(0.5, opts.rate));
    if (opts.lang) u.lang = opts.lang;
    if (opts.voiceURI) {
      const v = listVoices().find((x) => x.voiceURI === opts.voiceURI);
      if (v) u.voice = v;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (current === u) current = null;
      clearTimeout(safety);
      resolve();
    };
    // ~ 12 chars per second at rate 1 plus a margin; guards against missing `end` events.
    const estimateMs = (text.length / 12) * 1000 / u.rate + 1500;
    const safety = window.setTimeout(finish, estimateMs + 2000);
    u.onend = finish;
    u.onerror = finish;
    current = u;
    window.speechSynthesis.speak(u);
  });
}

export function isSpeaking(): boolean {
  return ttsSupported() && (window.speechSynthesis.speaking || current !== null);
}
