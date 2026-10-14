import { describe, it, expect } from "vitest";
import { TranscriptDeduper } from "../src/lib/transcriptDedupe.ts";

describe("TranscriptDeduper", () => {
  it("drops an identical transcript repeated within the window", () => {
    const d = new TranscriptDeduper(4000);
    expect(d.accept({ text: "thirteen times fourteen", timestamp: 0 })).toBe(true);
    expect(d.accept({ text: "Thirteen times fourteen.", timestamp: 800 })).toBe(false);
    expect(d.accept({ text: "thirteen times fourteen", timestamp: 3000 })).toBe(false);
  });
  it("accepts the same text again after the window", () => {
    const d = new TranscriptDeduper(4000);
    expect(d.accept({ text: "13 x 14", timestamp: 0 })).toBe(true);
    expect(d.accept({ text: "13 x 14", timestamp: 5000 })).toBe(true);
  });
  it("accepts different text immediately", () => {
    const d = new TranscriptDeduper(4000);
    expect(d.accept({ text: "thirteen times fourteen", timestamp: 0 })).toBe(true);
    expect(d.accept({ text: "fifteen times sixteen", timestamp: 100 })).toBe(true);
  });
  it("drops a re-emitted final that doubles the previous one", () => {
    const d = new TranscriptDeduper(4000);
    expect(d.accept({ text: "twelve plus one", timestamp: 0 })).toBe(true);
    expect(d.accept({ text: "twelve plus one twelve plus one", timestamp: 300 })).toBe(false);
  });
  it("ignores empty transcripts and can reset", () => {
    const d = new TranscriptDeduper();
    expect(d.accept({ text: "   ", timestamp: 0 })).toBe(false);
    expect(d.accept({ text: "five", timestamp: 0 })).toBe(true);
    d.reset();
    expect(d.accept({ text: "five", timestamp: 10 })).toBe(true);
  });
});
