/**
 * Filters duplicate / overlapping recognition results. Browser recognizers
 * commonly emit the same final transcript twice, or re-emit a final that is
 * a superset of the previous one when a session restarts.
 */
export interface TranscriptEvent {
  text: string;
  timestamp: number; // ms
}

export function normalizeTranscript(text: string): string {
  return text
    .toLowerCase()
    .replace(/\.(?!\d)/g, " ")
    .replace(/[^a-z0-9 ./%-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export class TranscriptDeduper {
  private last: { norm: string; timestamp: number } | null = null;

  constructor(private windowMs = 4000) {}

  /** Returns true if the event should be processed, false if it is a duplicate. */
  accept(ev: TranscriptEvent): boolean {
    const norm = normalizeTranscript(ev.text);
    if (!norm) return false;
    const prev = this.last;
    if (prev && ev.timestamp - prev.timestamp <= this.windowMs) {
      if (norm === prev.norm) return false;
      // Re-emitted final that only repeats the previous one with extra leading/trailing copy
      if (norm.startsWith(prev.norm + " " + prev.norm)) return false;
    }
    this.last = { norm, timestamp: ev.timestamp };
    return true;
  }

  reset(): void {
    this.last = null;
  }
}
