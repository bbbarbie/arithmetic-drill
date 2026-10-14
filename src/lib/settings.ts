import type { Difficulty } from "./questionGen.ts";

export interface Settings {
  difficulty: Difficulty;
  speechRate: number;
  voiceURI: string;
  micDeviceId: string;
  /** Client-side silence (ms) before an interim result is treated as final. 0 = browser endpointing only. */
  utteranceEndMs: number;
  /** Show the question text on screen. Off = audio only (hear it, don't read it). */
  showQuestionText: boolean;
  /** Practice option: also reveal the correct answer after a correct submission. */
  practiceReveal: boolean;
  /** Allow the Answer Checker to call the server-side LLM for non-arithmetic questions. */
  llmEnabled: boolean;
  lang: string;
  sessionMinutes: number;
}

export const DEFAULT_SETTINGS: Settings = {
  difficulty: "standard",
  speechRate: 1,
  voiceURI: "",
  micDeviceId: "",
  utteranceEndMs: 900,
  showQuestionText: true,
  practiceReveal: false,
  llmEnabled: true,
  lang: "en-US",
  sessionMinutes: 10,
};

const KEY = "quant-drill-settings-v1";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
