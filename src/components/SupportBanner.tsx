import type { SpeechSupport } from "../lib/speech/capabilities.ts";

export function SupportBanner({ support }: { support: SpeechSupport }) {
  const problems: string[] = [];
  if (!support.secureContext) problems.push("This page is not a secure context (use localhost or https), so the microphone will be blocked.");
  if (!support.recognition) problems.push("Speech recognition is not available in this browser. Chrome, Edge, or Safari are recommended. You can still type answers.");
  if (!support.synthesis) problems.push("Text-to-speech is not available; questions will be shown on screen only.");
  if (problems.length === 0) return null;
  return (
    <div className="banner warn" role="status">
      {problems.map((p) => (
        <div key={p}>{p}</div>
      ))}
    </div>
  );
}
