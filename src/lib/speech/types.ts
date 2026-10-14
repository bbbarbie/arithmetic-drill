/**
 * Speech adapter contract. The browser Web Speech API implementation is the
 * default; a local or streaming recognizer can implement the same interface.
 */
export interface RecognitionResult {
  transcript: string;
  isFinal: boolean;
  confidence: number | null;
  /** performance.now() when the result event fired. */
  timestamp: number;
}

export type RecognitionErrorCode =
  | "not-allowed" // microphone permission denied
  | "no-speech"
  | "audio-capture" // no microphone found
  | "network"
  | "aborted"
  | "unsupported"
  | "unknown";

export interface RecognizerCapabilities {
  /** Human-readable name, e.g. "Browser Web Speech API". */
  name: string;
  /** Whether audio may be sent to a remote service. The browser API usually does. */
  mayUseRemoteService: boolean;
  /** Whether the adapter honours `utteranceEndMs` natively. */
  supportsEndpointingConfig: boolean;
  /** Whether a specific input device can be selected. */
  supportsDeviceSelection: boolean;
  supportsContinuous: boolean;
  supportsInterimResults: boolean;
}

export interface RecognizerOptions {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  /**
   * Silence (ms) after the last interim change before the adapter emits a
   * synthetic final. Only used if the adapter supports it (see capabilities);
   * the browser API's own endpointing cannot be configured and is applied first.
   */
  utteranceEndMs?: number;
  deviceId?: string;
}

export interface SpeechRecognizer {
  readonly capabilities: RecognizerCapabilities;
  start(opts: RecognizerOptions): void;
  stop(): void;
  abort(): void;
  isActive(): boolean;
  onResult(cb: (r: RecognitionResult) => void): () => void;
  onError(cb: (code: RecognitionErrorCode, message: string) => void): () => void;
  onStateChange(cb: (active: boolean) => void): () => void;
}
