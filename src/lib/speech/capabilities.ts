export interface SpeechSupport {
  recognition: boolean;
  recognitionVendorPrefixed: boolean;
  synthesis: boolean;
  mediaDevices: boolean;
  enumerateDevices: boolean;
  secureContext: boolean;
}

type SRConstructor = new () => SpeechRecognition;

export function getSpeechRecognitionCtor(): SRConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function detectSpeechSupport(): SpeechSupport {
  if (typeof window === "undefined") {
    return { recognition: false, recognitionVendorPrefixed: false, synthesis: false, mediaDevices: false, enumerateDevices: false, secureContext: false };
  }
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return {
    recognition: !!(w.SpeechRecognition ?? w.webkitSpeechRecognition),
    recognitionVendorPrefixed: !w.SpeechRecognition && !!w.webkitSpeechRecognition,
    synthesis: "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance !== "undefined",
    mediaDevices: !!navigator.mediaDevices?.getUserMedia,
    enumerateDevices: !!navigator.mediaDevices?.enumerateDevices,
    secureContext: window.isSecureContext,
  };
}

export async function listAudioInputs(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "audioinput");
}
