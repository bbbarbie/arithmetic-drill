import { useEffect, useState } from "react";
import type { Settings } from "../lib/settings.ts";
import type { SpeechSupport } from "../lib/speech/capabilities.ts";
import { listAudioInputs } from "../lib/speech/capabilities.ts";
import { listVoices, ttsSupported } from "../lib/speech/tts.ts";

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  support: SpeechSupport;
}

export function SettingsPanel({ settings, onChange, support }: Props) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [micNote, setMicNote] = useState<string>("");

  useEffect(() => {
    if (!ttsSupported()) return;
    const load = () => setVoices(listVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  useEffect(() => {
    if (!support.enumerateDevices) return;
    listAudioInputs().then((list) => {
      setMics(list);
      if (list.length && !list[0].label) setMicNote("Device names appear after you grant microphone permission.");
    });
  }, [support.enumerateDevices]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });

  return (
    <section className="panel settings" aria-label="Settings">
      <div className="grid">
        <label>
          Difficulty
          <select value={settings.difficulty} onChange={(e) => set("difficulty", e.target.value as Settings["difficulty"])}>
            <option value="easy">Easy</option>
            <option value="standard">Standard</option>
            <option value="hard">Hard</option>
          </select>
        </label>

        <label>
          Session length (minutes)
          <input type="number" min={1} max={30} value={settings.sessionMinutes} onChange={(e) => set("sessionMinutes", Math.max(1, Math.min(30, Number(e.target.value) || 10)))} />
        </label>

        <label>
          Speaking speed: {settings.speechRate.toFixed(2)}×
          <input type="range" min={0.6} max={1.6} step={0.05} value={settings.speechRate} onChange={(e) => set("speechRate", Number(e.target.value))} />
        </label>

        <label>
          Voice
          <select value={settings.voiceURI} onChange={(e) => set("voiceURI", e.target.value)} disabled={!voices.length}>
            <option value="">Browser default</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </label>

        <label>
          Microphone
          <select value={settings.micDeviceId} onChange={(e) => set("micDeviceId", e.target.value)} disabled={!mics.length}>
            <option value="">System default</option>
            {mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label || `Microphone ${m.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
          <small>
            {micNote || "The browser speech recognizer always uses the system default input; this choice only applies to adapters that accept a device."}
          </small>
        </label>

        <label>
          End-of-utterance silence: {settings.utteranceEndMs} ms
          <input type="range" min={0} max={2500} step={100} value={settings.utteranceEndMs} onChange={(e) => set("utteranceEndMs", Number(e.target.value))} />
          <small>
            Client-side fallback: if interim text stops changing for this long, it is treated as final. The browser's own endpointing is not
            configurable and may fire first. 0 disables the fallback.
          </small>
        </label>

        <label className="check">
          <input type="checkbox" checked={settings.showQuestionText} onChange={(e) => set("showQuestionText", e.target.checked)} />
          Show the question on screen (off = audio only; use Repeat if you miss it)
        </label>

        <label className="check">
          <input type="checkbox" checked={settings.practiceReveal} onChange={(e) => set("practiceReveal", e.target.checked)} />
          Practice: show the correct answer after every submission (never before)
        </label>

        <label className="check">
          <input type="checkbox" checked={settings.llmEnabled} onChange={(e) => set("llmEnabled", e.target.checked)} />
          Answer Checker may use the server LLM for probability / wording the parser cannot handle
        </label>
      </div>
    </section>
  );
}
