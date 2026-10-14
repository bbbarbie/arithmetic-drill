import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserSpeechRecognizer } from "../lib/speech/browserRecognizer.ts";
import type { RecognitionErrorCode, RecognitionResult, RecognizerOptions, SpeechRecognizer } from "../lib/speech/types.ts";
import { TranscriptDeduper } from "../lib/transcriptDedupe.ts";

export interface RecognizerState {
  active: boolean;
  interim: string;
  error: { code: RecognitionErrorCode; message: string } | null;
}

/**
 * Owns one recognizer instance. Final results are de-duplicated and handed to
 * `onFinal`; interim text is exposed for display. The adapter is swappable by
 * passing a factory.
 */
const defaultFactory = (): SpeechRecognizer => new BrowserSpeechRecognizer();

export function useRecognizer(onFinal: (r: RecognitionResult) => void, factory: () => SpeechRecognizer = defaultFactory) {
  const recognizer = useMemo(factory, [factory]);
  const deduper = useMemo(() => new TranscriptDeduper(4000), []);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;
  const [state, setState] = useState<RecognizerState>({ active: false, interim: "", error: null });

  useEffect(() => {
    const offResult = recognizer.onResult((r) => {
      if (r.isFinal) {
        setState((s) => ({ ...s, interim: "" }));
        if (deduper.accept({ text: r.transcript, timestamp: r.timestamp })) onFinalRef.current(r);
      } else {
        setState((s) => ({ ...s, interim: r.transcript }));
      }
    });
    const offError = recognizer.onError((code, message) => setState((s) => ({ ...s, error: { code, message } })));
    const offState = recognizer.onStateChange((active) => setState((s) => ({ ...s, active, interim: active ? s.interim : "" })));
    return () => {
      offResult();
      offError();
      offState();
      recognizer.abort();
    };
  }, [recognizer, deduper]);

  const start = useCallback(
    (opts: RecognizerOptions) => {
      setState((s) => ({ ...s, error: null }));
      deduper.reset();
      recognizer.start(opts);
    },
    [recognizer, deduper],
  );
  const stop = useCallback(() => recognizer.stop(), [recognizer]);
  const abort = useCallback(() => recognizer.abort(), [recognizer]);
  const clearError = useCallback(() => setState((s) => ({ ...s, error: null })), []);

  return { ...state, capabilities: recognizer.capabilities, start, stop, abort, clearError };
}
